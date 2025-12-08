import { ServerTestResult } from './types';
/**
 * Generate markdown table for test results
 */
export declare function generateResultsTable(results: ServerTestResult[], baselines?: Record<string, Record<string, ServerTestResult>>): string;
/**
 * Generate full PR comment body
 */
export declare function generateCommentBody(results: ServerTestResult[], sha: string, runUrl: string, baselines?: Record<string, Record<string, ServerTestResult>>): string;
/**
 * Post or update PR comment with test results
 */
export declare function postOrUpdateComment(token: string, prNumber: number, commentBody: string, mode: 'create' | 'update'): Promise<void>;
/**
 * Fetch baseline results from a specific branch
 */
export declare function fetchBaselineResults(token: string, branch: string, workflowName: string, artifactName: string): Promise<Record<string, ServerTestResult> | null>;
