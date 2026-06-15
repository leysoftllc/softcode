import * as vscode from 'vscode';

export interface SavedSession {
    id:        string;
    title:     string;
    timestamp: number;
    preview:   string;
    messages:  unknown[];   // serialised ChatMessage[]
    history:   unknown[];   // serialised ConversationMessage[]
}

export type SessionMeta = Omit<SavedSession, 'messages' | 'history'>;

const MAX_SESSIONS  = 50;
const SESSIONS_KEY  = 'softcode.sessions';
const CURRENT_KEY   = 'softcode.currentSessionId';

export class SessionManager {
    constructor(private readonly ctx: vscode.ExtensionContext) {}

    list(): SessionMeta[] {
        return this.all().map(({ messages: _m, history: _h, ...meta }) => meta);
    }

    load(id: string): SavedSession | undefined {
        return this.all().find(s => s.id === id);
    }

    save(session: SavedSession): void {
        const sessions = this.all().filter(s => s.id !== session.id);
        sessions.unshift(session);
        if (sessions.length > MAX_SESSIONS) sessions.splice(MAX_SESSIONS);
        void this.ctx.globalState.update(SESSIONS_KEY, sessions);
        void this.ctx.globalState.update(CURRENT_KEY, session.id);
    }

    delete(id: string): void {
        const sessions = this.all().filter(s => s.id !== id);
        void this.ctx.globalState.update(SESSIONS_KEY, sessions);
    }

    getCurrentId(): string | undefined {
        return this.ctx.globalState.get<string>(CURRENT_KEY);
    }

    setCurrentId(id: string): void {
        void this.ctx.globalState.update(CURRENT_KEY, id);
    }

    private all(): SavedSession[] {
        return this.ctx.globalState.get<SavedSession[]>(SESSIONS_KEY) ?? [];
    }
}
