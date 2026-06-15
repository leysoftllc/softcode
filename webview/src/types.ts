export type ModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5';
export type Mode = 'ask' | 'analyze' | 'edit';
export type ContextScope = 'file' | 'selection' | 'workspace' | 'search';

export const MODEL_INFO: Record<ModelId, { label: string; description: string; icon: string }> = {
    'claude-haiku-4-5':  { label: 'Haiku',  icon: '⚡', description: 'Fast'              },
    'claude-sonnet-4-5': { label: 'Sonnet', icon: '🧠', description: 'Balanced · default' },
    'claude-opus-4-5':   { label: 'Opus',   icon: '🚀', description: 'Advanced'           },
};

export const MODE_INFO: Record<Mode, { label: string; description: string }> = {
    ask:     { label: 'Ask',     description: 'Answer questions'    },
    analyze: { label: 'Analyze', description: 'Find bugs & issues'  },
    edit:    { label: 'Edit',    description: 'Generate patches'    },
};

export interface ContextInfo {
    files:         string[];
    tokens:        number;
    estimatedCost: number;
}

export interface ChatMessage {
    id:           string;
    role:         'user' | 'assistant';
    content:      string;
    isStreaming?:  boolean;
    statuses?:    string[];      // agent thinking steps
    foundFiles?:  string[];      // files discovered
    contextInfo?: ContextInfo;   // context summary at bottom
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
