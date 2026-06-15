import React, { useRef, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import Message from './Message';
import { MODEL_INFO, type ChatMessage, type ContextInfo, type ModelId, type Mode, MODE_INFO } from './types';

interface Props {
    messages:      ChatMessage[];
    isStreaming:   boolean;
    onSend:        (content: string) => void;
    onStop:        () => void;
    contextInfo?:  ContextInfo | null;
    selectedModel: ModelId;
    onModelChange: (model: ModelId) => void;
    mode:          Mode;
    onModeChange:  (mode: Mode) => void;
}

export default function Chat({
    messages, isStreaming, onSend, onStop, contextInfo,
    selectedModel, onModelChange, mode, onModeChange,
}: Props): React.ReactElement {
    const [input,        setInput]       = useState('');
    const [showModeMenu, setShowModeMenu] = useState(false);
    const bottomRef    = useRef<HTMLDivElement>(null);
    const messagesRef  = useRef<HTMLDivElement>(null);
    const isAtBottom   = useRef(true);

    // Track whether user is near the bottom of the message list
    const handleScroll = () => {
        const el = messagesRef.current;
        if (!el) return;
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    // Only auto-scroll when user is already at the bottom
    useEffect(() => {
        if (isAtBottom.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const submit = () => {
        const text = input.trim();
        if (!text || isStreaming) return;
        onSend(text);
        setInput('');
    };

    const handleSubmit = (e: FormEvent) => { e.preventDefault(); submit(); };
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    const placeholder = isStreaming ? 'SoftCode is working…' : 'Describe what to build…';
    const modelLabel  = MODEL_INFO[selectedModel]?.label ?? selectedModel;

    return (
        <div className="chat">
            <div className="messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">⚡</div>
                        <div className="empty-title">SoftCode AI</div>
                        <div className="empty-hints">
                            <span>Opens active file automatically</span>
                            <span>Searches your workspace for context</span>
                            <span>Reasons across multiple files</span>
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <Message key={msg.id} message={msg} />
                ))}

                <div ref={bottomRef} />
            </div>

            {/* Input form */}
            <form className="input-form" onSubmit={handleSubmit}>
                <div className="input-wrapper">
                    <textarea
                        className="input-textarea"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={3}
                        disabled={isStreaming}
                    />

                    {/* ─── Toolbar: matches screenshot ─── */}
                    <div className="input-toolbar">

                        {/* Left: + attach */}
                        <button type="button" className="tool-btn toolbar-attach" title="Attach file">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
                            </svg>
                        </button>

                        <div className="toolbar-divider" />

                        {/* Agent mode button */}
                        <div className="toolbar-mode-wrap">
                            <button
                                type="button"
                                className="toolbar-mode-btn"
                                onClick={() => setShowModeMenu(m => !m)}
                                title="Switch mode"
                            >
                                {/* ⊘ icon */}
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                                    <path d="M3.5 12.5l9-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <span>{MODE_INFO[mode].label}</span>
                            </button>

                            {showModeMenu && (
                                <div className="mode-menu" onMouseLeave={() => setShowModeMenu(false)}>
                                    {(Object.entries(MODE_INFO) as [Mode, typeof MODE_INFO[Mode]][]).map(([id, info]) => (
                                        <button
                                            key={id}
                                            type="button"
                                            className={`mode-menu-item ${mode === id ? 'active' : ''}`}
                                            onClick={() => { onModeChange(id); setShowModeMenu(false); }}
                                        >
                                            <span className="mode-menu-label">{info.label}</span>
                                            <span className="mode-menu-desc">{info.description}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="toolbar-divider" />

                        {/* Model selector */}
                        <select
                            className="toolbar-model"
                            value={selectedModel}
                            onChange={e => onModelChange(e.target.value as ModelId)}
                            title="Select Claude model"
                        >
                            {(Object.entries(MODEL_INFO) as [ModelId, typeof MODEL_INFO[ModelId]][]).map(
                                ([id, info]) => (
                                    <option key={id} value={id}>{info.label}</option>
                                ),
                            )}
                        </select>

                        <div className="toolbar-divider" />

                        {/* Context budget */}
                        <span className="toolbar-budget" title="Context priority">High</span>

                        <div className="toolbar-divider" />

                        <span className="toolbar-tokens" title="Token budget">
                            {contextInfo ? `${Math.round(contextInfo.tokens / 1000)}K` : '200K'}
                        </span>

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Settings icon */}
                        <button type="button" className="tool-btn" title="Settings">
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                                <path fillRule="evenodd" d="M9.1 4.4 8.1 2H7.9L6.9 4.4 4.2 4.9 2.4 6.6l.8 2.5-.8 2.5 1.8 1.7 2.7.5 1 2.4h.2l1-2.4 2.7-.5 1.8-1.7-.8-2.5.8-2.5-1.8-1.7-2.7-.5zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
                            </svg>
                        </button>

                        {/* Send / Stop */}
                        {isStreaming ? (
                            <button
                                type="button"
                                className="send-btn send-btn--stop"
                                onClick={onStop}
                                title="Stop generation"
                            >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                                    <rect x="1" y="1" width="9" height="9" rx="1"/>
                                </svg>
                            </button>
                        ) : (
                            <button
                                type="submit"
                                className="send-btn"
                                disabled={!input.trim()}
                                title="Send (Enter)"
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <path d="M1 6h10M6 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
}


// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _DeprecatedChat({ messages, isStreaming, onSend, contextInfo, selectedModel, onModelChange }: Props): React.ReactElement {
    const [input,  setInput]  = useState('');
    const bottomRef           = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const submit = () => {
        const text = input.trim();
        if (!text || isStreaming) return;
        onSend(text);
        setInput('');
    };

    const handleSubmit = (e: FormEvent) => { e.preventDefault(); submit(); };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    const placeholder = isStreaming
        ? 'SoftCode is thinking…'
        : 'Ask anything about your codebase…';

    const fileCount = contextInfo?.files.length ?? 0;

    return (
        <div className="chat">
            <div className="messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">⚡</div>
                        <div className="empty-title">SoftCode AI</div>
                        <div className="empty-hints">
                            <span>Opens active file automatically</span>
                            <span>Searches your workspace for context</span>
                            <span>Reasons across multiple files</span>
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <Message key={msg.id} message={msg} />
                ))}

                <div ref={bottomRef} />
            </div>

            <form className="input-form" onSubmit={handleSubmit}>
                <div className="input-wrapper">
                    <textarea
                        className="input-textarea"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={3}
                        disabled={isStreaming}
                    />
                    <div className="input-toolbar">
                        <div className="input-tools">
                            <button type="button" className="tool-btn" title="Attach file">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4.5 1A3.5 3.5 0 0 0 1 4.5v7.1A4.4 4.4 0 0 0 5.4 16H10a4 4 0 0 0 4-4V6h-1v6a3 3 0 0 1-3 3H5.4A3.4 3.4 0 0 1 2 11.6V4.5a2.5 2.5 0 0 1 5 0V12a1.5 1.5 0 0 1-3 0V5H3v7a2.5 2.5 0 0 0 5 0V4.5A3.5 3.5 0 0 0 4.5 1z"/>
                                </svg>
                            </button>
                            <button type="button" className="tool-btn" title="Mention context">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 1a7 7 0 1 0 4.196 12.69l-.61-.793A6 6 0 1 1 14 8v1a1 1 0 0 1-2 0V5h-1v.499A4 4 0 1 0 12 8v1a2 2 0 0 0 4 0V8a7 7 0 0 0-8-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
                                </svg>
                            </button>
                            {fileCount > 0 && (
                                <span className="files-badge">
                                    {fileCount} {fileCount === 1 ? 'file' : 'files'} ×
                                </span>
                            )}
                            <select
                                className="model-mini"
                                value={selectedModel}
                                onChange={e => onModelChange(e.target.value as ModelId)}
                                title="Select model"
                            >
                                {(Object.entries(MODEL_INFO) as [ModelId, typeof MODEL_INFO[ModelId]][]).map(
                                    ([id, info]) => (
                                        <option key={id} value={id}>{info.label}</option>
                                    ),
                                )}
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="send-btn"
                            disabled={isStreaming || !input.trim()}
                            title="Send (Enter)"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M1 6h10M6 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </form>

            <div className="chat-footer">
                SoftCode AI can make mistakes. Verify important information.
            </div>
        </div>
    );
}
