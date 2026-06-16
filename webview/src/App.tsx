import React, { useState, useEffect, useCallback } from 'react';
import {
    Archive,
    ArrowLeft,
    Check,
    ChevronRight,
    Copy,
    MoreHorizontal,
    Pencil,
    RotateCcw,
    Settings,
    SquarePen,
} from 'lucide-react';
import Chat from './Chat';
import { Button } from './components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
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

function formatConversation(messages: ChatMessage[]): string {
    return messages
        .map(message => {
            const author = message.role === 'assistant' ? 'SoftCode AI' : 'You';
            const parts = [`${author}:`];

            if (message.content.trim()) {
                parts.push(message.content.trim());
            }

            if (message.plan && message.plan.length > 0) {
                parts.push([
                    'Todos:',
                    ...message.plan.map(todo => `- [${todo.status}] ${todo.text}`),
                ].join('\n'));
            }

            if (message.foundFiles && message.foundFiles.length > 0) {
                parts.push(`Files: ${message.foundFiles.join(', ')}`);
            }

            return parts.join('\n');
        })
        .filter(Boolean)
        .join('\n\n---\n\n');
}

async function copyToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
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
    const [didCopyConversation, setDidCopyConversation] = useState(false);
    const [chatTitle, setChatTitle] = useState('New chat');
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [renameInput, setRenameInput] = useState('New chat');

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
                    const s = msg['session'] as { messages: ChatMessage[]; title?: string };
                    const loadedMessages = s.messages ?? [];
                    const lastContext = [...loadedMessages]
                        .reverse()
                        .find(m => m.contextInfo)?.contextInfo ?? null;
                    setMessages(loadedMessages.map(m => ({ ...m, isStreaming: false })));
                    setChatTitle(s.title ?? loadedMessages.find(m => m.role === 'user')?.content.slice(0, 44) ?? 'New chat');
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
        const firstMessage = messages.length === 0;

        // Add user message locally
        setMessages(prev => [
            ...prev,
            { id: `u-${Date.now()}`, role: 'user', content },
        ]);
        if (firstMessage) setChatTitle(content.trim().slice(0, 44));
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
    }, [isStreaming, messages.length, selectedModel, mode, contextScopes, attachedFiles]);

    const handleResubmitMessage = useCallback((messageId: string, content: string) => {
        const trimmed = content.trim();
        if (!trimmed || isStreaming) return;

        const index = messages.findIndex(message => message.id === messageId && message.role === 'user');
        if (index < 0) return;

        const previousMessages = messages.slice(0, index);
        const editedMessage: ChatMessage = {
            id: messageId,
            role: 'user',
            content: trimmed,
        };
        const nextMessages = [...previousMessages, editedMessage];
        const history = previousMessages
            .filter(message => message.role === 'user' || message.role === 'assistant')
            .map(message => ({ role: message.role, content: message.content }));

        setMessages(nextMessages);
        setLiveContext(null);
        setAttachedFiles([]);

        vscode.postMessage({
            type: 'resubmit',
            content: trimmed,
            model: selectedModel,
            mode,
            contextScopes,
            attachedFiles,
            history,
            messages: nextMessages,
        });
    }, [isStreaming, messages, selectedModel, mode, contextScopes, attachedFiles]);

    const handleRetryAssistant = useCallback((messageId: string) => {
        if (isStreaming) return;
        const assistantIndex = messages.findIndex(message => message.id === messageId && message.role === 'assistant');
        if (assistantIndex <= 0) return;

        const previousUser = [...messages.slice(0, assistantIndex)]
            .reverse()
            .find(message => message.role === 'user');
        if (!previousUser) return;

        handleResubmitMessage(previousUser.id, previousUser.content);
    }, [handleResubmitMessage, isStreaming, messages]);

    const handleClear = useCallback(() => {
        setMessages([]);
        setLiveContext(null);
        setChatTitle('New chat');
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

    const handleCopyConversation = useCallback(() => {
        if (messages.length === 0) return;

        void copyToClipboard(formatConversation(messages)).then(() => {
            setDidCopyConversation(true);
            window.setTimeout(() => setDidCopyConversation(false), 1400);
        });
    }, [messages]);

    const handleOpenRename = useCallback(() => {
        setRenameInput(chatTitle);
        setShowRenameDialog(true);
    }, [chatTitle]);

    const handleSaveRename = useCallback(() => {
        const title = renameInput.trim();
        if (!title) return;
        setChatTitle(title);
        setShowRenameDialog(false);
        vscode.postMessage({ type: 'renameSession', title });
    }, [renameInput]);

    const handleArchiveChat = useCallback(() => {
        vscode.postMessage({ type: 'archiveSession' });
        setMessages([]);
        setLiveContext(null);
        setChatTitle('New chat');
    }, []);

    const handleReloadChat = useCallback(() => {
        setShowHistory(false);
        setShowSettings(false);
        vscode.postMessage({ type: 'reloadSession' });
        vscode.postMessage({ type: 'listSessions' });
    }, []);

    return (
        <div className={`app ${showHistory ? 'app--history-open' : ''}`}>
            {/* Header */}
            <header className="app-header">
                <div className="header-title">
                    <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        className="icon-btn header-back-btn"
                        title="Back"
                        aria-label="Back"
                        onClick={() => setShowHistory(false)}
                    >
                        <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
                    </Button>
                    <span>{chatTitle}</span>
                </div>
                <div className="header-actions">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="icon"
                                size="icon"
                                className="icon-btn"
                                title="Chat menu"
                                aria-label="Chat menu"
                            >
                                <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="chat-menu" align="end" side="bottom">
                            <DropdownMenuItem className="chat-menu-item" onSelect={handleOpenRename}>
                                <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                                <span>Rename chat</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="chat-menu-item" onSelect={handleArchiveChat}>
                                <Archive size={16} strokeWidth={1.8} aria-hidden="true" />
                                <span>Archive chat</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="chat-menu-separator" />
                            <DropdownMenuItem
                                className="chat-menu-item"
                                disabled={messages.length === 0}
                                onSelect={handleCopyConversation}
                            >
                                <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
                                <span>Copy</span>
                                <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        className="icon-btn"
                        title="Reload chat"
                        aria-label="Reload chat"
                        onClick={handleReloadChat}
                    >
                        <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />
                    </Button>
                    {/* Settings */}
                    <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        className="icon-btn"
                        onClick={handleShowSettings}
                        title="Settings"
                        aria-label="Settings"
                    >
                        <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
                    </Button>
                    {/* Clear / New chat */}
                    <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        className="icon-btn"
                        onClick={handleClear}
                        title="New chat"
                        aria-label="New chat"
                    >
                        <SquarePen size={18} strokeWidth={1.8} aria-hidden="true" />
                    </Button>
                    {/* Close */}
                    <button className="icon-btn close-btn" title="Close" aria-label="Close">✕</button>
                </div>
            </header>

            {showRenameDialog && (
                <div className="rename-dialog-backdrop" role="presentation">
                    <div className="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title">
                        <button
                            type="button"
                            className="rename-close"
                            onClick={() => setShowRenameDialog(false)}
                            aria-label="Close rename dialog"
                        >
                            ×
                        </button>
                        <h2 id="rename-dialog-title">Rename chat</h2>
                        <p>Keep it short and recognizable</p>
                        <input
                            value={renameInput}
                            onChange={event => setRenameInput(event.target.value)}
                            onFocus={event => event.currentTarget.select()}
                            onKeyDown={event => {
                                if (event.key === 'Enter') handleSaveRename();
                                if (event.key === 'Escape') setShowRenameDialog(false);
                            }}
                            autoFocus
                        />
                        <div className="rename-actions">
                            <Button type="button" variant="ghost" className="rename-cancel" onClick={() => setShowRenameDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="button" className="rename-save" onClick={handleSaveRename} disabled={!renameInput.trim()}>
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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
                onCopyConversation={handleCopyConversation}
                didCopyConversation={didCopyConversation}
                onResubmitMessage={handleResubmitMessage}
                onRetryAssistant={handleRetryAssistant}
            />
        </div>
    );
}
