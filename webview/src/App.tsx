import React, { useState, useEffect, useCallback } from 'react';
import Chat from './Chat';
import ModelSelector from './ModelSelector';
import { vscode, type ModelId, type ChatMessage, type UsageStats } from './types';

export default function App(): React.ReactElement {
    const [messages,       setMessages]       = useState<ChatMessage[]>([]);
    const [isStreaming,    setIsStreaming]     = useState(false);
    const [selectedModel,  setSelectedModel]  = useState<ModelId>('claude-sonnet-4-5');
    const [useActiveFile,  setUseActiveFile]  = useState(false);
    const [useSelection,   setUseSelection]   = useState(false);
    const [showSettings,   setShowSettings]   = useState(false);
    const [apiKeyInput,    setApiKeyInput]    = useState('');
    const [stats,          setStats]          = useState<UsageStats | null>(null);

    // ─── Listen to messages from the extension ─────────────────────────────
    useEffect(() => {
        const handler = (event: MessageEvent<Record<string, unknown>>) => {
            const msg = event.data;
            switch (msg['type']) {

                case 'streamStart': {
                    setIsStreaming(true);
                    const userMsg = msg['userMessage'] as string | undefined;
                    setMessages(prev => {
                        const next: ChatMessage[] = userMsg
                            ? [...prev, { id: `u-${Date.now()}`, role: 'user', content: userMsg }]
                            : prev;
                        return [...next, { id: 'streaming', role: 'assistant', content: '', isStreaming: true }];
                    });
                    break;
                }

                case 'streamChunk':
                    setMessages(prev =>
                        prev.map(m =>
                            m.id === 'streaming'
                                ? { ...m, content: m.content + (msg['text'] as string) }
                                : m,
                        ),
                    );
                    break;

                case 'streamEnd': {
                    setIsStreaming(false);
                    const usage = msg['usage'] as ChatMessage['usage'];
                    setMessages(prev =>
                        prev.map(m =>
                            m.id === 'streaming'
                                ? { ...m, id: `a-${Date.now()}`, isStreaming: false, usage }
                                : m,
                        ),
                    );
                    break;
                }

                case 'error': {
                    setIsStreaming(false);
                    const errorText = msg['message'] as string;
                    setMessages(prev => [
                        ...prev.filter(m => m.id !== 'streaming'),
                        { id: `e-${Date.now()}`, role: 'assistant', content: `⚠️ ${errorText}` },
                    ]);
                    break;
                }

                case 'stats':
                    setStats(msg['data'] as UsageStats);
                    break;

                case 'apiKeySet':
                    setShowSettings(false);
                    setApiKeyInput('');
                    break;
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // ─── Actions ───────────────────────────────────────────────────────────
    const handleSend = useCallback((content: string) => {
        if (!content.trim() || isStreaming) return;

        setMessages(prev => [
            ...prev,
            { id: `u-${Date.now()}`, role: 'user', content },
        ]);

        vscode.postMessage({
            type: 'send',
            content,
            model: selectedModel,
            useActiveFile,
            useSelection,
        });
    }, [isStreaming, selectedModel, useActiveFile, useSelection]);

    const handleClear = useCallback(() => {
        setMessages([]);
        vscode.postMessage({ type: 'clear' });
    }, []);

    const handleModelChange = useCallback((model: ModelId) => {
        setSelectedModel(model);
        vscode.postMessage({ type: 'setModel', model });
    }, []);

    const handleSaveApiKey = useCallback(() => {
        const key = apiKeyInput.trim();
        if (key) {
            vscode.postMessage({ type: 'setApiKey', key });
        }
    }, [apiKeyInput]);

    const handleShowStats = useCallback(() => {
        vscode.postMessage({ type: 'getStats' });
        setShowSettings(s => !s);
    }, []);

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="header-title">
                    <span className="logo">⚡</span>
                    <span>SoftCode AI</span>
                </div>
                <div className="header-actions">
                    <button className="icon-btn" onClick={handleShowStats} title="Settings & stats">
                        ⚙️
                    </button>
                    <button className="icon-btn" onClick={handleClear} title="Clear conversation">
                        🗑️
                    </button>
                </div>
            </header>

            {/* Settings / Stats panel */}
            {showSettings && (
                <div className="settings-panel">
                    <h3>Settings</h3>

                    <div className="setting-row">
                        <label>Anthropic API Key</label>
                        <div className="api-key-input">
                            <input
                                type="password"
                                placeholder="sk-ant-..."
                                value={apiKeyInput}
                                onChange={e => setApiKeyInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                            />
                            <button onClick={handleSaveApiKey}>Save</button>
                        </div>
                    </div>

                    {stats && (
                        <div className="stats">
                            <div className="stat-row">
                                <span>Daily cost</span>
                                <span>${stats.dailyCost.toFixed(4)}</span>
                            </div>
                            <div className="stat-row">
                                <span>Total cost</span>
                                <span>${stats.totalCost.toFixed(4)}</span>
                            </div>
                            <div className="stat-row">
                                <span>Requests</span>
                                <span>{stats.totalRequests}</span>
                            </div>
                            <div className="stat-row">
                                <span>Tokens used</span>
                                <span>{stats.totalTokens.toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Context bar */}
            <div className="context-bar">
                <ModelSelector selectedModel={selectedModel} onModelChange={handleModelChange} />
                <div className="context-toggles">
                    <button
                        className={`toggle-btn ${useActiveFile ? 'active' : ''}`}
                        onClick={() => setUseActiveFile(v => !v)}
                        title="Include active file in context"
                    >
                        📄 File
                    </button>
                    <button
                        className={`toggle-btn ${useSelection ? 'active' : ''}`}
                        onClick={() => setUseSelection(v => !v)}
                        title="Include selected code in context"
                    >
                        ✂️ Selection
                    </button>
                </div>
            </div>

            {/* Chat */}
            <Chat messages={messages} isStreaming={isStreaming} onSend={handleSend} />
        </div>
    );
}
