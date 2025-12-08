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
 * Run conformance tests for a single server
 */
export async function runConformanceTest(
  server: ServerConfig,
  conformanceVersion: string,
  testType: 'server' | 'client' | 'both'
): Promise<ServerTestResult> {
  core.info(`Starting conformance test for ${server.name}`);

  // Execute setup commands
  if (server['setup-commands'] && server['setup-commands'].length > 0) {
    core.info(`Running setup commands for ${server.name}`);
    for (const command of server['setup-commands']) {
      await exec.exec('bash', ['-c', command], {
        cwd: server['working-directory'] || process.cwd()
      });
    }
  }

  // Start the server in the background using proper detached spawn
  core.info(`Starting ${server.name} server`);
  const serverCwd = server['working-directory'] || process.cwd();
  startDetachedServer(server['start-command'], serverCwd);

  // Wait for server to be ready
  core.info('Waiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  let output = '';
  let errorOutput = '';

  try {
    // Run conformance tests
    core.info(`Running conformance tests against ${server.name}`);
    const conformanceCommand =
      conformanceVersion === 'latest'
        ? 'npx @modelcontextprotocol/conformance'
        : `npx @modelcontextprotocol/conformance@${conformanceVersion}`;

    await exec.exec(
      'bash',
      [
        '-c',
        `${conformanceCommand} ${testType === 'both' ? 'server client' : testType} --url ${server.url}`
      ],
      {
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString();
          },
          stderr: (data: Buffer) => {
            errorOutput += data.toString();
          }
        },
        ignoreReturnCode: true
      }
    );

    core.info(`Conformance tests completed for ${server.name}`);
  } catch (error) {
    core.warning(
      `Error running conformance tests for ${server.name}: ${error}`
    );
  }
  // Note: We don't manually clean up server processes
  // GitHub Actions automatically kills all job processes when the job completes

  // Parse the output
  const fullOutput = output + '\n' + errorOutput;
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
