import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { ServerConfig, ServerTestResult } from './types';
import { parseConformanceOutput } from './result-parser';

/**
 * Kill a process tree by PID
 */
async function killProcessTree(pid: string): Promise<void> {
  try {
    // First, try graceful shutdown with SIGTERM
    core.info(`Sending SIGTERM to process ${pid}`);
    await exec.exec('kill', ['-TERM', pid], {
      ignoreReturnCode: true
    });

    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if process is still running
    const exitCode = await exec.exec('kill', ['-0', pid], {
      ignoreReturnCode: true,
      silent: true
    });

    if (exitCode === 0) {
      // Process still running, force kill
      core.info(`Process ${pid} still running, sending SIGKILL`);
      await exec.exec('kill', ['-9', pid], {
        ignoreReturnCode: true
      });
    }

    // Kill any remaining child processes
    await exec.exec('pkill', ['-9', '-P', pid], {
      ignoreReturnCode: true,
      silent: true
    });
  } catch (error) {
    core.debug(`Error killing process ${pid}: ${error}`);
  }
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

  let serverPid: string | null = null;

  // Start the server in the background and capture its PID
  core.info(`Starting ${server.name} server`);
  let pidOutput = '';
  await exec.exec(
    'bash',
    [
      '-c',
      `cd ${server['working-directory'] || '.'} && ${server['start-command']} & echo $!`
    ],
    {
      listeners: {
        stdout: (data: Buffer) => {
          const output = data.toString().trim();
          if (output && /^\d+$/.test(output)) {
            serverPid = output;
            core.info(`Server started with PID: ${serverPid}`);
          }
        }
      },
      ignoreReturnCode: true
    }
  );

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
  } finally {
    // Kill the server process
    core.info(`Stopping ${server.name} server`);
    
    if (serverPid) {
      await killProcessTree(serverPid);
    }

    // Fallback: kill by command pattern
    try {
      await exec.exec(
        'bash',
        ['-c', `pkill -9 -f "${server['start-command']}" || true`],
        {
          ignoreReturnCode: true,
          silent: true
        }
      );
    } catch {
      // Ignore errors
    }

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

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
