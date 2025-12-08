import { ServerTestResult } from './types';
/**
 * Parse conformance test output and extract test results
 */
export declare function parseConformanceOutput(serverName: string, output: string): ServerTestResult;
/**
 * Extract summary statistics from results
 */
export declare function getSummaryStats(results: ServerTestResult[]): {
    totalPassed: number;
    totalFailed: number;
    totalTests: number;
    overallRate: number;
};
/**
 * Get all unique test names across all servers
 */
export declare function getAllTestNames(results: ServerTestResult[]): string[];
