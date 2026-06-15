import React, { useState, useEffect, useCallback } from 'react';
import Chat from './Chat';
import {
    vscode,
    MODEL_INFO,
    type ModelId,
    type Mode,
    type ContextScope,
    type ChatMessage,
    type ContextInfo,
    type UsageStats,
    type PlanTodo,
    type TodoStatus,
    type SessionMeta,
} from './types';

const CONTEXT_SCOPES: { id: ContextScope; label: string }[] = [
    { id: 'file',      label: '📄 File'      },
    { id: 'selection', label: '✂️ Selection'  },
    { id: 'search',    label: '🔍 Search'     },
];

export default function App(): React.ReactElement {
    const [messages,       setMessages]       = useState<ChatMessage[]>([]);
    const [isStreaming,    setIsStreaming]     = useState(false);
    const [selectedModel,  setSelectedModel]  = useState<ModelId>('claude-sonnet-4-5');
    const [mode,           setMode]           = useState<Mode>('ask');
    const [contextScopes,  setContextScopes]  = useState<ContextScope[]>(['file', 'workspace']);
    const [showSettings,   setShowSettings]   = useState(false);
    const [showHistory,    setShowHistory]    = useState(false);
    const [sessions,       setSessions]       = useState<SessionMeta[]>([]);
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
                        { id: msgId, role: 'assistant', content: '', isStreaming: true, statuses: [], foundFiles: [], plan: [] },
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

                // Execution plan received
                case 'agentPlan': {
                    const msgId = String(msg['msgId']);
                    const todos = msg['todos'] as PlanTodo[];
                    setMessages(prev => prev.map(m =>
                        m.id === msgId ? { ...m, plan: todos } : m,
                    ));
                    break;
                }

                // Single todo item status update
                case 'todoUpdate': {
                    const msgId  = String(msg['msgId']);
                    const todoId = String(msg['id']);
                    const status = msg['status'] as TodoStatus;
                    setMessages(prev => prev.map(m =>
                        m.id === msgId
                            ? { ...m, plan: m.plan?.map(t => t.id === todoId ? { ...t, status } : t) }
                            : m,
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

                case 'sessions':
                    setSessions(msg['list'] as SessionMeta[]);
                    break;

                case 'sessionLoaded': {
                    const s = msg['session'] as { messages: ChatMessage[] };
                    setMessages(s.messages ?? []);
                    setLiveContext(null);
                    setShowHistory(false);
                    break;
                }
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Sync messages to extension for session persistence
    useEffect(() => {
        if (messages.length > 0) {
            vscode.postMessage({ type: 'syncMessages', messages });
        }
    }, [messages]);

    // Request session list on mount
    useEffect(() => {
        vscode.postMessage({ type: 'listSessions' });
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
        vscode.postMessage({ type: 'newSession' });
    }, []);

    const handleModelChange = useCallback((m: ModelId) => {
        setSelectedModel(m);
        vscode.postMessage({ type: 'setModel', model: m });
    }, []);

    const handleSaveApiKey = useCallback(() => {
        const key = apiKeyInput.trim();
        if (key) vscode.postMessage({ type: 'setApiKey', key });
    }, [apiKeyInput]);

    const handleLoadSession = useCallback((id: string) => {
        vscode.postMessage({ type: 'loadSession', id });
    }, []);

    const handleDeleteSession = useCallback((id: string) => {
        vscode.postMessage({ type: 'deleteSession', id });
    }, []);

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
                <div className="header-title">Copilot Chat</div>
                <div className="header-actions">
                    {/* History */}
                    <button
                        className={`icon-btn ${showHistory ? 'active' : ''}`}
                        title="Chat history"
                        aria-label="Chat history"
                        onClick={() => { setShowHistory(h => !h); setShowSettings(false); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm.5-9v3.25l2.5 1.5-.5.87L8 8.5V5H8.5z"/>
                        </svg>
                    </button>
                    {/* Settings */}
                    <button className="icon-btn" onClick={handleShowSettings} title="Settings" aria-label="Settings">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path fillRule="evenodd" d="M9.1 4.4 8.1 2H7.9L6.9 4.4 4.2 4.9 2.4 6.6l.8 2.5-.8 2.5 1.8 1.7 2.7.5 1 2.4h.2l1-2.4 2.7-.5 1.8-1.7-.8-2.5.8-2.5-1.8-1.7-2.7-.5zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
                        </svg>
                    </button>
                    {/* Clear / New chat */}
                    <button className="icon-btn" onClick={handleClear} title="New chat" aria-label="New chat">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M14.5 1h-13l-.5.5v10l.5.5H7v1.293l-1.146-1.147-.708.708 2 2 .354.353.354-.353 2-2-.708-.708L9 14.293V12h5.5l.5-.5v-10l-.5-.5zM14 11H2V2h12v9z"/>
                        </svg>
                    </button>
                    {/* Close */}
                    <button className="icon-btn close-btn" title="Close" aria-label="Close">✕</button>
                </div>
            </header>

            {/* Context / Model bar */}
            <div className="context-bar">
                <div className="context-left">
                    <select
                        className="model-pill"
                        value={selectedModel}
                        onChange={e => handleModelChange(e.target.value as ModelId)}
                        title="Select model"
                    >
                        {(Object.entries(MODEL_INFO) as [ModelId, typeof MODEL_INFO[ModelId]][]).map(
                            ([id, info]) => (
                                <option key={id} value={id}>{info.label} - {info.description}</option>
                            ),
                        )}
                    </select>
                    <button
                        className={`scope-pill ${contextScopes.includes('workspace') ? 'active' : ''}`}
                        onClick={() => toggleScope('workspace')}
                        title="Toggle workspace context"
                    >
                        Workspace
                        <svg width="7" height="4" viewBox="0 0 7 4" fill="currentColor">
                            <path d="M0 0l3.5 4L7 0z"/>
                        </svg>
                    </button>
                </div>
                <div className="context-divider" />
                <div className="context-right">
                    {CONTEXT_SCOPES.map(s => (
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

            {/* History panel */}
            {showHistory && (
                <div className="history-panel">
                    <div className="history-header">
                        <span className="history-title">Chat History</span>
                        <button className="icon-btn" onClick={() => setShowHistory(false)}>✕</button>
                    </div>
                    {sessions.length === 0 ? (
                        <div className="history-empty">No saved sessions yet</div>
                    ) : (
                        <ul className="history-list">
                            {sessions.map(s => (
                                <li key={s.id} className="history-item">
                                    <button
                                        className="history-load-btn"
                                        onClick={() => handleLoadSession(s.id)}
                                        title="Load this session"
                                    >
                                        <span className="history-item-title">{s.title}</span>
                                        <span className="history-item-date">
                                            {new Date(s.timestamp).toLocaleDateString(undefined, {
                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                            })}
                                        </span>
                                        {s.preview && (
                                            <span className="history-item-preview">{s.preview}</span>
                                        )}
                                    </button>
                                    <button
                                        className="history-delete-btn"
                                        onClick={() => handleDeleteSession(s.id)}
                                        title="Delete session"
                                    >✕</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Chat */}
            <Chat
                messages={messages}
                isStreaming={isStreaming}
                onSend={handleSend}
                onStop={() => setIsStreaming(false)}
                contextInfo={liveContext}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
                mode={mode}
                onModeChange={setMode}
            />
        </div>
    );
}
