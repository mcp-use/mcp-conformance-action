import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { spawn } from 'child_process';
import { ClientConfig, ServerConfig, ServerTestResult } from './types';
import { parseConformanceOutput } from './result-parser';

/**
 * Start a server process in a truly detached manner
 */
function startDetachedServer(command: string, cwd: string): void {
  const child = spawn('bash', ['-c', command], {
    cwd,
    detached: true,
    stdio: 'ignore'
  });

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
 * Run server conformance tests for a single server
 */
export async function runServerConformanceTest(
  server: ServerConfig,
  conformanceVersion: string
): Promise<ServerTestResult> {
  core.info(`Starting server conformance test for ${server.name}`);

  // Execute setup commands
  if (server['setup-commands'] && server['setup-commands'].length > 0) {
    core.info(`Running setup commands for ${server.name}`);
    for (const command of server['setup-commands']) {
      await exec.exec('bash', ['-c', command], {
        cwd: server['working-directory'] || process.cwd()
      });
    }
  }

  // Start the server
  core.info(`Starting ${server.name} server`);
  const serverCwd = server['working-directory'] || process.cwd();
  startDetachedServer(server['start-command'], serverCwd);

  core.info('Waiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  let output = '';
  let errorOutput = '';
  const conformanceCommand = getConformanceCommand(conformanceVersion);

  try {
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
    core.info(`Server conformance tests completed for ${server.name}`);
  } catch (error) {
    core.warning(`Error running server conformance tests for ${server.name}: ${error}`);
  }

  const fullOutput = output + '\n' + errorOutput;
  return parseConformanceOutput(server.name, fullOutput);
}

/**
 * Run client conformance tests for a single client
 */
export async function runClientConformanceTest(
  client: ClientConfig,
  conformanceVersion: string
): Promise<ServerTestResult> {
  core.info(`Starting client conformance test for ${client.name}`);

  // Execute setup commands
  if (client['setup-commands'] && client['setup-commands'].length > 0) {
    core.info(`Running setup commands for ${client.name}`);
    for (const command of client['setup-commands']) {
      await exec.exec('bash', ['-c', command], {
        cwd: client['working-directory'] || process.cwd()
      });
    }
  }

  const conformanceCommand = getConformanceCommand(conformanceVersion);

  // Use explicitly provided scenarios, or auto-discover all available ones
  const scenarios = client.scenarios && client.scenarios.length > 0
    ? client.scenarios
    : await listClientScenarios(conformanceCommand);

  if (scenarios.length === 0) {
    core.warning('No client scenarios found');
    return parseConformanceOutput(client.name, '');
  }

  core.info(`Running ${scenarios.length} client scenario(s): ${scenarios.join(', ')}`);

  const tests: Record<string, boolean> = {};
  let passed = 0;
  let failed = 0;
  let allOutput = '';

  for (const scenario of scenarios) {
    core.info(`Running client scenario: ${scenario}`);
    let scenarioOutput = '';

    try {
      await exec.exec(
        'bash',
        [
          '-c',
          `${conformanceCommand} client --command "${client.command}" --scenario "${scenario}" --timeout 30000`
        ],
        {
          cwd: client['working-directory'] || process.cwd(),
          listeners: {
            stdout: (data: Buffer) => { scenarioOutput += data.toString(); },
            stderr: (data: Buffer) => { scenarioOutput += data.toString(); }
          },
          ignoreReturnCode: true
        }
      );
    } catch (error) {
      core.warning(`Error running client scenario ${scenario}: ${error}`);
    }

    allOutput += scenarioOutput + '\n';

    // Determine pass/fail from OVERALL line
    if (scenarioOutput.includes('OVERALL: PASSED')) {
      tests[scenario] = true;
      passed++;
      core.info(`  ✓ ${scenario}: PASSED`);
    } else {
      tests[scenario] = false;
      failed++;
      core.info(`  ✗ ${scenario}: FAILED`);
    }
  }

  const total = passed + failed;
  const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    serverName: client.name,
    passed,
    failed,
    total,
    rate,
    tests,
    rawOutput: allOutput
  };
}

/**
 * Run all conformance tests (server and/or client)
 */
export async function runAllConformanceTests(
  servers: ServerConfig[],
  conformanceVersion: string,
  testType: 'server' | 'client' | 'both',
  clients?: ClientConfig[]
): Promise<ServerTestResult[]> {
  const results: ServerTestResult[] = [];

  // Run server tests
  if (testType === 'server' || testType === 'both') {
    for (const server of servers) {
      core.startGroup(`Server conformance tests for ${server.name}`);
      try {
        const result = await runServerConformanceTest(server, conformanceVersion);
        results.push(result);
        core.info(`${server.name}: ${result.passed}/${result.total} tests passed (${result.rate}%)`);
      } catch (error) {
        core.error(`Failed to run server conformance tests for ${server.name}: ${error}`);
        results.push({
          serverName: server.name,
          passed: 0, failed: 0, total: 0, rate: 0,
          tests: {},
          rawOutput: `Error: ${error}`
        });
      } finally {
        core.endGroup();
      }
    }
  }

  // Run client tests
  if ((testType === 'client' || testType === 'both') && clients && clients.length > 0) {
    for (const client of clients) {
      core.startGroup(`Client conformance tests for ${client.name}`);
      try {
        const result = await runClientConformanceTest(client, conformanceVersion);
        results.push(result);
        core.info(`${client.name}: ${result.passed}/${result.total} tests passed (${result.rate}%)`);
      } catch (error) {
        core.error(`Failed to run client conformance tests for ${client.name}: ${error}`);
        results.push({
          serverName: client.name,
          passed: 0, failed: 0, total: 0, rate: 0,
          tests: {},
          rawOutput: `Error: ${error}`
        });
      } finally {
        core.endGroup();
      }
    }
  }

  return results;
}
