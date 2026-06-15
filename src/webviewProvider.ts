import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeClient, ModelId } from './claudeClient';
import { ContextBuilder, ConversationMessage, RequestContext, Mode } from './contextBuilder';
import { WorkspaceIndexer } from './workspaceIndexer';
import { UsageTracker } from './usageTracker';
import { PatchManager } from './patchManager';
import { SessionManager, SavedSession } from './sessionManager';

type ContextScope = 'file' | 'selection' | 'workspace' | 'search';

export class SoftCodeChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'softcodeAI.chatView';

    private _view?: vscode.WebviewView;

    private readonly claudeClient   = new ClaudeClient();
    private readonly indexer        = new WorkspaceIndexer();
    private readonly contextBuilder = new ContextBuilder(this.indexer);
    private readonly patchManager   = new PatchManager();
    private readonly sessionManager: SessionManager;

    private conversationHistory: ConversationMessage[] = [];
    private currentModel: ModelId = 'claude-sonnet-4-5';
    private currentSessionId: string = `s-${Date.now()}`;
    // serialised messages kept in sync for session save
    private currentMessages: unknown[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly usageTracker: UsageTracker,
    ) {
        this.sessionManager = new SessionManager(context);
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

        // Push session list to webview once it's ready
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.post({ type: 'sessions', list: this.sessionManager.list() });
            }
        });
        this.post({ type: 'sessions', list: this.sessionManager.list() });
    }

    // ─── Message handler ────────────────────────────────────────────────────

    private async handleMessage(raw: unknown): Promise<void> {
        const msg = raw as Record<string, unknown>;

        switch (msg['type']) {
            case 'send':
                await this.handleChat(
                    String(msg['content'] ?? ''),
                    String(msg['model']  ?? this.currentModel) as ModelId,
                    String(msg['mode']   ?? 'ask') as Mode,
                    (msg['contextScopes'] as ContextScope[]) ?? ['file', 'workspace'],
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

            // ── Session management ──────────────────────────────────────────
            case 'listSessions':
                this.post({ type: 'sessions', list: this.sessionManager.list() });
                break;

            case 'loadSession': {
                const sid     = String(msg['id']);
                const session = this.sessionManager.load(sid);
                if (session) {
                    this.currentSessionId   = session.id;
                    this.currentMessages    = session.messages;
                    this.conversationHistory = session.history as ConversationMessage[];
                    this.post({ type: 'sessionLoaded', session });
                }
                break;
            }

            case 'deleteSession': {
                this.sessionManager.delete(String(msg['id']));
                this.post({ type: 'sessions', list: this.sessionManager.list() });
                break;
            }

            case 'newSession':
                this.currentSessionId    = `s-${Date.now()}`;
                this.currentMessages     = [];
                this.conversationHistory = [];
                this.post({ type: 'sessions', list: this.sessionManager.list() });
                break;

            // Webview syncs its messages array so we can persist them
            case 'syncMessages':
                this.currentMessages = (msg['messages'] as unknown[]) ?? [];
                break;

            // ── File navigation ─────────────────────────────────────────────
            case 'openFile': {
                const filePath = String(msg['path'] ?? '');
                if (!filePath) break;
                const folders  = vscode.workspace.workspaceFolders;
                const root     = folders?.[0]?.uri.fsPath ?? '';
                const fullPath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(root, filePath);
                const uri = vscode.Uri.file(fullPath);
                void vscode.window.showTextDocument(uri, {
                    preview:       false,
                    preserveFocus: false,
                });
                break;
            }
        }
    }

    // ─── Smart agent chat ────────────────────────────────────────────────────

    private async handleChat(
        content: string,
        model: ModelId,
        mode: Mode,
        scopes: ContextScope[],
    ): Promise<void> {
        if (!content.trim()) return;

        const msgId = `a-${Date.now()}`;

        // Build the execution plan upfront so the UI shows it immediately
        const plan = this.buildPlan(mode, scopes);

        // Signal webview: create placeholder + post plan
        this.post({ type: 'agentStart', msgId });
        this.post({ type: 'agentPlan', msgId, todos: plan.map(p => ({ ...p, status: 'not-started' })) });

        const updateTodo = (id: string, status: 'in-progress' | 'completed') =>
            this.post({ type: 'todoUpdate', msgId, id, status });

        // Build context with live status + todo updates
        const { ctx, contextInfo } = await this.buildSmartContext(
            content, scopes, mode, msgId, updateTodo,
        );

        // Send context info so the indicator updates before the stream
        this.post({ type: 'contextReady', info: contextInfo });

        // Mark generate step as in-progress, then stream
        updateTodo('generate', 'in-progress');
        await this.streamWithId(content, model, ctx, mode, msgId, contextInfo, () => {
            updateTodo('generate', 'completed');
        });
    }

    /** Builds a structured execution plan based on mode + context scopes. */
    private buildPlan(mode: Mode, scopes: ContextScope[]): Array<{ id: string; text: string }> {
        const steps: Array<{ id: string; text: string }> = [];

        if (scopes.includes('file') || mode === 'analyze' || mode === 'edit') {
            steps.push({ id: 'read-file', text: 'Read active file' });
        }
        if (scopes.includes('selection')) {
            steps.push({ id: 'read-selection', text: 'Read selected code' });
        }
        if (scopes.includes('workspace') || scopes.includes('search') || mode === 'analyze') {
            steps.push({ id: 'search', text: 'Search workspace' });
        }
        if (mode === 'analyze') {
            steps.push({ id: 'trace', text: 'Trace related files' });
            steps.push({ id: 'generate', text: 'Analyze code' });
        } else if (mode === 'edit') {
            steps.push({ id: 'generate', text: 'Generate patches' });
        } else {
            steps.push({ id: 'generate', text: 'Generate answer' });
        }

        return steps;
    }

    /**
     * Gathers workspace context autonomously, posting status steps to the webview
     * so the user sees exactly what SoftCode is reading.
     */
    private async buildSmartContext(
        message: string,
        scopes: ContextScope[],
        mode: Mode,
        msgId: string,
        updateTodo: (id: string, status: 'in-progress' | 'completed') => void,
    ): Promise<{ ctx: RequestContext; contextInfo: { files: string[]; tokens: number; estimatedCost: number } }> {
        const ctx: RequestContext = {};
        const attachedFiles: string[] = [];

        const status = (text: string) => this.post({ type: 'agentStatus', msgId, text });

        // ── 1. Active file ───────────────────────────────────────────────────
        const editor = vscode.window.activeTextEditor;

        if (editor && (scopes.includes('file') || mode === 'analyze')) {
            const fileName = path.basename(editor.document.uri.fsPath);
            updateTodo('read-file', 'in-progress');
            status(`🔍 Checking active editor...`);

            const activeFile = await this.contextBuilder.buildActiveFileContext();
            if (activeFile) {
                ctx.activeFile = activeFile;
                attachedFiles.push(fileName);
                status(`📄 Found: ${fileName}`);
            }
            updateTodo('read-file', 'completed');
        } else if (!editor && scopes.includes('file')) {
            updateTodo('read-file', 'in-progress');
            status(`📂 No active file — using workspace search`);
            updateTodo('read-file', 'completed');
        }

        // ── 2. Selection ─────────────────────────────────────────────────────
        if (scopes.includes('selection')) {
            updateTodo('read-selection', 'in-progress');
            const sel = await this.contextBuilder.buildSelectionContext();
            if (sel) {
                ctx.selection = sel;
                status(`✂️  Selection included`);
            }
            updateTodo('read-selection', 'completed');
        }

        // ── 3. Project tree ──────────────────────────────────────────────────
        if (scopes.includes('workspace') || !editor) {
            ctx.projectTree = await this.indexer.getProjectTree(3);
        }

        // ── 4. Keyword search across workspace ───────────────────────────────
        if (scopes.includes('workspace') || scopes.includes('search') || !editor) {
            const keywords = this.extractKeywords(message);
            if (keywords.length > 0) {
                updateTodo('search', 'in-progress');
                status(`🔎 Searching workspace for: ${keywords.slice(0, 3).join(', ')}...`);

                const [fileResults, contentResults] = await Promise.all([
                    this.indexer.searchFiles(keywords.join(' '), 8),
                    this.indexer.searchContent(keywords.join(' '), 6),
                ]);

                const activePath = ctx.activeFile?.fsPath;
                const relevant = [
                    ...fileResults.filter(f => f.fsPath !== activePath),
                    ...contentResults.filter(f => f.fsPath !== activePath),
                ].filter((v, i, a) => a.findIndex(x => x.fsPath === v.fsPath) === i)
                 .slice(0, 6);

                if (relevant.length > 0) {
                    const relPaths = relevant.map(r => r.relativePath);
                    this.post({ type: 'agentFiles', msgId, files: relPaths });
                    status(`✓ Found ${relevant.length} related file${relevant.length > 1 ? 's' : ''}`);
                    attachedFiles.push(...relPaths);

                    // For analyze/edit mode, read full content of related files
                    if (mode === 'analyze' || mode === 'edit') {
                        const bundle = await this.indexer.buildFileBundle(
                            relevant.map(r => r.fsPath),
                        );
                        ctx.fileBundle = bundle.content;
                    } else {
                        // For ask mode, just show snippets
                        const parts: string[] = [];
                        relevant.forEach(f => {
                            if (f.snippet) {
                                parts.push(`**${f.relativePath}**\n\`\`\`\n${f.snippet}\n\`\`\``);
                            } else {
                                parts.push(`- ${f.relativePath}`);
                            }
                        });
                        ctx.searchResults = parts.join('\n\n');
                    }
                } else {
                    status(`📭 No matching files found`);
                }
                updateTodo('search', 'completed');
            }
        }

        // ── 5. Analyze mode: also find related files to active file ──────────
        if (mode === 'analyze' && ctx.activeFile) {
            updateTodo('trace', 'in-progress');
            const related = await this.indexer.findRelatedFiles(ctx.activeFile.fsPath, 4);
            if (related.length > 0) {
                const extra = related.map(r => r.relativePath);
                status(`🔗 Tracing ${extra.length} related file${extra.length > 1 ? 's' : ''}...`);
                const bundle = await this.indexer.buildFileBundle(related.map(r => r.fsPath));
                ctx.fileBundle = (ctx.fileBundle ? ctx.fileBundle + '\n\n' : '') + bundle.content;
                attachedFiles.push(...extra.filter(e => !attachedFiles.includes(e)));
                this.post({ type: 'agentFiles', msgId, files: attachedFiles });
            }
            updateTodo('trace', 'completed');
        }

        // Rough token estimate: ~4 chars per token
        const contextText = [
            ctx.projectTree ?? '',
            ctx.activeFile?.content ?? '',
            ctx.selection ?? '',
            ctx.fileBundle ?? '',
            ctx.searchResults ?? '',
        ].join('');
        const tokens = Math.ceil(contextText.length / 4);
        const costPer1M = model => ({ 'claude-haiku-4-5': 0.80, 'claude-sonnet-4-5': 3.00, 'claude-opus-4-5': 15.00 })[model] ?? 3.00;
        const estimatedCost = (tokens / 1_000_000) * costPer1M(this.currentModel);

        return {
            ctx,
            contextInfo: { files: attachedFiles, tokens, estimatedCost },
        };
    }

    private async streamWithId(
        userMessage: string,
        model: ModelId,
        ctx: RequestContext,
        mode: Mode,
        msgId: string,
        contextInfo: { files: string[]; tokens: number; estimatedCost: number },
        onGenerateComplete?: () => void,
    ): Promise<void> {
        const { system, messages } = await this.contextBuilder.buildPrompt(
            userMessage,
            ctx,
            this.conversationHistory,
            mode,
        );

        let fullResponse = '';

        await this.claudeClient.streamMessage(model, system, messages, {
            onText: text => {
                fullResponse += text;
                this.post({ type: 'streamChunk', msgId, text });
            },
            onComplete: (inputTokens, outputTokens) => {
                const record = this.usageTracker.track(model, inputTokens, outputTokens);
                this.post({
                    type: 'streamEnd',
                    msgId,
                    usage: {
                        inputTokens,
                        outputTokens,
                        cost: record.estimatedCostUsd,
                    },
                    contextInfo,
                });
                this.conversationHistory.push(
                    { role: 'user',      content: userMessage  },
                    { role: 'assistant', content: fullResponse },
                );
                onGenerateComplete?.();

                // In edit mode, automatically apply the generated patches to disk
                if (mode === 'edit') {
                    void this.applyEditPatches(fullResponse);
                }

                // Auto-save session after every completed turn
                void this.autoSaveSession();
            },
            onError: error => {
                this.post({ type: 'error', msgId, message: error });
            },
        });
    }

    /**
     * Parses SoftCode edit blocks from Claude's response and applies them
     * directly to workspace files using VS Code WorkspaceEdit.
     *
     * Expected format in response:
     *   ```<lang>
     *   // @@softcode-edit: relative/path/to/file.ext
     *   <full file content>
     *   ```
     */
    private async applyEditPatches(response: string): Promise<void> {
        const EDIT_RE = /```[\w.-]*\n\/\/ @@softcode-edit:\s*(.+?)\n([\s\S]*?)```/g;
        const edits: Array<{ relPath: string; content: string }> = [];
        let m: RegExpExecArray | null;

        while ((m = EDIT_RE.exec(response)) !== null) {
            const relPath = m[1].trim();
            const content = m[2];
            if (relPath && content !== undefined) {
                edits.push({ relPath, content });
            }
        }

        if (edits.length === 0) return;

        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return;
        const rootPath = folders[0].uri.fsPath;

        const wsEdit = new vscode.WorkspaceEdit();
        const applied: string[] = [];

        for (const { relPath, content } of edits) {
            const fullPath = path.join(rootPath, relPath);
            const uri = vscode.Uri.file(fullPath);
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length),
                );
                wsEdit.replace(uri, fullRange, content);
                applied.push(relPath);
            } catch {
                // File doesn't exist yet — create it
                wsEdit.createFile(uri, { overwrite: true });
                wsEdit.insert(uri, new vscode.Position(0, 0), content);
                applied.push(relPath);
            }
        }

        const success = await vscode.workspace.applyEdit(wsEdit);
        if (success && applied.length > 0) {
            const label = applied.join(', ');
            void vscode.window.showInformationMessage(
                `SoftCode AI: Edited ${applied.length} file${applied.length > 1 ? 's' : ''} — ${label}`,
            );
            // Open the first edited file so user sees the changes
            const firstUri = vscode.Uri.file(path.join(rootPath, applied[0]));
            void vscode.window.showTextDocument(firstUri, { preserveFocus: true, preview: false });
        }
    }

    // ─── Keyword extraction ──────────────────────────────────────────────────

    private extractKeywords(message: string): string[] {
        const STOPWORDS = new Set([
            'a','an','the','is','it','in','of','to','and','or','this','that',
            'for','my','me','what','how','why','when','can','you','i','be',
            'do','are','has','with','on','need','want','help','please','fix',
            'show','tell','get','make','let','give','look','check','write',
            'find','read','also','just','from','at','by','so','if','else',
        ]);
        return message
            .toLowerCase()
            .replace(/[^a-z0-9 _\-.]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOPWORDS.has(w))
            .slice(0, 6);
    }

    // ─── Workspace search ────────────────────────────────────────────────────

    private async handleSearch(query: string): Promise<void> {
        const [files, content] = await Promise.all([
            this.indexer.searchFiles(query),
            this.indexer.searchContent(query),
        ]);
        this.post({ type: 'searchResults', files, content });
    }

    // ─── Session auto-save ───────────────────────────────────────────────────

    /**
     * Called by the webview via 'syncMessages' to keep currentMessages up-to-date,
     * and also internally after each turn to persist the session.
     */
    private autoSaveSession(): void {
        if (this.currentMessages.length === 0 && this.conversationHistory.length === 0) return;

        // Derive title from first user message
        const firstUser = this.conversationHistory.find(m => m.role === 'user');
        const title = firstUser
            ? firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '')
            : 'New session';
        const preview = this.conversationHistory
            .filter(m => m.role === 'assistant')
            .at(-1)?.content.slice(0, 80) ?? '';

        const session: import('./sessionManager').SavedSession = {
            id:        this.currentSessionId,
            title,
            timestamp: Date.now(),
            preview,
            messages:  this.currentMessages,
            history:   this.conversationHistory as unknown[],
        };
        this.sessionManager.save(session);
        this.post({ type: 'sessions', list: this.sessionManager.list() });
    }

    // ─── External command triggers ───────────────────────────────────────────

    public async triggerExplainSelection(): Promise<void> {
        const sel = await this.contextBuilder.buildSelectionContext();
        if (!sel) { vscode.window.showWarningMessage('SoftCode AI: No code selected.'); return; }
        const fileName = vscode.window.activeTextEditor
            ? path.basename(vscode.window.activeTextEditor.document.uri.fsPath) : 'file';
        await this.handleChat(`Explain this code from ${fileName}`, this.currentModel, 'ask', ['selection', 'file']);
    }

    public async triggerFixError(): Promise<void> {
        if (!vscode.window.activeTextEditor) return;
        await this.handleChat('Find and fix all errors and bugs in this file.', this.currentModel, 'analyze', ['file', 'workspace']);
    }

    public async triggerRefactorFile(): Promise<void> {
        if (!vscode.window.activeTextEditor) return;
        await this.handleChat('Refactor this file to improve readability, maintainability, and performance. Explain the key changes.', this.currentModel, 'edit', ['file']);
    }

    public async triggerGenerateTests(): Promise<void> {
        if (!vscode.window.activeTextEditor) return;
        await this.handleChat('Generate comprehensive unit tests for this file. Use the appropriate test framework for the language.', this.currentModel, 'edit', ['file', 'workspace']);
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

        if (!jsFile) return this.buildSetupHtml();

        const distUri   = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist');
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
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; line-height: 1.6; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-family: var(--vscode-editor-font-family); }
    pre  { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; margin-top: 12px; }
  </style>
</head>
<body>
  <h3>⚡ SoftCode AI</h3>
  <p>Build the webview UI to get started:</p>
  <pre>cd webview\nnpm install\nnpm run build</pre>
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
        if (key) this.claudeClient.setApiKey(key);
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }
}
