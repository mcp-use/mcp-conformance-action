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
 * Generate markdown table for test results
 */
export function generateResultsTable(
  results: ServerTestResult[],
  baselines?: Record<string, Record<string, ServerTestResult>>
): string {
  const allTests = getAllTestNames(results);
  const baselineBranches = baselines ? Object.keys(baselines) : [];

  // Build header
  const testHeaders = allTests.map(t => t.replace(/-/g, '&#8209;')).join(' | ');
  const baselineHeaders = baselineBranches.map(b => `vs ${b}`).join(' | ');
  const fullHeader = baselineHeaders
    ? `| Server | Overall | ${baselineHeaders} | ${testHeaders} |`
    : `| Server | Overall | ${testHeaders} |`;

  // Build separator
  const baselineSeparators = baselineBranches.map(() => ':-------:').join(' | ');
  const testSeparators = allTests.map(() => ':---:').join(' | ');
  const fullSeparator = baselineBranches.length > 0
    ? `|--------|:-------:|${baselineSeparators}|${testSeparators}|`
    : `|--------|:-------:|${testSeparators}|`;

  // Build rows
  const rows = results.map(result => {
    // Baseline comparisons
    const baselineCells = baselineBranches
      .map(branch => {
        const baseline = baselines?.[branch]?.[result.serverName];
        return getComparisonIcon(result, baseline);
      })
      .join(' | ');

    // Test results
    const testCells = allTests
      .map(testName => {
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
      })
      .join(' | ');

    const baselineSection = baselineBranches.length > 0 ? `${baselineCells} | ` : '';
    return `| ${result.serverName} | ${result.rate}% | ${baselineSection}${testCells} |`;
  });

  return [fullHeader, fullSeparator, ...rows].join('\n');
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
  const table = generateResultsTable(results, baselines);

  return [
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
    '',
    table,
    '',
    `[View full run details](${runUrl})`
  ].join('\n');
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
 * Fetch baseline results from a specific branch
 */
export async function fetchBaselineResults(
  token: string,
  branch: string,
  workflowName: string,
  artifactName: string
): Promise<Record<string, ServerTestResult> | null> {
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

    const artifact = artifacts.artifacts.find(a => a.name === artifactName);
    if (!artifact) {
      core.info(`No artifact ${artifactName} found for ${branch}`);
      return null;
    }

    // Download and parse artifact
    const download = await octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: artifact.id,
      archive_format: 'zip'
    });

    // Note: In a real implementation, we would need to extract and parse the zip file
    // For now, we'll return null and handle this in the main flow
    core.info(`Downloaded artifact for ${branch}`);
    return null;
  } catch (error) {
    core.warning(`Error fetching baseline for ${branch}: ${error}`);
    return null;
  }
}
