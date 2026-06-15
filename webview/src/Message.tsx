import React, { type ReactNode } from 'react';
import { type ChatMessage } from './types';

interface Props {
    message: ChatMessage;
}

export default function Message({ message }: Props): React.ReactElement {
    return (
        <div className={`message message-${message.role}`}>
            <div className="message-role">
                {message.role === 'user' ? 'You' : 'SoftCode AI'}
            </div>

            {/* Agent thinking log */}
            {message.statuses && message.statuses.length > 0 && (
                <div className="agent-log">
                    {message.statuses.map((s, i) => (
                        <div
                            key={i}
                            className={`agent-status ${i < message.statuses!.length - 1 ? 'done' : 'active'}`}
                        >
                            {s}
                        </div>
                    ))}
                </div>
            )}

            {/* Files found chips */}
            {message.foundFiles && message.foundFiles.length > 0 && (
                <div className="agent-files">
                    {message.foundFiles.map(f => (
                        <span key={f} className="agent-file-chip">📄 {f}</span>
                    ))}
                </div>
            )}

            {/* Main content */}
            {message.content && (
                <div className="message-content">
                    <ContentRenderer content={message.content} />
                </div>
            )}

            {/* Streaming cursor */}
            {message.isStreaming && !message.content && <span className="cursor">▊</span>}
            {message.isStreaming && message.content && <span className="cursor"> ▊</span>}

            {/* Meta row: usage + context info */}
            {(message.usage || message.contextInfo) && (
                <div className="message-meta">
                    {message.usage && (
                        <span className="message-usage">
                            {(message.usage.inputTokens + message.usage.outputTokens).toLocaleString()} tokens
                            {' · '}${message.usage.cost.toFixed(5)}
                        </span>
                    )}
                    {message.contextInfo && message.contextInfo.files.length > 0 && (
                        <span className="context-info-pill">
                            📎 {message.contextInfo.files.slice(0, 2).join(', ')}
                            {message.contextInfo.files.length > 2 && ` +${message.contextInfo.files.length - 2}`}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Content renderer (handles fenced code + inline code + bold) ─────────────

function ContentRenderer({ content }: { content: string }): React.ReactElement {
    const FENCE_RE = /```([\w.-]*)\n?([\s\S]*?)```/g;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = FENCE_RE.exec(content)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(
                <InlineContent key={`t-${lastIndex}`} text={content.slice(lastIndex, match.index)} />,
            );
        }
        nodes.push(<CodeBlock key={`c-${match.index}`} lang={match[1]?.trim() ?? ''} code={match[2] ?? ''} />);
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        nodes.push(<InlineContent key="t-end" text={content.slice(lastIndex)} />);
    }

    return <>{nodes}</>;
}

/** Renders inline text with **bold** and `code` support */
function InlineContent({ text }: { text: string }): React.ReactElement {
    const INLINE_RE = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
    const parts: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = INLINE_RE.exec(text)) !== null) {
        if (m.index > last) {
            parts.push(<span key={last} className="text-segment">{text.slice(last, m.index)}</span>);
        }
        if (m[2]) {
            parts.push(<strong key={m.index}>{m[2]}</strong>);
        } else if (m[3]) {
            parts.push(<code key={m.index} className="inline-code">{m[3]}</code>);
        }
        last = m.index + m[0].length;
    }

    if (last < text.length) {
        parts.push(<span key="tail" className="text-segment">{text.slice(last)}</span>);
    }

    return <>{parts}</>;
}

function CodeBlock({ lang, code }: { lang: string; code: string }): React.ReactElement {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="code-block">
            {lang && <div className="code-lang">{lang}</div>}
            <pre><code>{code}</code></pre>
            <button className="copy-btn" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy'}
            </button>
        </div>
    );
}
