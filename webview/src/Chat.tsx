import React, { useRef, useEffect, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import Message from './Message';
import { MODEL_INFO, type AttachedFile, type ChatMessage, type ContextInfo, type ContextScope, type ModelId, type Mode, MODE_INFO } from './types';

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
    contextScopes: ContextScope[];
    onToggleContextScope: (scope: ContextScope) => void;
    attachedFiles: AttachedFile[];
    onAttachFiles: (files: AttachedFile[]) => void;
    onPickFiles: () => void;
    onRemoveAttachedFile: (id: string) => void;
}

export default function Chat({
    messages, isStreaming, onSend, onStop, contextInfo,
    selectedModel, onModelChange, mode, onModeChange,
    contextScopes, onToggleContextScope,
    attachedFiles, onAttachFiles, onPickFiles, onRemoveAttachedFile,
}: Props): React.ReactElement {
    const [input,        setInput]       = useState('');
    const [showModeMenu, setShowModeMenu] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [showLocalMenu, setShowLocalMenu] = useState(false);
    const [pursueGoal, setPursueGoal] = useState(false);
    const [isDraggingImages, setIsDraggingImages] = useState(false);
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

    const placeholder = isStreaming ? 'Working...' : 'Do anything';
    const tokenLabel = contextInfo
        ? `${Math.max(1, Math.round(contextInfo.tokens / 100) / 10)}k`
        : '0k';
    const includeIdeContext = contextScopes.includes('workspace');
    const planMode = mode === 'analyze';

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!hasImageFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsDraggingImages(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDraggingImages(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!hasImageFiles(event.dataTransfer)) return;
        event.preventDefault();
        setIsDraggingImages(false);
        void readDroppedImages(event.dataTransfer.files).then(files => {
            if (files.length > 0) onAttachFiles(files);
        });
    };

    return (
        <div
            className={`chat ${isDraggingImages ? 'chat--dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDraggingImages && (
                <div className="drop-overlay" aria-hidden="true">
                    <div>Drop images to attach</div>
                </div>
            )}
            <div className="messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-mark" aria-hidden="true">
                            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                                <path d="M24.6 7.2c4.6-4.6 13.1-1.8 14.2 4.4 6.7.7 10.1 8.8 5.7 13.8 4.1 5.6-.2 13.3-7 13.3-1.9 6.5-10.6 8.2-14.8 2.9-6.5 2.2-12.8-4-10.6-10.5-5.5-3.7-4.1-12.6 2.2-14.5.3-6.8 7.3-11 10.3-9.4Z" stroke="currentColor" strokeWidth="3.1" strokeLinejoin="round"/>
                                <path d="M22 22.5l-4.1 4 4.1 4M30.5 30h5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
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

                    {attachedFiles.length > 0 && (
                        <div className="composer-attachments">
                            {attachedFiles.map(file => (
                                <button
                                    key={attachmentId(file)}
                                    type="button"
                                    className={`composer-attachment ${file.dataBase64 ? 'composer-attachment--image' : ''}`}
                                    title={file.fsPath ?? file.label}
                                    onClick={() => onRemoveAttachedFile(attachmentId(file))}
                                >
                                    {file.dataBase64 && (
                                        <img
                                            src={`data:${file.mimeType};base64,${file.dataBase64}`}
                                            alt=""
                                        />
                                    )}
                                    <span>{file.label}</span>
                                    <span aria-hidden="true">×</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ─── Toolbar: matches screenshot ─── */}
                    <div className="input-toolbar">
                        <div className="toolbar-plus-wrap">
                            <button
                                type="button"
                                className="tool-btn toolbar-attach"
                                title="Add"
                                onClick={() => setShowPlusMenu(v => !v)}
                            >
                                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                    <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
                                </svg>
                            </button>

                            {showPlusMenu && (
                                <div className="plus-menu" onMouseLeave={() => setShowPlusMenu(false)}>
                                    <button
                                        type="button"
                                        className="plus-menu-row"
                                        onClick={() => { onPickFiles(); setShowPlusMenu(false); }}
                                    >
                                        <PaperclipIcon />
                                        <span>Add photos & files</span>
                                    </button>
                                    <div className="plus-menu-divider" />
                                    <button
                                        type="button"
                                        className="plus-menu-row"
                                        onClick={() => onToggleContextScope('workspace')}
                                    >
                                        <SparkIcon />
                                        <span>Include IDE context</span>
                                        <Toggle enabled={includeIdeContext} />
                                    </button>
                                    <button
                                        type="button"
                                        className="plus-menu-row"
                                        onClick={() => onModeChange(planMode ? 'ask' : 'analyze')}
                                    >
                                        <PlanIcon />
                                        <span>Plan mode</span>
                                        <Toggle enabled={planMode} />
                                    </button>
                                    <button
                                        type="button"
                                        className="plus-menu-row"
                                        onClick={() => setPursueGoal(v => !v)}
                                    >
                                        <GoalIcon />
                                        <span>Pursue goal</span>
                                        <Toggle enabled={pursueGoal} />
                                    </button>
                                    <div className="plus-menu-divider" />
                                    <button type="button" className="plus-menu-row plus-menu-row--plugins">
                                        <PluginIcon />
                                        <span>Plugins</span>
                                        <ChevronRightIcon />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="toolbar-divider" />

                        {/* Agent mode button */}
                        <div className="toolbar-mode-wrap">
                            <button
                                type="button"
                                className="toolbar-mode-btn"
                                onClick={() => setShowModeMenu(m => !m)}
                                title="Switch mode"
                            >
                                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M7 14.2c-1.8-.5-2.8-1.7-2.8-3.4V8.6c0-.7.5-1.2 1.1-1.2.4 0 .8.2 1 .5V3.1c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v3.4c.2-.3.6-.5 1-.5.5 0 .9.3 1.1.7.2-.2.6-.4.9-.4.6 0 1 .4 1.1.9.2-.1.5-.2.8-.2.7 0 1.2.5 1.2 1.2v1.9c0 3.2-2.5 5.1-5.3 5.1H7Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>{MODE_INFO[mode].label} for approval</span>
                                <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
                                    <path d="M1 1.2 4.5 4.7 8 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
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
                        <span className="toolbar-budget" title="Estimated context tokens">{tokenLabel}</span>

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        <div className="toolbar-context-wrap">
                            <button
                                type="button"
                                className="ide-context-btn"
                                title="IDE context"
                                onClick={() => setShowContextMenu(v => !v)}
                            >
                                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4 5 5M11 11l1.6 1.6M12.6 3.4 11 5M3.4 12.6 5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                    <path d="m7.2 6.2 2.3 1-1.3.8 1.1 1.8-1.1.6-1-1.8-1.2.9 1.2-3.3Z" fill="currentColor"/>
                                </svg>
                                <span>{contextScopes.length} sources</span>
                            </button>
                            {showContextMenu && (
                                <div className="context-menu" onMouseLeave={() => setShowContextMenu(false)}>
                                    {CONTEXT_OPTIONS.map(option => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={`context-menu-item ${contextScopes.includes(option.id) ? 'active' : ''}`}
                                            onClick={() => onToggleContextScope(option.id)}
                                        >
                                            <span className="context-check">{contextScopes.includes(option.id) ? '✓' : ''}</span>
                                            <span>{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

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
                                    <path d="M6 10.2V2M2.4 5.6 6 2l3.6 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </form>

            <div className="chat-footer">
                <button
                    type="button"
                    className="work-local-btn"
                    onClick={() => setShowLocalMenu(v => !v)}
                    aria-expanded={showLocalMenu}
                >
                    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" aria-hidden="true">
                        <path d="M2.1 2.1h10.8v7.2H2.1zM5.2 11h4.6M1 11h13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Work locally</span>
                    <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
                        <path d="M1 1.2 4.5 4.7 8 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
                {showLocalMenu && (
                    <div className="local-menu" onMouseLeave={() => setShowLocalMenu(false)}>
                        <div className="local-menu-title">Local workspace</div>
                        <div className="local-menu-row">
                            <span>Files are read from VS Code</span>
                            <span>On</span>
                        </div>
                        <div className="local-menu-row">
                            <span>Cloud sync</span>
                            <span>Off</span>
                        </div>
                        <div className="local-menu-row">
                            <span>Model provider</span>
                            <span>Anthropic</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_DROPPED_IMAGE_BYTES = 5_000_000;

function attachmentId(file: AttachedFile): string {
    return file.id ?? file.fsPath ?? `${file.label}-${file.mimeType ?? 'file'}`;
}

function hasImageFiles(dataTransfer: DataTransfer): boolean {
    return Array.from(dataTransfer.items).some(item =>
        item.kind === 'file' && IMAGE_TYPES.has(item.type),
    );
}

async function readDroppedImages(fileList: FileList): Promise<AttachedFile[]> {
    const files = Array.from(fileList)
        .filter(file => IMAGE_TYPES.has(file.type) && file.size <= MAX_DROPPED_IMAGE_BYTES);

    return Promise.all(files.map(async file => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        label: file.name,
        mimeType: file.type,
        dataBase64: await readImageAsBase64(file),
    })));
}

function readImageAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result ?? '');
            resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

const CONTEXT_OPTIONS: Array<{ id: ContextScope; label: string }> = [
    { id: 'file',      label: 'Active file' },
    { id: 'selection', label: 'Selection' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'search',    label: 'Search' },
];

function Toggle({ enabled }: { enabled: boolean }): React.ReactElement {
    return (
        <span className={`plus-toggle ${enabled ? 'plus-toggle--on' : ''}`} aria-hidden="true">
            <span />
        </span>
    );
}

function PaperclipIcon(): React.ReactElement {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.8 12.5v4.3a3.2 3.2 0 0 0 6.4 0V7.6a4.4 4.4 0 0 0-8.8 0v9.1a5.6 5.6 0 1 0 11.2 0V8.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
    );
}

function SparkIcon(): React.ReactElement {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            <path d="m10.2 10 4.5 1.8-2.3 1.2 1.8 3.1-1.8 1-1.7-3.2-2 1.6L10.2 10Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
    );
}

function PlanIcon(): React.ReactElement {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4.5 7.5 6.2 9 9 5.5M4.5 16.5 6.2 18 9 14.5M12 7h7M12 17h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function GoalIcon(): React.ReactElement {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7"/>
            <circle cx="12" cy="12" r="4.3" stroke="currentColor" strokeWidth="1.7"/>
            <path d="M12 8.2v3.8l2.6 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function PluginIcon(): React.ReactElement {
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.2 8.2a6.5 6.5 0 1 1-1.6 6.6M8.2 8.2H5.4M8.2 8.2v-3M8.2 15.8a4.7 4.7 0 0 0 7.6-3.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function ChevronRightIcon(): React.ReactElement {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="m7 4.5 4.5 4.5L7 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
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
