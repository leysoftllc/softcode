import * as vscode from 'vscode';
import type { MessageParam, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { SecurityFilter } from './securityFilter';
import { WorkspaceIndexer } from './workspaceIndexer';

export type Mode = 'ask' | 'analyze' | 'edit';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: MessageParam['content'];
}

export interface RequestContext {
    activeFile?: { fsPath: string; content: string; language: string };
    selection?: string;
    projectTree?: string;
    attachedFiles?: Array<{ fsPath: string; content: string }>;
    attachedImages?: Array<{ label: string; mimeType: ImageBlockParam.Source['media_type']; dataBase64: string }>;
    searchResults?: string;
    fileBundle?: string;   // multiple related files merged
}

const MAX_HISTORY_MESSAGES = 10;
const MAX_FILE_CHARS = 50_000;

const MODE_SYSTEM: Record<Mode, string[]> = {
    ask: [
        'You are SoftCode AI, an intelligent coding assistant inside VS Code.',
        'You have full access to the workspace. Use the provided context (project tree, active file, related files) to give specific, accurate answers.',
        'Reference actual filenames and line numbers. Never say you cannot see code when context is provided.',
        'Be concise and practical.',
        'Never reveal API keys, credentials, or secrets.',
    ],
    analyze: [
        'You are SoftCode AI in ANALYZE mode — a senior engineer performing a deep code review.',
        'You have been given the active file and related workspace files. Analyze them thoroughly.',
        'Structure your response as:',
        '1. File analyzed (name + purpose)',
        '2. Issues found — numbered list, each with: description, location (file:line if possible), severity (High/Medium/Low), confidence %',
        '3. Brief summary',
        '4. End with: "Generate fixes for all issues?" or "Which issue should I fix first?"',
        'If no issues are found, say so clearly and suggest improvements.',
        'Never say you cannot see code when context is provided. Never ask for code to be pasted.',
    ],
    edit: [
        'You are SoftCode AI in EDIT mode — you directly write code changes into files.',
        'When editing a file, output the COMPLETE new file content in a fenced code block.',
        'Mark each edit block with the file path on the FIRST line using this exact format:',
        '  // @@softcode-edit: relative/path/to/file.ext',
        'Example:',
        '```typescript',
        '// @@softcode-edit: src/utils/helpers.ts',
        '// full new file content here…',
        '```',
        'Always output the full file — never partial snippets.',
        'If multiple files must change, output one block per file.',
        'Explain changes briefly BEFORE each edit block.',
        'Never make changes beyond what was requested.',
        'Never reveal API keys, credentials, or secrets.',
    ],
};

export class ContextBuilder {
    constructor(private readonly indexer: WorkspaceIndexer) {}

    /**
     * Assembles a system prompt and message list ready to send to Claude.
     */
    async buildPrompt(
        userMessage: string,
        ctx: RequestContext,
        history: ConversationMessage[],
        mode: Mode = 'ask',
    ): Promise<{ system: string; messages: ConversationMessage[] }> {
        const systemParts: string[] = [...MODE_SYSTEM[mode]];

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

        if (ctx.fileBundle) {
            systemParts.push(`\n## Related Files\n${ctx.fileBundle}`);
        }

        if (ctx.attachedFiles?.length) {
            for (const file of ctx.attachedFiles) {
                systemParts.push(
                    `\n## Attached File: ${file.fsPath}\n\`\`\`\n${file.content}\n\`\`\``,
                );
            }
        }

        if (ctx.attachedImages?.length) {
            systemParts.push(
                `\n## Attached Images\n${ctx.attachedImages.map(image => `- ${image.label} (${image.mimeType})`).join('\n')}`,
            );
        }

        if (ctx.searchResults) {
            systemParts.push(`\n## Workspace Search Results\n${ctx.searchResults}`);
        }

        const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

        const userContent: MessageParam['content'] = ctx.attachedImages?.length
            ? [
                { type: 'text', text: userMessage },
                ...ctx.attachedImages.map(image => ({
                    type: 'image' as const,
                    source: {
                        type: 'base64' as const,
                        media_type: image.mimeType,
                        data: image.dataBase64,
                    },
                })),
            ]
            : userMessage;

        return {
            system: systemParts.join('\n'),
            messages: [...trimmedHistory, { role: 'user', content: userContent }],
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
