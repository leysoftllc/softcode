import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeClient, ModelId } from './claudeClient';
import { ContextBuilder, ConversationMessage, RequestContext } from './contextBuilder';
import { WorkspaceIndexer } from './workspaceIndexer';
import { UsageTracker } from './usageTracker';
import { PatchManager } from './patchManager';

export class SoftCodeChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'softcodeAI.chatView';

    private _view?: vscode.WebviewView;

    private readonly claudeClient   = new ClaudeClient();
    private readonly indexer        = new WorkspaceIndexer();
    private readonly contextBuilder = new ContextBuilder(this.indexer);
    private readonly patchManager   = new PatchManager();

    private conversationHistory: ConversationMessage[] = [];
    private currentModel: ModelId = 'claude-sonnet-4-5';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly usageTracker: UsageTracker,
    ) {
        void this.loadApiKey();
    }

    // ─── WebviewViewProvider ────────────────────────────────────────────────

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _ctx: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist'),
            ],
        };

        webviewView.webview.html = this.buildHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            (msg: unknown) => void this.handleMessage(msg),
            undefined,
            this.context.subscriptions,
        );
    }

    // ─── Message handler ────────────────────────────────────────────────────

    private async handleMessage(raw: unknown): Promise<void> {
        const msg = raw as Record<string, unknown>;

        switch (msg['type']) {
            case 'send':
                await this.handleChat(
                    String(msg['content'] ?? ''),
                    String(msg['model']  ?? this.currentModel) as ModelId,
                    Boolean(msg['useActiveFile']),
                    Boolean(msg['useSelection']),
                );
                break;

            case 'clear':
                this.conversationHistory = [];
                break;

            case 'setModel':
                this.currentModel = String(msg['model']) as ModelId;
                break;

            case 'setApiKey': {
                const key = String(msg['key'] ?? '').trim();
                if (key) {
                    await this.context.secrets.store('anthropic_api_key', key);
                    this.claudeClient.setApiKey(key);
                    this.post({ type: 'apiKeySet', success: true });
                }
                break;
            }

            case 'getStats':
                this.post({ type: 'stats', data: this.usageTracker.getStats() });
                break;

            case 'searchWorkspace':
                await this.handleSearch(String(msg['query'] ?? ''));
                break;
        }
    }

    // ─── Chat ───────────────────────────────────────────────────────────────

    private async handleChat(
        content: string,
        model: ModelId,
        useActiveFile: boolean,
        useSelection: boolean,
    ): Promise<void> {
        if (!content.trim()) {
            return;
        }

        const ctx: RequestContext = await this.buildWorkspaceContext(
            content,
            useActiveFile,
            useSelection,
        );

        await this.stream(content, model, ctx);
    }

    /**
     * Automatically gathers relevant workspace context for a user message.
     *
     * Always included:
     *   - Project tree (top-level structure)
     *   - Active file (unless blocked)
     *
     * Auto-included when relevant:
     *   - Selected code (if there is a selection)
     *   - File + content search results matching keywords from the message
     *
     * Manual toggles still respected and can add context on top.
     */
    private async buildWorkspaceContext(
        message: string,
        forceActiveFile: boolean,
        forceSelection: boolean,
    ): Promise<RequestContext> {
        const ctx: RequestContext = {};

        // 1. Project tree – always provided so Claude understands the project layout
        ctx.projectTree = await this.indexer.getProjectTree(3);

        // 2. Active file – included by default (not just when toggled)
        ctx.activeFile = await this.contextBuilder.buildActiveFileContext();

        // 3. Selection – include if forced, or if there is an active selection
        const selection = await this.contextBuilder.buildSelectionContext();
        if (selection || forceSelection) {
            ctx.selection = selection;
        }

        // 4. Automatic workspace search based on keywords in the message
        const keywords = this.extractKeywords(message);
        if (keywords.length > 0) {
            const query = keywords.join(' ');
            const [fileResults, contentResults] = await Promise.all([
                this.indexer.searchFiles(query, 10),
                this.indexer.searchContent(query, 8),
            ]);

            // Filter out the active file (already included above) to avoid duplication
            const activePath = ctx.activeFile?.fsPath;
            const relevantFiles = fileResults.filter(f => f.fsPath !== activePath);
            const relevantContent = contentResults.filter(f => f.fsPath !== activePath);

            if (relevantFiles.length > 0 || relevantContent.length > 0) {
                const parts: string[] = [];

                if (relevantFiles.length > 0) {
                    parts.push('### Matching files');
                    relevantFiles.forEach(f =>
                        parts.push(`- ${f.relativePath}`),
                    );
                }

                if (relevantContent.length > 0) {
                    parts.push('\n### Matching code snippets');
                    relevantContent.forEach(f => {
                        parts.push(`**${f.relativePath}**`);
                        if (f.snippet) {
                            parts.push('```\n' + f.snippet + '\n```');
                        }
                    });
                }

                ctx.searchResults = parts.join('\n');
            }
        }

        // 5. If the user explicitly toggled active-file but it was blocked/unavailable, warn
        if (forceActiveFile && !ctx.activeFile) {
            ctx.searchResults = (ctx.searchResults ?? '') +
                '\n\n> Note: active file is unavailable or filtered for security reasons.';
        }

        return ctx;
    }

    /** Extract meaningful keywords from a user message for workspace searching. */
    private extractKeywords(message: string): string[] {
        // Strip common filler words
        const STOPWORDS = new Set([
            'a', 'an', 'the', 'is', 'it', 'in', 'of', 'to', 'and', 'or',
            'this', 'that', 'for', 'my', 'me', 'what', 'how', 'why', 'when',
            'can', 'you', 'i', 'be', 'do', 'are', 'has', 'with', 'on',
            'need', 'want', 'help', 'please', 'fix', 'show', 'tell', 'get',
            'make', 'let', 'give', 'look', 'check', 'write', 'find', 'read',
        ]);

        return message
            .toLowerCase()
            .replace(/[^a-z0-9 _-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOPWORDS.has(w))
            .slice(0, 5); // top 5 keywords
    }

    private async stream(
        userMessage: string,
        model: ModelId,
        ctx: RequestContext,
        displayMessage?: string,
    ): Promise<void> {
        const { system, messages } = await this.contextBuilder.buildPrompt(
            userMessage,
            ctx,
            this.conversationHistory,
        );

        this.post({ type: 'streamStart', userMessage: displayMessage });

        let fullResponse = '';

        await this.claudeClient.streamMessage(model, system, messages, {
            onText: text => {
                fullResponse += text;
                this.post({ type: 'streamChunk', text });
            },
            onComplete: (inputTokens, outputTokens) => {
                const record = this.usageTracker.track(model, inputTokens, outputTokens);
                this.post({
                    type: 'streamEnd',
                    usage: {
                        inputTokens,
                        outputTokens,
                        cost: record.estimatedCostUsd,
                    },
                });
                this.conversationHistory.push(
                    { role: 'user',      content: userMessage   },
                    { role: 'assistant', content: fullResponse  },
                );
            },
            onError: error => {
                this.post({ type: 'error', message: error });
            },
        });
    }

    // ─── Workspace search ───────────────────────────────────────────────────

    private async handleSearch(query: string): Promise<void> {
        const [files, content] = await Promise.all([
            this.indexer.searchFiles(query),
            this.indexer.searchContent(query),
        ]);
        this.post({ type: 'searchResults', files, content });
    }

    // ─── External triggers (called from extension commands) ─────────────────

    public async triggerExplainSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = await this.contextBuilder.buildSelectionContext();
        if (!selection) {
            vscode.window.showWarningMessage('SoftCode AI: No code selected.');
            return;
        }

        const fileName = path.basename(editor.document.uri.fsPath);
        await this.stream(
            `Explain this code from ${fileName}`,
            this.currentModel,
            { selection },
            `Explain selection in ${fileName}`,
        );
    }

    public async triggerFixError(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const activeFile = await this.contextBuilder.buildActiveFileContext();
        const fileName   = path.basename(editor.document.uri.fsPath);
        await this.stream(
            `Find and fix errors or bugs in this file.`,
            this.currentModel,
            { activeFile },
            `Fix errors in ${fileName}`,
        );
    }

    public async triggerRefactorFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const activeFile = await this.contextBuilder.buildActiveFileContext();
        const fileName   = path.basename(editor.document.uri.fsPath);
        await this.stream(
            `Refactor this file to improve readability, maintainability, and performance. Explain the key changes.`,
            this.currentModel,
            { activeFile },
            `Refactor ${fileName}`,
        );
    }

    public async triggerGenerateTests(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const activeFile = await this.contextBuilder.buildActiveFileContext();
        const fileName   = path.basename(editor.document.uri.fsPath);
        await this.stream(
            `Generate comprehensive unit tests for this file. Use the appropriate test framework for the language.`,
            this.currentModel,
            { activeFile },
            `Generate tests for ${fileName}`,
        );
    }

    // ─── HTML generation ────────────────────────────────────────────────────

    private buildHtml(webview: vscode.Webview): string {
        const distPath = path.join(this.context.extensionUri.fsPath, 'webview', 'dist');

        let jsFile: string | undefined;
        let cssFile: string | undefined;

        try {
            const files = fs.readdirSync(distPath);
            jsFile  = files.find(f => f === 'index.js' || (f.startsWith('index') && f.endsWith('.js')));
            cssFile = files.find(f => f === 'index.css' || (f.startsWith('index') && f.endsWith('.css')));
        } catch {
            return this.buildSetupHtml();
        }

        if (!jsFile) {
            return this.buildSetupHtml();
        }

        const distUri  = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist');
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, jsFile));
        const styleUri  = cssFile
            ? webview.asWebviewUri(vscode.Uri.joinPath(distUri, cssFile))
            : undefined;

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${webview.cspSource} https: data:;
                 script-src 'nonce-${nonce}';
                 style-src ${webview.cspSource} 'unsafe-inline';">
  <title>SoftCode AI</title>
  ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private buildSetupHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <h3>⚡ SoftCode AI</h3>
  <p>Build the webview UI to get started:</p>
  <pre>cd webview
npm install
npm run build</pre>
  <p>Then reload the window (<code>Cmd+Shift+P → Developer: Reload Window</code>).</p>
</body>
</html>`;
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private post(message: Record<string, unknown>): void {
        void this._view?.webview.postMessage(message);
    }

    private async loadApiKey(): Promise<void> {
        const key = await this.context.secrets.get('anthropic_api_key');
        if (key) {
            this.claudeClient.setApiKey(key);
        }
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () =>
            chars[Math.floor(Math.random() * chars.length)],
        ).join('');
    }
}
