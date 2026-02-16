import * as core from '@actions/core';
import * as github from '@actions/github';
import { ServerTestResult } from './types';

interface BadgeData {
  schemaVersion: number;
  label: string;
  message: string;
  color: string;
}

/**
 * Generate badge data for a server's test results
 */
export function generateBadgeData(
  serverName: string,
  result: ServerTestResult
): BadgeData {
  let message: string;
  let color: string;

  if (result.total === 0) {
    message = 'no tests';
    color = 'lightgrey';
  } else {
    message = `${result.passed}/${result.total} (${result.rate}%)`;

    if (result.passed === result.total) {
      color = 'brightgreen';
    } else if (result.rate >= 60) {
      color = 'yellow';
    } else {
      color = 'red';
    }
  }

  return {
    schemaVersion: 1,
    label: `MCP Conformance (${serverName})`,
    message,
    color
  };
}

/**
 * Update badge gist with new test results
 */
export async function updateBadgeGist(
  token: string,
  gistId: string,
  filename: string,
  badgeData: BadgeData
): Promise<void> {
  try {
    const octokit = github.getOctokit(token);

    core.info(`Updating badge gist ${gistId} file ${filename}`);

    await octokit.rest.gists.update({
      gist_id: gistId,
      files: {
        [filename]: {
          content: JSON.stringify(badgeData, null, 2)
        }
      }
    });

    core.info('Badge gist updated successfully');
  } catch (error) {
    core.error(`Failed to update badge gist: ${error}`);
    throw error;
  }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update badges for all server results
 */
export async function updateAllBadges(
  token: string,
  gistId: string,
  results: ServerTestResult[]
): Promise<void> {
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const badgeData = generateBadgeData(result.serverName, result);
    const filename = `${result.serverName.toLowerCase()}-conformance.json`;

    try {
      await updateBadgeGist(token, gistId, filename, badgeData);
      
      // Add delay between updates to avoid GitHub API rate limits
      // Skip delay after the last update
      if (i < results.length - 1) {
        core.info('Waiting 2 seconds before next badge update...');
        await sleep(2000);
      }
    } catch (error) {
      core.warning(
        `Failed to update badge for ${result.serverName}: ${error}`
      );
    }
  }
}
