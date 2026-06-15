export type ModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5';

export const MODEL_INFO: Record<ModelId, { label: string; description: string }> = {
    'claude-haiku-4-5':  { label: 'Haiku',  description: 'Fast & affordable'  },
    'claude-sonnet-4-5': { label: 'Sonnet', description: 'Balanced · default' },
    'claude-opus-4-5':   { label: 'Opus',   description: 'Most capable'       },
};

export interface ChatMessage {
    id:          string;
    role:        'user' | 'assistant';
    content:     string;
    isStreaming?: boolean;
    usage?: {
        inputTokens:  number;
        outputTokens: number;
        cost:         number;
    };
}

export interface UsageStats {
    totalCost:     number;
    dailyCost:     number;
    totalRequests: number;
    totalTokens:   number;
}

// VS Code Webview API injected at runtime
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState():          unknown;
    setState(state: unknown): void;
};

export const vscode = acquireVsCodeApi();
