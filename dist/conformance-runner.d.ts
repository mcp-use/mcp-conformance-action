import { ClientConfig, ServerConfig, ServerTestResult } from './types';
/**
 * Run server conformance tests for a single server
 */
export declare function runServerConformanceTest(server: ServerConfig, conformanceVersion: string): Promise<ServerTestResult>;
/**
 * Run client conformance tests for a single client
 */
export declare function runClientConformanceTest(client: ClientConfig, conformanceVersion: string): Promise<ServerTestResult>;
/**
 * Run all conformance tests (server and/or client)
 */
export declare function runAllConformanceTests(servers: ServerConfig[], conformanceVersion: string, testType: 'server' | 'client' | 'both', clients?: ClientConfig[]): Promise<ServerTestResult[]>;
