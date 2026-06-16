export type ModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-8';
export type Mode = 'ask' | 'analyze' | 'edit';
export type ContextScope = 'file' | 'selection' | 'workspace' | 'search';
export type TodoStatus = 'not-started' | 'in-progress' | 'completed';

export interface PlanTodo {
    id:     string;
    text:   string;
    status: TodoStatus;
}

export const MODEL_INFO: Record<ModelId, { label: string; description: string; icon: string }> = {
    'claude-haiku-4-5':  { label: 'Haiku 4.5',  icon: 'H', description: 'Fast'     },
    'claude-sonnet-4-6': { label: 'Sonnet 4.6', icon: 'S', description: 'Balanced' },
    'claude-opus-4-8':   { label: 'Opus 4.8',   icon: 'O', description: 'Advanced' },
};

export interface MessageAction {
    label:    string;
    primary?: boolean;
    action:   string;
}

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
    plan?:        PlanTodo[];    // structured execution plan
    contextInfo?: ContextInfo;   // context summary at bottom
    actions?:     MessageAction[]; // action buttons below AI response
    sources?:     string[];        // source file links below AI response
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

export interface SessionMeta {
    id:        string;
    title:     string;
    timestamp: number;
    preview:   string;
}

// VS Code Webview API injected at runtime
declare global {
    interface Window {
        acquireVsCodeApi?: () => {
            postMessage(message: unknown): void;
            getState():          unknown;
            setState(state: unknown): void;
        };
    }
}

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState():          unknown;
    setState(state: unknown): void;
};

export const vscode = typeof window.acquireVsCodeApi === 'function'
    ? window.acquireVsCodeApi()
    : {
        postMessage: () => undefined,
        getState:    () => undefined,
        setState:    () => undefined,
    };
