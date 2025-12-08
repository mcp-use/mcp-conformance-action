export interface ServerConfig {
    name: string;
    'setup-commands'?: string[];
    'start-command': string;
    url: string;
    'working-directory'?: string;
    runtime?: string;
}
export interface TestResult {
    name: string;
    passed: boolean;
}
export interface ServerTestResult {
    serverName: string;
    passed: number;
    failed: number;
    total: number;
    rate: number;
    tests: Record<string, boolean>;
    rawOutput: string;
}
export interface ParsedResults {
    current: Record<string, ServerTestResult>;
    baselines: Record<string, Record<string, ServerTestResult>>;
}
export interface ActionInputs {
    mode: 'test' | 'comment';
    servers?: ServerConfig[];
    testType: 'server' | 'client' | 'both';
    conformanceVersion: string;
    githubToken?: string;
    commentMode: 'create' | 'update' | 'none';
    includeBaselineComparison: boolean;
    baselineBranches: string[];
    showSummary: boolean;
    artifactName: string;
    badgeGistId?: string;
    badgeGistToken?: string;
}
