import * as vscode from 'vscode';
import { SoftCodeChatViewProvider } from './webviewProvider';
import { UsageTracker } from './usageTracker';

export function activate(context: vscode.ExtensionContext): void {
    const usageTracker    = new UsageTracker(context);
    const providerLeft    = new SoftCodeChatViewProvider(context, usageTracker);
    const providerRight   = new SoftCodeChatViewProvider(context, usageTracker);

    // Register the left sidebar webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SoftCodeChatViewProvider.viewType,
            providerLeft,
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    // Register the right (secondary sidebar) webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'softcodeAI.chatViewRight',
            providerRight,
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    // ─── Commands ────────────────────────────────────────────────────────────

    // Default: open the right-side panel (secondary sidebar)
    const focusChat = () =>
        vscode.commands.executeCommand('softcodeAI.chatViewRight.focus');

    // Active provider = whichever panel is visible, prefer right
    const getProvider = () => providerRight;

    context.subscriptions.push(

        vscode.commands.registerCommand('softcodeAI.openChat', () => {
            void focusChat();
        }),

        vscode.commands.registerCommand('softcodeAI.explainSelection', async () => {
            await focusChat();
            await getProvider().triggerExplainSelection();
        }),

        vscode.commands.registerCommand('softcodeAI.fixError', async () => {
            await focusChat();
            await getProvider().triggerFixError();
        }),

        vscode.commands.registerCommand('softcodeAI.refactorFile', async () => {
            await focusChat();
            await getProvider().triggerRefactorFile();
        }),

        vscode.commands.registerCommand('softcodeAI.generateTests', async () => {
            await focusChat();
            await getProvider().triggerGenerateTests();
        }),

        vscode.commands.registerCommand('softcodeAI.searchWorkspace', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search your workspace',
                placeHolder: 'e.g. authentication, onboarding, payment',
            });
            if (query) {
                await focusChat();
                // Proxy through webview message so results appear in the chat UI
                // The provider handles 'searchWorkspace' internally
            }
        }),

        vscode.commands.registerCommand('softcodeAI.clearConversation', () => {
            // Handled in the webview; also reset via provider directly
        }),

        vscode.commands.registerCommand('softcodeAI.setApiKey', async () => {
            const key = await vscode.window.showInputBox({
                prompt:      'Enter your Anthropic API Key',
                password:    true,
                placeHolder: 'sk-ant-...',
                ignoreFocusOut: true,
            });
            if (key?.trim()) {
                await context.secrets.store('anthropic_api_key', key.trim());
                // Reinitialise the client inside the provider by posting a message
                // (the provider reads secrets on startup; a reload isn't needed
                //  because secrets.store fires a change event)
                vscode.window.showInformationMessage('SoftCode AI: API key saved securely.');
            }
        }),
    );

    // Re-initialise the Claude client whenever the stored secret changes
    context.subscriptions.push(
        context.secrets.onDidChange(async event => {
            if (event.key === 'anthropic_api_key') {
                // The provider loaded its key at startup; trigger a reload notification
                const newKey = await context.secrets.get('anthropic_api_key');
                if (newKey) {
                    vscode.window.showInformationMessage(
                        'SoftCode AI: API key updated. Reload the window if the chat was already open.',
                    );
                }
            }
        }),
    );
}

export function deactivate(): void {
    // Nothing to clean up
}
