import React, { useState } from 'react';
import { type PlanTodo } from './types';

interface Props {
    todos:    PlanTodo[];
    onDismiss: () => void;
}

export default function TodoPanel({ todos, onDismiss }: Props): React.ReactElement | null {
    const [collapsed, setCollapsed] = useState(false);

    if (todos.length === 0) return null;

    const done  = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const allDone = done === total;

    return (
        <div className={`todo-panel ${allDone ? 'todo-panel--done' : ''}`}>
            <div className="todo-header" onClick={() => setCollapsed(c => !c)} role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setCollapsed(c => !c)}>
                <span className={`todo-collapse-arrow ${collapsed ? 'todo-collapse-arrow--collapsed' : ''}`}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <path d="M2 3l3 4 3-4z"/>
                    </svg>
                </span>
                <span className="todo-title">Todos ({done}/{total})</span>
                <button
                    className="todo-dismiss"
                    onClick={e => { e.stopPropagation(); onDismiss(); }}
                    title="Dismiss"
                    aria-label="Dismiss todos"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M10 2L6 6m0 0L2 10m4-4L2 2m4 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                    </svg>
                </button>
            </div>

            {!collapsed && (
                <ul className="todo-list">
                    {todos.map(todo => (
                        <li key={todo.id} className={`todo-item todo-item--${todo.status}`}>
                            <span className="todo-icon" aria-label={todo.status}>
                                {todo.status === 'completed'  && <CheckIcon />}
                                {todo.status === 'in-progress' && <SpinnerDot />}
                                {todo.status === 'not-started' && <EmptyCircle />}
                            </span>
                            <span className="todo-text">{todo.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CheckIcon(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function SpinnerDot(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="todo-spinner">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="8" cy="8" r="4" fill="currentColor"/>
        </svg>
    );
}

function EmptyCircle(): React.ReactElement {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" opacity="0.4"/>
        </svg>
    );
}
