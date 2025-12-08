import { ServerTestResult } from './types';

/**
 * Parse conformance test output and extract test results
 */
export function parseConformanceOutput(
  serverName: string,
  output: string
): ServerTestResult {
  const tests: Record<string, boolean> = {};
  let passed = 0;
  let failed = 0;

  // Parse each line looking for test results
  const lines = output.split('\n');
  for (const line of lines) {
    // Look for passed tests (✓ or ✅)
    const passMatch = line.match(/[✓✅]\s+(.+?)(?::|$)/);
    if (passMatch) {
      const testName = passMatch[1].trim();
      tests[testName] = true;
      passed++;
      continue;
    }

    // Look for failed tests (✗ or ❌)
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
    rawOutput: output
  };
}

/**
 * Extract summary statistics from results
 */
export function getSummaryStats(results: ServerTestResult[]): {
  totalPassed: number;
  totalFailed: number;
  totalTests: number;
  overallRate: number;
} {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  const totalTests = totalPassed + totalFailed;
  const overallRate =
    totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  return {
    totalPassed,
    totalFailed,
    totalTests,
    overallRate
  };
}

/**
 * Get all unique test names across all servers
 */
export function getAllTestNames(results: ServerTestResult[]): string[] {
  const testNames = new Set<string>();

  for (const result of results) {
    for (const testName of Object.keys(result.tests)) {
      testNames.add(testName);
    }
  }

  return Array.from(testNames).sort();
}
