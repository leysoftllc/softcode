import React, { useRef, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import Message from './Message';
import { type ChatMessage } from './types';

interface Props {
    messages:    ChatMessage[];
    isStreaming: boolean;
    onSend:      (content: string) => void;
}

export default function Chat({ messages, isStreaming, onSend }: Props): React.ReactElement {
    const [input,  setInput]  = useState('');
    const bottomRef           = useRef<HTMLDivElement>(null);
    const textareaRef         = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to the latest message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const submit = () => {
        const text = input.trim();
        if (!text || isStreaming) return;
        onSend(text);
        setInput('');
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        submit();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <div className="chat">
            <div className="messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <p>👋 Ask anything about your code.</p>
                        <p className="hint">
                            Toggle <strong>File</strong> or <strong>Selection</strong> above to include context.
                        </p>
                    </div>
                )}

                {messages.map(msg => (
                    <Message key={msg.id} message={msg} />
                ))}

                <div ref={bottomRef} />
            </div>

            <form className="input-form" onSubmit={handleSubmit}>
                <textarea
                    ref={textareaRef}
                    className="input-textarea"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your code… (Enter to send, Shift+Enter for newline)"
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
