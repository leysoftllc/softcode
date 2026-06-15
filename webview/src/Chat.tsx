import React, { useRef, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import Message from './Message';
import { type ChatMessage, type ContextInfo } from './types';

interface Props {
    messages:    ChatMessage[];
    isStreaming: boolean;
    onSend:      (content: string) => void;
    contextInfo?: ContextInfo | null;
}

export default function Chat({ messages, isStreaming, onSend, contextInfo }: Props): React.ReactElement {
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
        : 'Ask anything about your code… (Enter to send)';

    return (
        <div className="chat">
            <div className="messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">⚡</div>
                        <div className="empty-title">SoftCode AI</div>
                        <div className="empty-hints">
                            <span>📄 Opens active file automatically</span>
                            <span>🔍 Searches your workspace for context</span>
                            <span>🧠 Reasons across multiple files</span>
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <Message key={msg.id} message={msg} />
                ))}

                <div ref={bottomRef} />
            </div>

            {/* Context indicator */}
            {contextInfo && contextInfo.files.length > 0 && (
                <div className="context-indicator">
                    📎 {contextInfo.files.slice(0, 3).join(' · ')}
                    {contextInfo.files.length > 3 && ` +${contextInfo.files.length - 3} more`}
                    {' · '}~{contextInfo.tokens.toLocaleString()} tokens
                    {' · '}${contextInfo.estimatedCost.toFixed(4)}
                </div>
            )}

            <form className="input-form" onSubmit={handleSubmit}>
                <textarea
                    className="input-textarea"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    rows={3}
                    disabled={isStreaming}
                />
                <button
                    type="submit"
                    className="send-btn"
                    disabled={isStreaming || !input.trim()}
                >
                    {isStreaming ? '…' : 'Send'}
                </button>
            </form>
        </div>
    );
}

interface Props {
    messages:    ChatMessage[];
    isStreaming: boolean;
    onSend:      (content: string) => void;
}
