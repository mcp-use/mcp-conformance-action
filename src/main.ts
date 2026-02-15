import * as core from '@actions/core';
import * as github from '@actions/github';
import artifact from '@actions/artifact';
import * as fs from 'fs';
import * as path from 'path';
import { ActionInputs, ClientConfig, ServerConfig, ServerTestResult } from './types';
import { runAllConformanceTests } from './conformance-runner';
import { getSummaryStats } from './result-parser';
import {
  generateCommentBody,
  postOrUpdateComment,
  fetchBaselineResults
} from './comment-generator';
import { updateAllBadges } from './badge-generator';

/**
 * Parse action inputs
 */
function getInputs(): ActionInputs {
  const mode = (core.getInput('mode') || 'test') as 'test' | 'comment';

  let servers: ServerConfig[] | undefined;
  let clients: ClientConfig[] | undefined;
  if (mode === 'test') {
    const serversInput = core.getInput('servers');
    if (serversInput) {
      servers = JSON.parse(serversInput);
    }
    const clientsInput = core.getInput('clients');
    if (clientsInput) {
      clients = JSON.parse(clientsInput);
    }
  }

  const baselineBranchesInput = core.getInput('baseline-branches') || '["main", "canary"]';
  const baselineBranches = JSON.parse(baselineBranchesInput);

  return {
    mode,
    servers,
    clients,
    testType: (core.getInput('test-type') || 'server') as 'server' | 'client' | 'both',
    conformanceVersion: core.getInput('conformance-version') || 'latest',
    githubToken: core.getInput('github-token'),
    commentMode: (core.getInput('comment-mode') || 'update') as 'create' | 'update' | 'none',
    includeBaselineComparison: core.getInput('include-baseline-comparison') !== 'false',
    baselineBranches,
    showSummary: core.getInput('show-summary') !== 'false',
    artifactName: core.getInput('artifact-name') || 'conformance-results',
    badgeGistId: core.getInput('badge-gist-id'),
    badgeGistToken: core.getInput('badge-gist-token')
  };
}

/**
 * Run tests and upload artifacts (test mode)
 */
