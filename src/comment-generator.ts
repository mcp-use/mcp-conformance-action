import * as core from '@actions/core';
import * as github from '@actions/github';
import { ServerTestResult } from './types';
import { getAllTestNames } from './result-parser';

const COMMENT_MARKER = '<!-- mcp-conformance-results -->';

/**
 * Get comparison icon for baseline comparison
 */
function getComparisonIcon(
  current: ServerTestResult,
  baseline?: ServerTestResult
): string {
  if (!baseline || baseline.total === 0) return '🆕';

  const diff = current.passed - baseline.passed;
  if (diff > 0) return `🟢 +${diff}`;
  if (diff < 0) return `🔴 ${diff}`;
  return '⚪ +0';
}

/**
 * Generate summary table (one row per SDK)
 */
function generateSummaryTable(
  results: ServerTestResult[],
  baselines?: Record<string, Record<string, ServerTestResult>>
): string {
  const baselineBranches = baselines ? Object.keys(baselines) : [];

  const baselineHeaders = baselineBranches.map(b => `vs ${b}`).join(' | ');
  const header = baselineBranches.length > 0
    ? `| SDK | Score | ${baselineHeaders} |`
    : '| SDK | Score |';

  const separator = baselineBranches.length > 0
    ? `|-----|:-----:|${baselineBranches.map(() => ':-------:').join('|')}|`
    : '|-----|:-----:|';

  const rows = results.map(result => {
    const score = `**${result.passed}/${result.total}** (${result.rate}%)`;
    if (baselineBranches.length > 0) {
      const baselineCells = baselineBranches
        .map(branch => {
          const baseline = baselines?.[branch]?.[result.serverName];
          return getComparisonIcon(result, baseline);
        })
        .join(' | ');
      return `| ${result.serverName} | ${score} | ${baselineCells} |`;
    }
    return `| ${result.serverName} | ${score} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Generate transposed detail table (scenarios as rows, SDKs as columns)
 */
function generateDetailTable(
  results: ServerTestResult[],
  baselines?: Record<string, Record<string, ServerTestResult>>
): string {
  const allTests = getAllTestNames(results);
  if (allTests.length === 0) return '';

  // Header: Scenario | sdk1 | sdk2 | ...
  const sdkHeaders = results.map(r => r.serverName).join(' | ');
  const header = `| Scenario | ${sdkHeaders} |`;
  const separator = `|----------|${results.map(() => ':---:').join('|')}|`;

  const rows = allTests.map(testName => {
    const cells = results.map(result => {
      const current = result.tests[testName];
      const baseline = baselines?.main?.[result.serverName]?.tests[testName];

      let icon = '➖';
      if (current === true) icon = '✅';
      else if (current === false) icon = '❌';

      // Add change indicator if changed from baseline
      if (baseline !== undefined && baseline !== current) {
        if (current === true && baseline === false) return `${icon} +1`;
        if (current === false && baseline === true) return `${icon} -1`;
      }

      return icon;
    }).join(' | ');

    return `| ${testName} | ${cells} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Generate a section with summary + collapsible details
 */
function generateSection(
  title: string,
  results: ServerTestResult[],
  baselines?: Record<string, Record<string, ServerTestResult>>
): string {
  const summaryTable = generateSummaryTable(results, baselines);
  const detailTable = generateDetailTable(results, baselines);

  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const detailSummary = totalFailed > 0
    ? `${totalFailed} failure(s) — click to expand`
    : 'All passing — click to expand';

  const lines = [
    `### ${title}`,
    '',
    summaryTable,
    '',
    '<details>',
    `<summary>${detailSummary}</summary>`,
    '',
    detailTable,
    '',
    '</details>',
  ];

  return lines.join('\n');
}

/**
 * Generate full PR comment body
 */
export function generateCommentBody(
  results: ServerTestResult[],
  sha: string,
  runUrl: string,
  baselines?: Record<string, Record<string, ServerTestResult>>
): string {
  // Split results into server and client groups
  const serverResults = results.filter(r => !r.serverName.includes('-client'));
  const clientResults = results.filter(r => r.serverName.includes('-client'));

  const sections: string[] = [
    COMMENT_MARKER,
    '<h2>',
    '<picture style="display: inline-block; vertical-align: middle; margin-right: 8px;">',
    '  <source media="(prefers-color-scheme: dark)" srcset="https://registry.npmmirror.com/@lobehub/icons-static-png/1.74.0/files/dark/mcp.png">',
    '  <source media="(prefers-color-scheme: light)" srcset="https://registry.npmmirror.com/@lobehub/icons-static-png/1.74.0/files/light/mcp.png">',
    '  <img alt="MCP" src="https://registry.npmmirror.com/@lobehub/icons-static-png/1.74.0/files/light/mcp.png" height="32" width="32" style="display: inline-block; vertical-align: middle;">',
    '</picture>',
    '<span style="vertical-align: middle;">MCP Conformance Test Results</span>',
    '</h2>',
    '',
    `**Commit:** \`${sha}\``,
  ];

  if (serverResults.length > 0) {
    sections.push('', generateSection('Server Conformance', serverResults, baselines));
  }

  if (clientResults.length > 0) {
    sections.push('', generateSection('Client Conformance', clientResults, baselines));
  }

  sections.push('', `[View full run details](${runUrl})`);

  return sections.join('\n');
}

/**
 * Post or update PR comment with test results
 */
export async function postOrUpdateComment(
  token: string,
  prNumber: number,
  commentBody: string,
  mode: 'create' | 'update'
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  if (mode === 'update') {
    // Try to find existing comment
    try {
      const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber
      });

      const existingComment = comments.find(comment =>
        comment.body?.includes(COMMENT_MARKER)
      );

      if (existingComment) {
        core.info(`Updating existing comment ${existingComment.id}`);
        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: commentBody
        });
        return;
      }

      core.info('No existing comment found, creating new one');
    } catch (error) {
      core.warning(`Error finding existing comment: ${error}`);
    }
  }

  // Create new comment
  core.info('Creating new comment');
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: commentBody
  });
}

