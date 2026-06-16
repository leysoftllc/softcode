import React, { useRef, useEffect, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Hand,
    ListChecks,
    Monitor,
    Paperclip,
    Plus,
    Puzzle,
    Send,
    Sparkles,
    Square,
    Target,
} from 'lucide-react';
import Message from './Message';
import { Button } from './components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { Switch } from './components/ui/switch';
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
    onCopyConversation: () => void;
    didCopyConversation: boolean;
    onResubmitMessage: (messageId: string, content: string) => void;
    onRetryAssistant: (messageId: string) => void;
}

export default function Chat({
    messages, isStreaming, onSend, onStop, contextInfo,
    selectedModel, onModelChange, mode, onModeChange,
    contextScopes, onToggleContextScope,
    attachedFiles, onAttachFiles, onPickFiles, onRemoveAttachedFile,
    onCopyConversation, didCopyConversation, onResubmitMessage, onRetryAssistant,
}: Props): React.ReactElement {
    const [input,        setInput]       = useState('');
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
                    <Message
                        key={msg.id}
                        message={msg}
                        onResubmit={onResubmitMessage}
                        onRetryAssistant={onRetryAssistant}
                        modelLabel={MODEL_INFO[selectedModel]?.label ?? selectedModel}
                        disabled={isStreaming}
                    />
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="icon"
                                    size="icon"
                                    className="tool-btn toolbar-attach"
                                    title="Add"
                                >
                                    <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="plus-menu" align="start" side="top">
                                <DropdownMenuItem
                                    className="plus-menu-row"
                                    onSelect={() => onPickFiles()}
                                >
                                    <Paperclip size={18} strokeWidth={1.8} aria-hidden="true" />
                                    <span>Add photos & files</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="plus-menu-divider" />
                                <DropdownMenuItem
                                    className="plus-menu-row"
                                    onSelect={event => {
                                        event.preventDefault();
                                        onToggleContextScope('workspace');
                                    }}
                                >
                                    <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
                                    <span>Include IDE context</span>
                                    <Switch checked={includeIdeContext} aria-label="Include IDE context" />
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="plus-menu-row"
                                    onSelect={event => {
                                        event.preventDefault();
                                        onModeChange(planMode ? 'ask' : 'analyze');
                                    }}
                                >
                                    <ListChecks size={18} strokeWidth={1.8} aria-hidden="true" />
                                    <span>Plan mode</span>
                                    <Switch checked={planMode} aria-label="Plan mode" />
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="plus-menu-row"
                                    onSelect={event => {
                                        event.preventDefault();
                                        setPursueGoal(v => !v);
                                    }}
                                >
                                    <Target size={18} strokeWidth={1.8} aria-hidden="true" />
                                    <span>Pursue goal</span>
                                    <Switch checked={pursueGoal} aria-label="Pursue goal" />
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="plus-menu-divider" />
                                <DropdownMenuItem className="plus-menu-row plus-menu-row--plugins">
                                    <Puzzle size={18} strokeWidth={1.8} aria-hidden="true" />
                                    <span>Plugins</span>
                                    <ChevronRight size={17} strokeWidth={1.8} aria-hidden="true" />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="toolbar-divider" />

                        {/* Agent mode button */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="toolbar-mode-btn"
                                    title="Switch mode"
                                >
                                    <Hand size={15} strokeWidth={1.7} aria-hidden="true" />
                                    <span>{MODE_INFO[mode].label} for approval</span>
                                    <ChevronDown size={14} strokeWidth={1.7} aria-hidden="true" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="mode-menu" align="start" side="top">
                                {(Object.entries(MODE_INFO) as [Mode, typeof MODE_INFO[Mode]][]).map(([id, info]) => (
                                    <DropdownMenuItem
                                        key={id}
                                        className={`mode-menu-item ${mode === id ? 'active' : ''}`}
                                        onSelect={() => onModeChange(id)}
                                    >
                                        <span className="mode-menu-label">{info.label}</span>
                                        <span className="mode-menu-desc">{info.description}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

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

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="ide-context-btn"
                                    title="IDE context"
                                >
                                    <Sparkles size={15} strokeWidth={1.7} aria-hidden="true" />
                                    <span>{contextScopes.length} sources</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="context-menu" align="end" side="top">
                                {CONTEXT_OPTIONS.map(option => {
                                    const selected = contextScopes.includes(option.id);
                                    return (
                                        <DropdownMenuItem
                                            key={option.id}
                                            className={`context-menu-item ${selected ? 'active' : ''}`}
                                            onSelect={event => {
                                                event.preventDefault();
                                                onToggleContextScope(option.id);
                                            }}
                                        >
                                            <span className="context-check">{selected && <Check size={13} strokeWidth={2} />}</span>
                                            <span>{option.label}</span>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Send / Stop */}
                        {isStreaming ? (
                            <Button
                                type="button"
                                variant="icon"
                                size="icon"
                                className="send-btn send-btn--stop"
                                onClick={onStop}
                                title="Stop generation"
                            >
                                <Square size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                variant="icon"
                                size="icon"
                                className="send-btn"
                                disabled={!input.trim()}
                                title="Send (Enter)"
                            >
                                <Send size={15} strokeWidth={1.8} aria-hidden="true" />
                            </Button>
                        )}
                    </div>
                </div>
            </form>

            <div className="chat-footer">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            className="work-local-btn"
                        >
                            <Monitor size={15} strokeWidth={1.7} aria-hidden="true" />
                            <span>Work locally</span>
                            <ChevronDown size={14} strokeWidth={1.7} aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="local-menu" align="start" side="top">
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
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    type="button"
                    variant="ghost"
                    className={`copy-conversation-btn ${didCopyConversation ? 'copied' : ''}`}
                    onClick={onCopyConversation}
                    disabled={messages.length === 0}
                    title={didCopyConversation ? 'Copied conversation' : 'Copy conversation'}
                    aria-label={didCopyConversation ? 'Copied conversation' : 'Copy conversation'}
                >
                    {didCopyConversation
                        ? <Check size={15} strokeWidth={1.9} aria-hidden="true" />
                        : <Copy size={15} strokeWidth={1.7} aria-hidden="true" />}
                    <span>{didCopyConversation ? 'Copied' : 'Copy conversation'}</span>
                </Button>
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
