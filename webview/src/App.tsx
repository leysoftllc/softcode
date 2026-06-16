import React, { useState, useEffect, useCallback } from 'react';
import Chat from './Chat';
import {
    vscode,
    MODEL_INFO,
    type ModelId,
    type Mode,
    type ContextScope,
    type AttachedFile,
    type ChatMessage,
    type ContextInfo,
    type EditEvent,
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

function formatHistoryAge(timestamp: number): string {
    const elapsedMs = Math.max(0, Date.now() - timestamp);
    const minutes = Math.max(1, Math.floor(elapsedMs / 60000));

    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    return `${Math.floor(hours / 24)}d`;
}

export default function App(): React.ReactElement {
    const [messages,       setMessages]       = useState<ChatMessage[]>([]);
    const [isStreaming,    setIsStreaming]     = useState(false);
    const [selectedModel,  setSelectedModel]  = useState<ModelId>('claude-sonnet-4-6');
    const [mode,           setMode]           = useState<Mode>('ask');
    const [contextScopes,  setContextScopes]  = useState<ContextScope[]>(['file', 'workspace']);
    const [showSettings,   setShowSettings]   = useState(false);
    const [showHistory,    setShowHistory]    = useState(false);
    const [sessions,       setSessions]       = useState<SessionMeta[]>([]);
    const [apiKeyInput,    setApiKeyInput]    = useState('');
    const [stats,          setStats]          = useState<UsageStats | null>(null);
    const [liveContext,    setLiveContext]     = useState<ContextInfo | null>(null);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
    const [attachedFiles,  setAttachedFiles]  = useState<AttachedFile[]>([]);

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

                case 'editEvent': {
                    const msgId = String(msg['msgId']);
                    const event = msg['event'] as EditEvent;
                    setMessages(prev => prev.map(m => {
                        if (m.id !== msgId) return m;
                        const existing = m.editEvents ?? [];
                        const next = existing.some(e => e.id === event.id)
                            ? existing.map(e => e.id === event.id ? event : e)
                            : [...existing, event];
                        return { ...m, editEvents: next };
                    }));
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

                case 'streamStopped': {
                    const msgId = String(msg['msgId']);
                    setIsStreaming(false);
                    setStreamingMsgId(null);
                    setMessages(prev => prev.map(m =>
                        m.id === msgId
                            ? { ...m, isStreaming: false, statuses: [...(m.statuses ?? []), 'Stopped by user'] }
                            : m,
                    ));
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

                case 'filesPicked': {
                    const files = msg['files'] as AttachedFile[];
                    setAttachedFiles(prev => {
                        const byPath = new Map(prev.map(file => [file.fsPath, file]));
                        files.forEach(file => byPath.set(
                            file.fsPath,
                            { ...file, id: file.id ?? file.fsPath ?? `${file.label}-${Date.now()}` },
                        ));
                        return [...byPath.values()];
                    });
                    break;
                }

                case 'sessionLoaded': {
                    const s = msg['session'] as { messages: ChatMessage[] };
                    const loadedMessages = s.messages ?? [];
                    const lastContext = [...loadedMessages]
                        .reverse()
                        .find(m => m.contextInfo)?.contextInfo ?? null;
                    setMessages(loadedMessages.map(m => ({ ...m, isStreaming: false })));
                    setLiveContext(lastContext);
                    setIsStreaming(false);
                    setStreamingMsgId(null);
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
        setAttachedFiles([]);

        vscode.postMessage({
            type:          'send',
            content,
            model:         selectedModel,
            mode,
            contextScopes,
            attachedFiles,
        });
    }, [isStreaming, selectedModel, mode, contextScopes, attachedFiles]);

    const handleClear = useCallback(() => {
        setMessages([]);
        setLiveContext(null);
        vscode.postMessage({ type: 'newSession' });
    }, []);

    const handleStop = useCallback(() => {
        if (!streamingMsgId) return;
        vscode.postMessage({ type: 'stop', msgId: streamingMsgId });
    }, [streamingMsgId]);

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

    const handlePickFiles = useCallback(() => {
        vscode.postMessage({ type: 'pickFiles' });
    }, []);

    const handleAttachFiles = useCallback((files: AttachedFile[]) => {
        setAttachedFiles(prev => {
            const byId = new Map(prev.map(file => [file.id ?? file.fsPath ?? file.label, file]));
            files.forEach(file => byId.set(file.id ?? file.fsPath ?? file.label, file));
            return [...byId.values()];
        });
    }, []);

    const handleRemoveAttachedFile = useCallback((id: string) => {
        setAttachedFiles(prev => prev.filter(file => (file.id ?? file.fsPath ?? file.label) !== id));
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
        <div className={`app ${showHistory ? 'app--history-open' : ''}`}>
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
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M4.7 7.2A6 6 0 1 1 4.3 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            <path d="M4.7 7.2H2.3M4.7 7.2V4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    {/* Settings */}
                    <button className="icon-btn" onClick={handleShowSettings} title="Settings" aria-label="Settings">
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M8.9 2.7h2.2l.5 2.1c.5.2.9.4 1.3.7l2-.7 1.1 1.9-1.6 1.4c.1.5.1 1 .1 1.5l1.6 1.4-1.1 1.9-2-.7c-.4.3-.8.5-1.3.7l-.5 2.1H8.9l-.5-2.1c-.5-.2-.9-.4-1.3-.7l-2 .7L4 11l1.6-1.4c-.1-.5-.1-1 0-1.5L4 6.7l1.1-1.9 2 .7c.4-.3.8-.5 1.3-.7l.5-2.1Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round"/>
                            <circle cx="10" cy="8.9" r="2.35" stroke="currentColor" strokeWidth="1.55"/>
                        </svg>
                    </button>
                    {/* Clear / New chat */}
                    <button className="icon-btn" onClick={handleClear} title="New chat" aria-label="New chat">
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M10.8 4H5.2A1.7 1.7 0 0 0 3.5 5.7v9.1a1.7 1.7 0 0 0 1.7 1.7h9.1a1.7 1.7 0 0 0 1.7-1.7V9.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round"/>
                            <path d="M14.6 2.9a1.45 1.45 0 0 1 2.1 2.1l-6.2 6.2-2.8.7.7-2.8 6.2-6.2Z" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    {/* Close */}
                    <button className="icon-btn close-btn" title="Close" aria-label="Close">✕</button>
                </div>
            </header>

            {/* Context / Model bar */}
            <div className="context-bar" aria-hidden="true">
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
                        <span className="history-title">Tasks</span>
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
                                            {formatHistoryAge(s.timestamp)}
                                        </span>
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
                contextInfo={liveContext}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
                mode={mode}
                onModeChange={setMode}
                onStop={handleStop}
                contextScopes={contextScopes}
                onToggleContextScope={toggleScope}
                attachedFiles={attachedFiles}
                onAttachFiles={handleAttachFiles}
                onPickFiles={handlePickFiles}
                onRemoveAttachedFile={handleRemoveAttachedFile}
            />
        </div>
    );
}
