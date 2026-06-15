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

            <div className="message-content">
                <ContentRenderer content={message.content} />
            </div>

            {message.usage && (
                <div className="message-usage">
                    {(message.usage.inputTokens + message.usage.outputTokens).toLocaleString()} tokens
                    {' · '}${message.usage.cost.toFixed(5)}
                </div>
            )}

            {message.isStreaming && <span className="cursor">▊</span>}
        </div>
    );
}

// ─── Inline markdown renderer (no external deps) ──────────────────────────────

function ContentRenderer({ content }: { content: string }): React.ReactElement {
    // Split on fenced code blocks
    const FENCE_RE = /```([\w.-]*)\n?([\s\S]*?)```/g;

    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = FENCE_RE.exec(content)) !== null) {
        // Text before this block
        if (match.index > lastIndex) {
            nodes.push(
                <InlineText key={`t-${lastIndex}`} text={content.slice(lastIndex, match.index)} />,
            );
        }

        const lang = match[1]?.trim() ?? '';
        const code = match[2] ?? '';
        nodes.push(<CodeBlock key={`c-${match.index}`} lang={lang} code={code} />);

        lastIndex = match.index + match[0].length;
    }

    // Remaining text after the last block
    if (lastIndex < content.length) {
        nodes.push(<InlineText key={`t-${lastIndex}`} text={content.slice(lastIndex)} />);
    }

    return <>{nodes}</>;
}

function InlineText({ text }: { text: string }): React.ReactElement {
    return <span className="text-content">{text}</span>;
}

function CodeBlock({ lang, code }: { lang: string; code: string }): React.ReactElement {
    const handleCopy = () => {
        void navigator.clipboard.writeText(code);
    };

    return (
        <div className="code-block">
            {lang && <div className="code-lang">{lang}</div>}
            <pre>
                <code>{code}</code>
            </pre>
            <button className="copy-btn" onClick={handleCopy}>
                Copy
            </button>
        </div>
    );
}