async function runTestMode(inputs: ActionInputs): Promise<void> {
  if ((!inputs.servers || inputs.servers.length === 0) && (!inputs.clients || inputs.clients.length === 0)) {
    throw new Error('No servers or clients configured');
  }

  const serverCount = inputs.servers?.length || 0;
  const clientCount = inputs.clients?.length || 0;
  core.info(`Running conformance tests for ${serverCount} server(s) and ${clientCount} client(s)`);

  // Run all conformance tests
  const results = await runAllConformanceTests(
    inputs.servers || [],
    inputs.conformanceVersion,
    inputs.testType,
    inputs.clients
  );

  // Generate summary
  if (inputs.showSummary) {
    const stats = getSummaryStats(results);
    core.summary.addHeading('MCP Conformance Test Results', 1);
    core.summary.addTable([
      [
        { data: 'Server', header: true },
        { data: 'Passed', header: true },
        { data: 'Failed', header: true },
        { data: 'Total', header: true },
        { data: 'Rate', header: true }
      ],
      ...results.map(r => [
        r.serverName,
        r.passed.toString(),
        r.failed.toString(),
        r.total.toString(),
        `${r.rate}%`
      ])
    ]);
    core.summary.addRaw(`\n**Overall:** ${stats.totalPassed}/${stats.totalTests} tests passed (${stats.overallRate}%)\n`);
    await core.summary.write();
  }

  // Set outputs
  core.setOutput('results', JSON.stringify(results));
  core.setOutput('all-passed', results.every(r => r.passed === r.total));

  // Save results to files for artifact upload
  const resultsDir = path.join(process.cwd(), 'conformance-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  // Save individual results
  for (const result of results) {
    const resultFile = path.join(resultsDir, `${result.serverName}-results.json`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

    const outputFile = path.join(resultsDir, `${result.serverName}-output.txt`);
    fs.writeFileSync(outputFile, result.rawOutput);
  }

  // Save PR metadata if this is a PR
  if (github.context.eventName === 'pull_request') {
    const prMetadata = {
      pr_number: github.context.payload.pull_request?.number,
      head_sha: github.context.payload.pull_request?.head.sha,
      base_ref: github.context.payload.pull_request?.base.ref,
      run_id: github.context.runId
    };
    const metadataFile = path.join(resultsDir, 'pr-metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify(prMetadata, null, 2));
  }

  // Upload artifacts
  try {
    const files = fs.readdirSync(resultsDir).map(file => path.join(resultsDir, file));
    const uploadResult = await artifact.uploadArtifact(
      inputs.artifactName,
      files,
      resultsDir
    );
    core.info(`Uploaded artifact: ${uploadResult.id}`);
  } catch (error) {
    core.warning(`Failed to upload artifact: ${error}`);
  }

  // Update badges if configured (only on push to main/canary)
  if (
    inputs.badgeGistId &&
    inputs.badgeGistToken &&
    github.context.eventName === 'push' &&
    (github.context.ref === 'refs/heads/main' || github.context.ref === 'refs/heads/canary')
  ) {
    core.info('Updating badges');
    try {
      await updateAllBadges(inputs.badgeGistToken, inputs.badgeGistId, results);
    } catch (error) {
      core.warning(`Failed to update badges: ${error}`);
    }
  }
}

/**
 * Post comment from artifacts (comment mode)
 */
async function runCommentMode(inputs: ActionInputs): Promise<void> {
  if (!inputs.githubToken) {
    throw new Error('github-token is required for comment mode');
  }

  if (inputs.commentMode === 'none') {
    core.info('Comment mode is none, skipping comment');
    return;
  }

  // Download artifacts from the workflow run
  const resultsDir = path.join(process.cwd(), 'conformance-results');
  
  // Check if results already exist (downloaded by workflow)
  if (!fs.existsSync(resultsDir)) {
    throw new Error('Results directory not found. Make sure artifacts are downloaded first.');
  }

  // Load PR metadata
  const metadataFile = path.join(resultsDir, 'pr-metadata.json');
  if (!fs.existsSync(metadataFile)) {
    throw new Error('PR metadata not found');
  }

  const prMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  const { pr_number, head_sha, run_id } = prMetadata;

  if (!pr_number) {
    core.info('Not a PR, skipping comment');
    return;
  }

  // Load test results
  const results: ServerTestResult[] = [];
  const resultFiles = fs.readdirSync(resultsDir).filter(f => f.endsWith('-results.json'));

  for (const file of resultFiles) {
    const filePath = path.join(resultsDir, file);
    const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    results.push(result);
  }

  if (results.length === 0) {
    throw new Error('No test results found');
  }

  // Fetch baseline results if configured
  let baselines: Record<string, Record<string, ServerTestResult>> | undefined;
  if (inputs.includeBaselineComparison) {
    baselines = {};
    for (const branch of inputs.baselineBranches) {
      const baselineResults = await fetchBaselineResults(
        inputs.githubToken,
        branch,
        'conformance.yml',
        inputs.artifactName
      );
      if (baselineResults) {
        baselines[branch] = baselineResults;
      }
    }
  }

  // Generate comment
  const sha = head_sha.substring(0, 7);
  const runUrl = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${run_id}`;
  const commentBody = generateCommentBody(results, sha, runUrl, baselines);

  // Post or update comment
  await postOrUpdateComment(
    inputs.githubToken,
    pr_number,
    commentBody,
    inputs.commentMode
  );

  core.info('Comment posted successfully');
}

/**
 * Main entry point
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    core.info(`Running in ${inputs.mode} mode`);

    if (inputs.mode === 'test') {
      await runTestMode(inputs);
    } else if (inputs.mode === 'comment') {
      await runCommentMode(inputs);
    } else {
      throw new Error(`Invalid mode: ${inputs.mode}`);
    }

    core.info('Action completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
