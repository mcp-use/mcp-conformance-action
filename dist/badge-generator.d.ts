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
export declare function generateBadgeData(serverName: string, result: ServerTestResult): BadgeData;
/**
 * Update badge gist with new test results
 */
export declare function updateBadgeGist(token: string, gistId: string, filename: string, badgeData: BadgeData): Promise<void>;
/**
 * Update badges for all server results
 */
export declare function updateAllBadges(token: string, gistId: string, results: ServerTestResult[]): Promise<void>;
export {};
