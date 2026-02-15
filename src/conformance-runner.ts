import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { spawn } from 'child_process';
import { ServerConfig, ServerTestResult } from './types';
import { parseConformanceOutput } from './result-parser';

/**
 * Start a server process in a truly detached manner
 */
function startDetachedServer(command: string, cwd: string): void {
  const child = spawn('bash', ['-c', command], {
    cwd,
    detached: true,
    stdio: 'ignore' // Don't inherit stdio - this is key to preventing hangs
  });

  // Unref the child so the parent can exit independently
  child.unref();

  core.info(`Server process spawned (detached)`);
}

/**
 * Get the npx conformance command with optional version pinning
 */
function getConformanceCommand(version: string): string {
  return version === 'latest'
    ? 'npx @modelcontextprotocol/conformance'
    : `npx @modelcontextprotocol/conformance@${version}`;
}

/**
 * List available client scenarios from the conformance tool
 */
async function listClientScenarios(conformanceCommand: string): Promise<string[]> {
  let output = '';
  await exec.exec('bash', ['-c', `${conformanceCommand} list`], {
    listeners: {
      stdout: (data: Buffer) => { output += data.toString(); }
    },
    ignoreReturnCode: true,
    silent: true
  });

  const scenarios: string[] = [];
  let inClientSection = false;

  for (const line of output.split('\n')) {
    if (line.includes('Client scenarios')) {
      inClientSection = true;
      continue;
    }
    if (inClientSection) {
      // Stop at next section or empty lines after content
      if (line.includes('Server scenarios') || (scenarios.length > 0 && line.trim() === '')) {
        break;
      }
      const match = line.match(/^\s+-\s+(\S+)/);
      if (match) {
        const scenario = match[1];
        // Skip draft and extension scenarios
        if (!line.includes('[draft]') && !line.includes('[extension]')) {
          scenarios.push(scenario);
        }
      }
    }
  }

  return scenarios;
}

/**
 * Run server conformance tests
 */
async function runServerConformance(
  server: ServerConfig,
  conformanceCommand: string
): Promise<{ output: string; errorOutput: string }> {
  let output = '';
  let errorOutput = '';

  core.info(`Running server conformance tests against ${server.url}`);
  await exec.exec(
    'bash',
    ['-c', `${conformanceCommand} server --url ${server.url}`],
    {
      listeners: {
        stdout: (data: Buffer) => { output += data.toString(); },
        stderr: (data: Buffer) => { errorOutput += data.toString(); }
      },
      ignoreReturnCode: true
    }
  );

  return { output, errorOutput };
}

/**
 * Run client conformance tests by iterating over each scenario
 */
async function runClientConformance(
  server: ServerConfig,
  conformanceCommand: string
): Promise<{ output: string; errorOutput: string }> {
  const clientCommand = server['client-command'];
  if (!clientCommand) {
    core.warning(`No client-command configured for ${server.name}, skipping client tests`);
    return { output: '', errorOutput: '' };
  }

  // List available client scenarios
  const scenarios = await listClientScenarios(conformanceCommand);
  if (scenarios.length === 0) {
    core.warning('No client scenarios found');
    return { output: '', errorOutput: '' };
  }

  core.info(`Found ${scenarios.length} client scenarios to run`);

  let allOutput = '';
  let allErrorOutput = '';

  for (const scenario of scenarios) {
    core.info(`Running client scenario: ${scenario}`);
    let scenarioOutput = '';
    let scenarioError = '';

    try {
      await exec.exec(
        'bash',
        [
          '-c',
          `${conformanceCommand} client --command "${clientCommand}" --scenario "${scenario}" --timeout 30000`
        ],
        {
          listeners: {
            stdout: (data: Buffer) => { scenarioOutput += data.toString(); },
            stderr: (data: Buffer) => { scenarioError += data.toString(); }
          },
          ignoreReturnCode: true
        }
      );
    } catch (error) {
      core.warning(`Error running client scenario ${scenario}: ${error}`);
    }

    allOutput += scenarioOutput + '\n';
    allErrorOutput += scenarioError + '\n';
  }

  return { output: allOutput, errorOutput: allErrorOutput };
}

/**
 * Run conformance tests for a single server
 */
export async function runConformanceTest(
  server: ServerConfig,
  conformanceVersion: string,
  testType: 'server' | 'client' | 'both'
): Promise<ServerTestResult> {
  core.info(`Starting conformance test for ${server.name} (type: ${testType})`);

  // Execute setup commands
  if (server['setup-commands'] && server['setup-commands'].length > 0) {
    core.info(`Running setup commands for ${server.name}`);
    for (const command of server['setup-commands']) {
      await exec.exec('bash', ['-c', command], {
        cwd: server['working-directory'] || process.cwd()
      });
    }
  }

  // Start the server in the background (needed for both server and client tests)
  core.info(`Starting ${server.name} server`);
  const serverCwd = server['working-directory'] || process.cwd();
  startDetachedServer(server['start-command'], serverCwd);

  // Wait for server to be ready
  core.info('Waiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const conformanceCommand = getConformanceCommand(conformanceVersion);
  let allOutput = '';
  let allErrorOutput = '';

  try {
    if (testType === 'server' || testType === 'both') {
      const { output, errorOutput } = await runServerConformance(server, conformanceCommand);
      allOutput += output + '\n';
      allErrorOutput += errorOutput + '\n';
    }

    if (testType === 'client' || testType === 'both') {
      const { output, errorOutput } = await runClientConformance(server, conformanceCommand);
      allOutput += output + '\n';
      allErrorOutput += errorOutput + '\n';
    }

    core.info(`Conformance tests completed for ${server.name}`);
  } catch (error) {
    core.warning(
      `Error running conformance tests for ${server.name}: ${error}`
    );
  }
  // Note: We don't manually clean up server processes
  // GitHub Actions automatically kills all job processes when the job completes

  // Parse the output
  const fullOutput = allOutput + '\n' + allErrorOutput;
  return parseConformanceOutput(server.name, fullOutput);
}

/**
 * Run conformance tests for all configured servers
 */
export async function runAllConformanceTests(
  servers: ServerConfig[],
  conformanceVersion: string,
  testType: 'server' | 'client' | 'both'
): Promise<ServerTestResult[]> {
  const results: ServerTestResult[] = [];

  for (const server of servers) {
    core.startGroup(`Conformance tests for ${server.name}`);
    try {
      const result = await runConformanceTest(
        server,
        conformanceVersion,
        testType
      );
      results.push(result);
      core.info(
        `${server.name}: ${result.passed}/${result.total} tests passed (${result.rate}%)`
      );
    } catch (error) {
      core.error(`Failed to run conformance tests for ${server.name}: ${error}`);
      // Add a failed result
      results.push({
        serverName: server.name,
        passed: 0,
        failed: 0,
        total: 0,
        rate: 0,
        tests: {},
        rawOutput: `Error: ${error}`
      });
    } finally {
      core.endGroup();
    }
  }

  return results;
}
