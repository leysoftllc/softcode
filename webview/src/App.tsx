import React, { useState, useEffect, useCallback } from 'react';
import Chat from './Chat';
import ModelSelector from './ModelSelector';
import {
    vscode,
    type ModelId,
    type Mode,
    type ContextScope,
    type ChatMessage,
    type ContextInfo,
    type UsageStats,
    MODE_INFO,
} from './types';

const SCOPES: { id: ContextScope; label: string }[] = [
    { id: 'file',      label: '📄 File'      },
    { id: 'selection', label: '✂️ Selection'  },
    { id: 'workspace', label: '📁 Workspace'  },
    { id: 'search',    label: '🔍 Search'     },
];

export default function App(): React.ReactElement {
    const [messages,       setMessages]       = useState<ChatMessage[]>([]);
    const [isStreaming,    setIsStreaming]     = useState(false);
    const [selectedModel,  setSelectedModel]  = useState<ModelId>('claude-sonnet-4-5');
    const [mode,           setMode]           = useState<Mode>('ask');
    const [contextScopes,  setContextScopes]  = useState<ContextScope[]>(['file', 'workspace']);
    const [showSettings,   setShowSettings]   = useState(false);
    const [apiKeyInput,    setApiKeyInput]    = useState('');
    const [stats,          setStats]          = useState<UsageStats | null>(null);
    const [liveContext,    setLiveContext]     = useState<ContextInfo | null>(null);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);

    // ─── Extension message bridge ─────────────────────────────────────────
    useEffect(() => {
        const handler = (event: MessageEvent<Record<string, unknown>>) => {
            const msg = event.data;
            switch (msg['type']) {

                // Agent starts: create placeholder message
                case 'agentStart': {
                    const msgId = String(msg['msgId']);
                    setStreamingMsgId(msgId);
                    setIsStreaming(true);
                    setMessages(prev => [
                        ...prev,
                        { id: msgId, role: 'assistant', content: '', isStreaming: true, statuses: [], foundFiles: [] },
                    ]);
                    break;
                }

                // Agent posts a status line (e.g. "🔍 Searching workspace...")
                case 'agentStatus': {
                    const msgId = String(msg['msgId']);
                    const text  = String(msg['text']);
                    setMessages(prev => prev.map(m =>
                        m.id === msgId
                            ? { ...m, statuses: [...(m.statuses ?? []), text] }
                            : m,
                    ));
                    break;
                }

                // Agent found files
                case 'agentFiles': {
                    const msgId = String(msg['msgId']);
                    const files = msg['files'] as string[];
                    setMessages(prev => prev.map(m =>
                        m.id === msgId ? { ...m, foundFiles: files } : m,
                    ));
                    break;
                }

                // Context info ready (files attached, token estimate)
                case 'contextReady': {
                    const info = msg['info'] as ContextInfo;
                    setLiveContext(info);
                    break;
                }

                // Stream starts (AI starts responding)
                case 'streamChunk': {
                    const text = String(msg['text']);
                    setMessages(prev => prev.map(m =>
                        m.isStreaming ? { ...m, content: m.content + text } : m,
                    ));
                    break;
                }

                case 'streamEnd': {
                    setIsStreaming(false);
                    setStreamingMsgId(null);
                    const usage      = msg['usage']      as ChatMessage['usage'];
                    const ctxInfo    = msg['contextInfo'] as ContextInfo | undefined;
                    setMessages(prev => prev.map(m =>
                        m.isStreaming
                            ? { ...m, isStreaming: false, usage, contextInfo: ctxInfo }
                            : m,
                    ));
                    if (ctxInfo) setLiveContext(ctxInfo);
                    break;
                }

                case 'error': {
                    setIsStreaming(false);
                    setStreamingMsgId(null);
                    const errorText = String(msg['message']);
                    setMessages(prev => [
                        ...prev.filter(m => !m.isStreaming),
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

    // ─── Actions ─────────────────────────────────────────────────────────
    const handleSend = useCallback((content: string) => {
        if (!content.trim() || isStreaming) return;

        // Add user message locally
        setMessages(prev => [
            ...prev,
            { id: `u-${Date.now()}`, role: 'user', content },
        ]);
        setLiveContext(null);

        vscode.postMessage({
            type:          'send',
            content,
            model:         selectedModel,
            mode,
            contextScopes,
        });
    }, [isStreaming, selectedModel, mode, contextScopes]);

    const handleClear = useCallback(() => {
        setMessages([]);
        setLiveContext(null);
        vscode.postMessage({ type: 'clear' });
    }, []);

    const handleModelChange = useCallback((m: ModelId) => {
        setSelectedModel(m);
        vscode.postMessage({ type: 'setModel', model: m });
    }, []);

    const handleSaveApiKey = useCallback(() => {
        const key = apiKeyInput.trim();
        if (key) vscode.postMessage({ type: 'setApiKey', key });
    }, [apiKeyInput]);

    const toggleScope = useCallback((scope: ContextScope) => {
        setContextScopes(prev =>
            prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope],
        );
    }, []);

    const handleShowSettings = useCallback(() => {
        vscode.postMessage({ type: 'getStats' });
        setShowSettings(s => !s);
    }, []);

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="header-title">
                    <span className="bolt">⚡</span>
                    <span>SoftCode AI</span>
                </div>
                <div className="header-actions">
                    <button className="icon-btn" onClick={handleShowSettings} title="Settings">⚙️</button>
                    <button className="icon-btn" onClick={handleClear}        title="Clear">🗑️</button>
                </div>
            </header>

            {/* Mode tabs */}
            <div className="mode-bar">
                {(Object.entries(MODE_INFO) as [Mode, typeof MODE_INFO[Mode]][]).map(([id, info]) => (
                    <button
                        key={id}
                        className={`mode-tab ${mode === id ? 'active' : ''}`}
                        onClick={() => setMode(id)}
                        title={info.description}
                    >
                        {info.label}
                    </button>
                ))}
            </div>

            {/* Context bar */}
            <div className="context-bar">
                <ModelSelector selectedModel={selectedModel} onModelChange={handleModelChange} />
                <div className="context-scopes">
                    {SCOPES.map(s => (
                        <button
                            key={s.id}
                            className={`scope-btn ${contextScopes.includes(s.id) ? 'active' : ''}`}
                            onClick={() => toggleScope(s.id)}
                            title={`Toggle ${s.id} context`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Settings panel */}
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
                            <div className="stat-row"><span>Daily cost</span><span>${stats.dailyCost.toFixed(4)}</span></div>
                            <div className="stat-row"><span>Total cost</span><span>${stats.totalCost.toFixed(4)}</span></div>
                            <div className="stat-row"><span>Requests</span><span>{stats.totalRequests}</span></div>
                            <div className="stat-row"><span>Tokens used</span><span>{stats.totalTokens.toLocaleString()}</span></div>
                        </div>
                    )}
                </div>
            )}

            {/* Chat */}
            <Chat
                messages={messages}
                isStreaming={isStreaming}
                onSend={handleSend}
                contextInfo={liveContext}
            />
        </div>
    );
}
