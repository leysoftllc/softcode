import React, { useState, type ReactNode } from 'react';
import { Check, Copy, RefreshCcw, ThumbsDown } from 'lucide-react';
import { Button } from './components/ui/button';
import { type ChatMessage, type EditEvent, type PlanTodo, vscode } from './types';

interface Props {
    message: ChatMessage;
    onResubmit?: (messageId: string, content: string) => void;
    onRetryAssistant?: (messageId: string) => void;
    modelLabel?: string;
    disabled?: boolean;
}

// Sends a file path to the extension host to open in VS Code editor
function openFile(filePath: string): void {
    vscode.postMessage({ type: 'openFile', path: filePath });
}

export default function Message({ message, onResubmit, onRetryAssistant, modelLabel, disabled = false }: Props): React.ReactElement {
    const isAI = message.role === 'assistant';
    const renderedContent = visibleContent(message.content, Boolean(message.editEvents?.length));
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(message.content);
    const [copied, setCopied] = useState(false);
    const [disliked, setDisliked] = useState(false);

    const startEditing = () => {
        setDraft(message.content);
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setDraft(message.content);
        setIsEditing(false);
    };

    const submitEdit = () => {
        const trimmed = draft.trim();
        if (!trimmed || disabled) return;
        setIsEditing(false);
        onResubmit?.(message.id, trimmed);
    };

    const copyMessage = () => {
        const text = message.content.trim();
        if (!text) return;
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        });
    };

    return (
        <div className={`message message-${message.role}`}>
            {/* Header: avatar + author name */}
            <div className="message-header">
                <div className={`msg-avatar ${isAI ? 'avatar-ai' : 'avatar-user'}`}>
                    {isAI ? '⚡' : ''}
                </div>
                <span className="msg-author">{isAI ? 'SoftCode AI' : 'You'}</span>
                {!isAI && onResubmit && !isEditing && (
                    <button
                        type="button"
                        className="message-edit-btn"
                        onClick={startEditing}
                        disabled={disabled}
                        title="Edit and resubmit"
                    >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="m3.4 11.8-.4 1.9 1.9-.4 7.1-7.1a1.5 1.5 0 0 0-2.1-2.1l-7.1 7.1Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                )}
            </div>

            {/* Execution plan (todo list) */}
            {message.plan && message.plan.length > 0 && (
                <PlanPanel todos={message.plan} />
            )}

            {isAI && (message.statuses?.length || message.plan?.length || message.editEvents?.length) && (
                <WorkSummary message={message} />
            )}

            {/* Agent thinking log */}
            {message.statuses && message.statuses.length > 0 && (
                <AgentLog statuses={message.statuses} />
            )}

            {/* Files found chips — click to open in editor */}
            {message.foundFiles && message.foundFiles.length > 0 && (
                <div className="agent-files">
                    {message.foundFiles.map(f => (
                        <button
                            key={f}
                            className="agent-file-chip"
                            onClick={() => openFile(f)}
                            title={`Open ${f}`}
                        >
                            📄 {f}
                        </button>
                    ))}
                </div>
            )}

            {/* Main content */}
            {isEditing && (
                <div className="message-edit-form">
                    <textarea
                        className="message-edit-textarea"
                        value={draft}
                        onChange={event => setDraft(event.target.value)}
                        rows={Math.min(8, Math.max(3, draft.split('\n').length))}
                        autoFocus
                    />
                    <div className="message-edit-actions">
                        <button type="button" className="message-edit-cancel" onClick={cancelEditing}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="message-edit-submit"
                            onClick={submitEdit}
                            disabled={disabled || !draft.trim()}
                        >
                            Resubmit
                        </button>
                    </div>
                </div>
            )}

            {!isEditing && (renderedContent || message.isStreaming) && (
                <div className="message-body">
                    {renderedContent && (
                        <div className="message-content">
                            <ContentRenderer content={renderedContent} />
                        </div>
                    )}
                    {message.isStreaming && !renderedContent && <span className="cursor">▊</span>}
                    {message.isStreaming && renderedContent  && <span className="cursor"> ▊</span>}
                </div>
            )}

            {message.editEvents && message.editEvents.length > 0 && (
                <EditEvents events={message.editEvents} />
            )}

            {/* Action buttons (Apply All Fixes / Show Diff / Explain More) */}
            {message.actions && message.actions.length > 0 && (
                <div className="message-actions">
                    {message.actions.map((action, i) => (
                        <button
                            key={i}
                            className={`action-btn ${action.primary ? 'action-primary' : 'action-ghost'}`}
                            onClick={() => vscode.postMessage({ type: 'action', action: action.action })}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
                <div className="message-sources">
                    <span>Sources: </span>
                    {message.sources.map((s, i) => (
                        <React.Fragment key={s}>
                            {i > 0 && ', '}
                            <button className="source-link" onClick={() => openFile(s)}>{s}</button>
                        </React.Fragment>
                    ))}
                </div>
            )}

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

            {isAI && (
                <div className="response-footer">
                    <div className="response-footer-actions">
                        <Button
                            type="button"
                            variant="icon"
                            size="icon"
                            className="response-action-btn"
                            onClick={() => onRetryAssistant?.(message.id)}
                            disabled={disabled}
                            title="Retry response"
                            aria-label="Retry response"
                        >
                            <RefreshCcw size={15} strokeWidth={1.7} aria-hidden="true" />
                        </Button>
                        <Button
                            type="button"
                            variant="icon"
                            size="icon"
                            className={`response-action-btn ${copied ? 'active' : ''}`}
                            onClick={copyMessage}
                            disabled={!message.content.trim()}
                            title={copied ? 'Copied response' : 'Copy response'}
                            aria-label={copied ? 'Copied response' : 'Copy response'}
                        >
                            {copied
                                ? <Check size={15} strokeWidth={1.8} aria-hidden="true" />
                                : <Copy size={15} strokeWidth={1.7} aria-hidden="true" />}
                        </Button>
                        <Button
                            type="button"
                            variant="icon"
                            size="icon"
                            className={`response-action-btn ${disliked ? 'active' : ''}`}
                            onClick={() => setDisliked(value => !value)}
                            title="Mark as unhelpful"
                            aria-label="Mark as unhelpful"
                        >
                            <ThumbsDown size={15} strokeWidth={1.7} aria-hidden="true" />
                        </Button>
                    </div>
                    {modelLabel && <span className="response-model">{modelLabel}</span>}
                </div>
            )}
        </div>
    );
}

function WorkSummary({ message }: { message: ChatMessage }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const steps = [
        ...(message.statuses ?? []),
        ...(message.plan ?? []).map(todo => `${todo.status}: ${todo.text}`),
        ...(message.editEvents ?? []).map(event => `${event.status}: ${event.file}`),
    ];

    return (
        <div className="work-summary">
            <button type="button" className="work-summary-toggle" onClick={() => setOpen(value => !value)}>
                <span>{steps.length > 0 ? `Worked through ${steps.length} steps` : 'Worked on response'}</span>
                <span className={`work-summary-chevron ${open ? 'open' : ''}`}>›</span>
            </button>
            {open && steps.length > 0 && (
                <div className="work-summary-list">
                    {steps.map((step, index) => (
                        <div key={`${step}-${index}`}>{step}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

function visibleContent(content: string, hasEditEvents: boolean): string {
    const withoutMarkedEdits = content
        .replace(/```[\w.-]*\n\/\/ @@softcode-edit:\s*.+?\n[\s\S]*?```/g, '')
        .replace(/```[^\n`]*(?:^|\s)[\w./-]+\.\w{1,8}\s*\n?[\s\S]*?```/g, '');

    return (hasEditEvents ? withoutMarkedEdits.replace(/```[\s\S]*?```/g, '') : withoutMarkedEdits)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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

/** Renders inline text with **bold** and `code` support. Code that looks like a file path is clickable. */
function InlineContent({ text }: { text: string }): React.ReactElement {
    const INLINE_RE = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
    // Matches things like src/foo/bar.ts, ./foo/bar.tsx, /abs/path.ts
    const FILE_RE   = /^\.?\.?\/[\w/.\-]+\.\w{1,6}$|^[\w\-./]+\/[\w.\-]+\.\w{1,6}$/;
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
            const codeText = m[3];
            if (FILE_RE.test(codeText)) {
                parts.push(
                    <code
                        key={m.index}
                        className="inline-code inline-code--file"
                        onClick={() => openFile(codeText)}
                        title={`Open ${codeText}`}
                    >
                        {codeText}
                    </code>,
                );
            } else {
                parts.push(<code key={m.index} className="inline-code">{codeText}</code>);
            }
        }
        last = m.index + m[0].length;
    }

    if (last < text.length) {
        parts.push(<span key="tail" className="text-segment">{text.slice(last)}</span>);
    }

    return <>{parts}</>;
}

// ─── Plan Panel (todo list) ─────────────────────────────────────────────────

function PlanPanel({ todos }: { todos: PlanTodo[] }): React.ReactElement {
    const [collapsed, setCollapsed] = useState(false);
    const done  = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;

    return (
        <div className="todo-panel">
            <div className="todo-header" onClick={() => setCollapsed(c => !c)}>
                <span className={`todo-collapse-arrow ${collapsed ? 'todo-collapse-arrow--collapsed' : ''}`}>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>
                </span>
                <span className="todo-title">Todos ({done}/{total})</span>
                <button
                    className="todo-dismiss"
                    onClick={e => { e.stopPropagation(); setCollapsed(true); }}
                    title="Collapse"
                >
                    <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/></svg>
                </button>
            </div>
            {!collapsed && (
                <ul className="todo-list">
                    {todos.map(todo => (
                        <li key={todo.id} className={`todo-item todo-item--${todo.status}`}>
                            <span className="todo-icon">
                                {todo.status === 'completed'   && <CompletedIcon />}
                                {todo.status === 'in-progress' && <ActiveIcon />}
                                {todo.status === 'not-started' && <PendingIcon />}
                            </span>
                            <span className="todo-text">{todo.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CompletedIcon(): React.ReactElement {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1"/>
            <path d="M4 7l2.2 2.2L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function ActiveIcon(): React.ReactElement {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1"/>
            <circle cx="7" cy="7" r="3" fill="currentColor"/>
        </svg>
    );
}

function PendingIcon(): React.ReactElement {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1"/>
        </svg>
    );
}

function EditEvents({ events }: { events: EditEvent[] }): React.ReactElement {
    const totalAdded = events.reduce((sum, event) => sum + event.additions, 0);
    const totalDeleted = events.reduce((sum, event) => sum + event.deletions, 0);
    const isEditing = events.some(event => event.status === 'editing');
    const title = events.length === 1
        ? `${isEditing ? 'Editing' : 'Edited'} a file`
        : `${isEditing ? 'Editing' : 'Edited'} ${events.length} files`;

    return (
        <div className="edit-events">
            <div className="edit-summary">
                <EditPencilIcon />
                <span>{title}</span>
                <span className="edit-chevron">⌄</span>
            </div>
            {events.map(event => (
                <div key={event.id} className="edit-event">
                    <button
                        type="button"
                        className="edit-event-line"
                        onClick={() => openFile(event.file)}
                        title={`Open ${event.file}`}
                    >
                        <span>{event.status === 'editing' ? 'Editing' : event.status === 'failed' ? 'Failed' : 'Edited'}</span>
                        <span className="edit-file-name">{event.file.split('/').at(-1) ?? event.file}</span>
                        <span className="edit-add">+{event.additions}</span>
                        <span className="edit-delete">-{event.deletions}</span>
                    </button>
                    {event.preview.length > 0 && (
                        <div className="edit-preview">
                            <div className="edit-preview-header">
                                <span>{event.file.split('/').at(-1) ?? event.file}</span>
                                <span className="edit-add">+{event.additions}</span>
                                <span className="edit-delete">-{event.deletions}</span>
                            </div>
                            <div className="edit-preview-code">
                                {event.preview.map((line, index) => (
                                    <div key={`${line.lineNo}-${index}`} className={`edit-preview-row edit-preview-row--${line.type}`}>
                                        <span className="edit-preview-line-no">{line.lineNo}</span>
                                        <code>{line.text || ' '}</code>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
            {events.length > 1 && (
                <div className="edit-total">
                    <span>Total</span>
                    <span className="edit-add">+{totalAdded}</span>
                    <span className="edit-delete">-{totalDeleted}</span>
                </div>
            )}
        </div>
    );
}

function EditPencilIcon(): React.ReactElement {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="m4 12.8-.7 2.7 2.7-.7 8.1-8.1a1.9 1.9 0 0 0-2.7-2.7L4 12.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

// ─── Agent log (collapses when > 10 items) ─────────────────────────────────

const LOG_LIMIT = 10;

function AgentLog({ statuses }: { statuses: string[] }): React.ReactElement {
    const [expanded, setExpanded] = useState(false);
    const total   = statuses.length;
    const visible = expanded || total <= LOG_LIMIT
        ? statuses
        : [...statuses.slice(0, 3), ...statuses.slice(total - 7)];

    return (
        <div className="agent-log">
            {visible.map((s, i) => {
                // Determine if this status is the last one (active) in the FULL list
                const originalIdx = expanded || total <= LOG_LIMIT
                    ? i
                    : i < 3 ? i : total - 7 + (i - 3);
                const isActive = originalIdx === total - 1;
                return (
                    <div key={i} className={`agent-status ${isActive ? 'active' : 'done'}`}>
                        {s}
                    </div>
                );
            })}
            {total > LOG_LIMIT && (
                <button className="log-expand-btn" onClick={() => setExpanded(e => !e)}>
                    {expanded
                        ? '▲ Show less'
                        : `▼ ${total - LOG_LIMIT} more steps`}
                </button>
            )}
        </div>
    );
}

// ─── Code block (collapses when > 10 lines) ─────────────────────────────────

const CODE_LINE_LIMIT = 10;

function CodeBlock({ lang, code }: { lang: string; code: string }): React.ReactElement {
    const [copied,   setCopied]   = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);

    const lines     = code.split('\n');
    const tooLong   = lines.length > CODE_LINE_LIMIT;
    const displayed = tooLong && !expanded
        ? lines.slice(0, CODE_LINE_LIMIT).join('\n')
        : code;

    const handleCopy = () => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="code-block">
            {lang && <div className="code-lang">{lang}</div>}
            <pre><code>{displayed}</code></pre>
            <div className="code-block-footer">
                {tooLong && (
                    <button className="code-expand-btn" onClick={() => setExpanded(e => !e)}>
                        {expanded
                            ? '▲ Collapse'
                            : `▼ Show ${lines.length - CODE_LINE_LIMIT} more lines`}
                    </button>
                )}
                <button className="copy-btn" onClick={handleCopy}>
                    {copied ? '✓ Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
}
