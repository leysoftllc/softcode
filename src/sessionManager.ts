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

    async save(session: SavedSession): Promise<void> {
        const sessions = this.all().filter(s => s.id !== session.id);
        sessions.unshift(session);
        if (sessions.length > MAX_SESSIONS) sessions.splice(MAX_SESSIONS);
        await this.ctx.globalState.update(SESSIONS_KEY, sessions);
        await this.ctx.globalState.update(CURRENT_KEY, session.id);
    }

    async delete(id: string): Promise<void> {
        const sessions = this.all().filter(s => s.id !== id);
        await this.ctx.globalState.update(SESSIONS_KEY, sessions);
        if (this.getCurrentId() === id) {
            await this.ctx.globalState.update(CURRENT_KEY, sessions[0]?.id);
        }
    }

    getCurrentId(): string | undefined {
        return this.ctx.globalState.get<string>(CURRENT_KEY);
    }

    async setCurrentId(id: string): Promise<void> {
        await this.ctx.globalState.update(CURRENT_KEY, id);
    }

    async clearCurrentId(): Promise<void> {
        await this.ctx.globalState.update(CURRENT_KEY, undefined);
    }

    private all(): SavedSession[] {
        return this.ctx.globalState.get<SavedSession[]>(SESSIONS_KEY) ?? [];
    }
}