/**
 * Parse old-style conformance results text file into ServerTestResult
 */
function parseOldResultsFile(content: string, serverName: string): ServerTestResult {
  const tests: Record<string, boolean> = {};
  let passed = 0;
  let failed = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    const passMatch = line.match(/[✓✅]\s+(.+?)(?::|$)/);
    if (passMatch) {
      const testName = passMatch[1].trim();
      tests[testName] = true;
      passed++;
      continue;
    }
    const failMatch = line.match(/[✗❌]\s+(.+?)(?::|$)/);
    if (failMatch) {
      const testName = failMatch[1].trim();
      tests[testName] = false;
      failed++;
    }
  }

  const total = passed + failed;
  const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    serverName,
    passed,
    failed,
    total,
    rate,
    tests,
    rawOutput: content
  };
}

/**
 * Fetch baseline results from a specific branch
 */
export async function fetchBaselineResults(
  token: string,
  branch: string,
  workflowName: string,
  artifactName: string
): Promise<Record<string, ServerTestResult> | null> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const { exec } = await import('@actions/exec');

  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    core.info(`Fetching baseline results from ${branch}`);

    // Find the last successful workflow run for this branch
    const { data: runs } = await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowName,
      branch,
      status: 'completed',
      conclusion: 'success',
      per_page: 1
    });

    if (runs.workflow_runs.length === 0) {
      core.info(`No successful runs found for ${branch}`);
      return null;
    }

    const runId = runs.workflow_runs[0].id;
    core.info(`Found run ${runId} for ${branch}`);

    // Download artifacts
    const { data: artifacts } = await octokit.rest.actions.listWorkflowRunArtifacts({
      owner,
      repo,
      run_id: runId
    });

    const results: Record<string, ServerTestResult> = {};
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-${branch}-`));

    // Try new format first (conformance-results)
    const newArtifact = artifacts.artifacts.find(a => a.name === artifactName);
    if (newArtifact) {
      core.info(`Found new-format artifact ${artifactName} for ${branch}`);
      const download = await octokit.rest.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: newArtifact.id,
        archive_format: 'zip'
      });

      const zipPath = path.join(tempDir, 'new.zip');
      const extractDir = path.join(tempDir, 'new');
      fs.writeFileSync(zipPath, Buffer.from(download.data as ArrayBuffer));
      fs.mkdirSync(extractDir, { recursive: true });
      await exec('unzip', ['-q', zipPath, '-d', extractDir], { ignoreReturnCode: true });

      const files = fs.readdirSync(extractDir);
      for (const file of files) {
        if (file.endsWith('-results.json')) {
          try {
            const content = fs.readFileSync(path.join(extractDir, file), 'utf8');
            const result: ServerTestResult = JSON.parse(content);
            results[result.serverName] = result;
            core.info(`Loaded baseline for ${result.serverName} from ${branch} (new format)`);
          } catch (e) {
            core.debug(`Failed to parse ${file}: ${e}`);
          }
        }
      }
    }

    // Try old format (python-conformance-results, typescript-conformance-results)
    const oldArtifactNames = ['python-conformance-results', 'typescript-conformance-results'];
    for (const oldName of oldArtifactNames) {
      if (results[oldName.replace('-conformance-results', '')]) continue; // Already have this server

      const oldArtifact = artifacts.artifacts.find(a => a.name === oldName);
      if (oldArtifact) {
        const serverName = oldName.replace('-conformance-results', '');
        core.info(`Found old-format artifact ${oldName} for ${branch}`);

        try {
          const download = await octokit.rest.actions.downloadArtifact({
            owner,
            repo,
            artifact_id: oldArtifact.id,
            archive_format: 'zip'
          });

          const zipPath = path.join(tempDir, `${serverName}.zip`);
          const extractDir = path.join(tempDir, serverName);
          fs.writeFileSync(zipPath, Buffer.from(download.data as ArrayBuffer));
          fs.mkdirSync(extractDir, { recursive: true });
          await exec('unzip', ['-q', zipPath, '-d', extractDir], { ignoreReturnCode: true });

          // Look for the text results file
          const files = fs.readdirSync(extractDir);
          const resultsFile = files.find(f => f.endsWith('-conformance-results.txt'));
          if (resultsFile) {
            const content = fs.readFileSync(path.join(extractDir, resultsFile), 'utf8');
            results[serverName] = parseOldResultsFile(content, serverName);
            core.info(`Loaded baseline for ${serverName} from ${branch} (old format)`);
          }
        } catch (e) {
          core.debug(`Failed to download/parse ${oldName}: ${e}`);
        }
      }
    }

    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    if (Object.keys(results).length === 0) {
      core.info(`No results found in artifacts for ${branch}`);
      return null;
    }

    return results;
  } catch (error) {
    core.warning(`Error fetching baseline for ${branch}: ${error}`);
    return null;
  }
}
