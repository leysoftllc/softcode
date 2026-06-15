import * as vscode from 'vscode';
import { SecurityFilter } from './securityFilter';
import { WorkspaceIndexer } from './workspaceIndexer';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface RequestContext {
    activeFile?: { fsPath: string; content: string; language: string };
    selection?: string;
    projectTree?: string;
    attachedFiles?: Array<{ fsPath: string; content: string }>;
    searchResults?: string;
}

const MAX_HISTORY_MESSAGES = 10;
const MAX_FILE_CHARS = 50_000;

export class ContextBuilder {
    constructor(private readonly indexer: WorkspaceIndexer) {}

    /**
     * Assembles a system prompt and message list ready to send to Claude.
     */
    async buildPrompt(
        userMessage: string,
        ctx: RequestContext,
        history: ConversationMessage[],
    ): Promise<{ system: string; messages: ConversationMessage[] }> {
        const systemParts: string[] = [
            'You are SoftCode AI, an intelligent coding assistant integrated directly into VS Code.',
            'You have full access to the user\'s workspace: project structure, active file, and search results are provided below.',
            'Always use the workspace context to give specific, grounded answers. Reference actual file names and line numbers when relevant.',
            'If the user asks about code without specifying a file, look at the active file and search results provided.',
            'Be concise and practical. Prefer focused code examples over lengthy explanations.',
            'When suggesting code changes, clearly show the before/after diff or the exact replacement.',
            'Never reveal, repeat, or log API keys, credentials, or secrets.',
        ];

        if (ctx.projectTree) {
            systemParts.push(`\n## Project Structure\n\`\`\`\n${ctx.projectTree}\n\`\`\``);
        }

        if (ctx.activeFile) {
            const { fsPath, content, language } = ctx.activeFile;
            systemParts.push(
                `\n## Active File: ${fsPath}\n\`\`\`${language}\n${content}\n\`\`\``,
            );
        }

        if (ctx.selection) {
            systemParts.push(`\n## Selected Code\n\`\`\`\n${ctx.selection}\n\`\`\``);
        }

        if (ctx.attachedFiles?.length) {
            for (const file of ctx.attachedFiles) {
                systemParts.push(
                    `\n## Attached File: ${file.fsPath}\n\`\`\`\n${file.content}\n\`\`\``,
                );
            }
        }

        if (ctx.searchResults) {
            systemParts.push(`\n## Workspace Search Results\n${ctx.searchResults}`);
        }

        const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

        return {
            system: systemParts.join('\n'),
            messages: [...trimmedHistory, { role: 'user', content: userMessage }],
        };
    }

    /** Reads the active editor file and returns context, or undefined if blocked/unavailable. */
    async buildActiveFileContext(): Promise<RequestContext['activeFile'] | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const fsPath = editor.document.uri.fsPath;
        if (SecurityFilter.isBlockedFile(fsPath)) {
            return undefined;
        }

        const raw = editor.document.getText();
        const content = SecurityFilter.sanitizeContent(
            raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) + '\n… [truncated]' : raw,
        );

        return {
            fsPath,
            content,
            language: editor.document.languageId,
        };
    }

    /** Returns the currently selected text, or undefined if the selection is empty. */
    async buildSelectionContext(): Promise<string | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            return undefined;
        }
        const raw = editor.document.getText(editor.selection);
        return SecurityFilter.sanitizeContent(raw);
    }
}
