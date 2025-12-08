import { ServerConfig, ServerTestResult } from './types';
/**
 * Run conformance tests for a single server
 */
export declare function runConformanceTest(server: ServerConfig, conformanceVersion: string, testType: 'server' | 'client' | 'both'): Promise<ServerTestResult>;
/**
 * Run conformance tests for all configured servers
 */
export declare function runAllConformanceTests(servers: ServerConfig[], conformanceVersion: string, testType: 'server' | 'client' | 'both'): Promise<ServerTestResult[]>;
