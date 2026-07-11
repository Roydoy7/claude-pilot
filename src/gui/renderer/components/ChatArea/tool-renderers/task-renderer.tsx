/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Task Tools Renderers - Task (subagent) and TodoWrite
 */

import type { ReactNode } from 'react';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, codeStyle } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

// ============================================
// Task Tool Renderer (Sub-agent)
// ============================================

export const taskRenderer: ToolConfig = {
  icon: '🤖',

  getInlineText: (args: ToolArgs): string => {
    const desc = String(args.description || '');
    const agentType = String(args.subagent_type || '');
    if (desc) return `${agentType ? `[${agentType}] ` : ''}${desc}`;
    return agentType || 'Sub-agent task';
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.prompt || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    const hasPrompt = !!args.prompt;
    const hasResponse = !!response;
    if (!hasPrompt && !hasResponse) return null;

    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {hasPrompt && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            style={getButtonStyle(showDetails)}
          >
            {showDetails ? 'Hide' : 'Prompt'}
          </button>
        )}
        {hasResponse && setShowResult && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
            style={getButtonStyle(showResult ?? false)}
          >
            {showResult ? 'Hide' : 'Result'}
          </button>
        )}
      </div>
    );
  },

  renderContent: (
    args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse
  ) => {
    const elements: ReactNode[] = [];

    if (args.prompt) {
      const prompt = String(args.prompt);
      const promptPreview = prompt.length > 500 ? prompt.substring(0, 500) + '...' : prompt;

      elements.push(
        <div key="details" style={contentContainerStyle}>
          {!!args.subagent_type && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>🤖 Agent: </span>
              <span style={{ color: 'var(--accent)', fontWeight: '500' }}>{String(args.subagent_type)}</span>
            </div>
          )}
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>📋 Task: </span>
            <span style={{ color: 'var(--text-primary)' }}>{promptPreview}</span>
          </div>
        </div>
      );
    }

    if (showResult && response) {
      elements.push(
        <div
          key="result"
          style={{
            ...contentContainerStyle,
            border: response.error ? '1px solid var(--error)' : '1px solid var(--border)',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          <pre style={{ ...codeStyle, color: response.error ? 'var(--error)' : 'var(--text-primary)' }}>
            {response.error || response.output}
          </pre>
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};

// ============================================
// TodoWrite Tool Renderer
// ============================================

interface TodoItem {
  status: string;
  content: string;
  activeForm?: string;
}

export const todoWriteRenderer: ToolConfig = {
  icon: '📋',

  getInlineText: (args: ToolArgs): string => {
    if (!args.todos || !Array.isArray(args.todos)) return '';
    const todos = args.todos as TodoItem[];
    const completed = todos.filter((t) => t.status === 'completed').length;
    const inProgress = todos.filter((t) => t.status === 'in_progress').length;
    return `${todos.length} tasks (${completed}✓ ${inProgress}→)`;
  },

  hasDetails: (args: ToolArgs): boolean => {
    return !!args.todos && Array.isArray(args.todos) && (args.todos as TodoItem[]).length > 0;
  },

  defaultExpanded: true,

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void
  ) => {
    if (!args.todos || (args.todos as TodoItem[]).length === 0) return null;

    return (
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        style={getButtonStyle(showDetails)}
      >
        {showDetails ? 'Hide Tasks' : 'Show Tasks'}
      </button>
    );
  },

  renderContent: (args: ToolArgs) => {
    if (!args.todos || (args.todos as TodoItem[]).length === 0) return null;

    const todos = args.todos as TodoItem[];

    return (
      <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {todos.map((todo, index) => {
            const statusColor =
              todo.status === 'completed' ? 'var(--success)' :
              todo.status === 'in_progress' ? 'var(--accent)' :
              'var(--text-tertiary)';
            const statusIcon =
              todo.status === 'completed' ? '✅' :
              todo.status === 'in_progress' ? '🔄' :
              '⏳';

            return (
              <div
                key={index}
                style={{
                  padding: '0.375rem 0.5rem',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                  border: `1px solid ${todo.status === 'in_progress' ? 'var(--accent)' : 'var(--border)'}`,
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{statusIcon}</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      flex: 1,
                      textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                      opacity: todo.status === 'completed' ? 0.7 : 1,
                    }}
                  >
                    {todo.content}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: statusColor, fontWeight: '600' }}>
                    {todo.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
};

// ============================================
// Shared helpers for TaskCreate/TaskGet/TaskUpdate/TaskList
// ============================================

function parseTaskToolResult<T>(response?: ToolResponse): T | null {
  if (!response || response.error || !response.output) return null;
  try {
    return JSON.parse(response.output) as T;
  } catch {
    return null;
  }
}

function getTaskStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✅';
    case 'in_progress': return '🔄';
    case 'deleted': return '🗑️';
    default: return '⏳';
  }
}

function getTaskStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'var(--success)';
    case 'in_progress': return 'var(--accent)';
    case 'deleted': return 'var(--text-tertiary)';
    default: return 'var(--text-tertiary)';
  }
}

// ============================================
// TaskCreate Tool Renderer
// ============================================

interface TaskCreateResult {
  task: { id: string; subject: string };
}

export const taskCreateRenderer: ToolConfig = {
  icon: '🆕',

  getInlineText: (args: ToolArgs): string => String(args.subject || ''),

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.description || !!response;
  },

  defaultExpanded: true,

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse
  ) => {
    if (!args.description && !response) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        style={getButtonStyle(showDetails)}
      >
        {showDetails ? 'Hide' : 'Details'}
      </button>
    );
  },

  renderContent: (args: ToolArgs, _showResult?: boolean, response?: ToolResponse) => {
    const result = parseTaskToolResult<TaskCreateResult>(response);

    return (
      <div style={contentContainerStyle}>
        {!!args.description && (
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📋 Description: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.description)}</span>
          </div>
        )}
        {!!args.activeForm && (
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>🔄 Active form: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.activeForm)}</span>
          </div>
        )}
        {result?.task && (
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>✅ Created: </span>
            <span style={{ color: 'var(--text-primary)' }}>{result.task.subject}</span>
            <span style={{ color: 'var(--text-secondary)' }}> (ID: {result.task.id})</span>
          </div>
        )}
        {response?.error && (
          <pre style={{ ...codeStyle, color: 'var(--error)' }}>{response.error}</pre>
        )}
      </div>
    );
  },
};

// ============================================
// TaskGet Tool Renderer
// ============================================

interface TaskGetResult {
  task: {
    id: string;
    subject: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    blocks: string[];
    blockedBy: string[];
  } | null;
}

export const taskGetRenderer: ToolConfig = {
  icon: '🔍',

  getInlineText: (args: ToolArgs): string => {
    const taskId = String(args.taskId || '');
    return taskId ? `#${taskId}` : '';
  },

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => !!response,

  defaultExpanded: true,

  renderButton: (
    _args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse
  ) => {
    if (!response) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        style={getButtonStyle(showDetails)}
      >
        {showDetails ? 'Hide' : 'Details'}
      </button>
    );
  },

  renderContent: (_args: ToolArgs, _showResult?: boolean, response?: ToolResponse) => {
    if (response?.error) {
      return (
        <div style={contentContainerStyle}>
          <pre style={{ ...codeStyle, color: 'var(--error)' }}>{response.error}</pre>
        </div>
      );
    }

    const result = parseTaskToolResult<TaskGetResult>(response);

    if (!result?.task) {
      return (
        <div style={contentContainerStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Task not found</span>
        </div>
      );
    }

    const { task } = result;

    return (
      <div style={contentContainerStyle}>
        <div style={{ marginBottom: '0.25rem' }}>
          <span>{getTaskStatusIcon(task.status)} </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{task.subject}</span>
          <span style={{ color: getTaskStatusColor(task.status), fontSize: '0.65rem', fontWeight: '600', marginLeft: '0.5rem' }}>
            {task.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <div style={{ marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>📋 Description: </span>
          <span style={{ color: 'var(--text-primary)' }}>{task.description}</span>
        </div>
        {task.blocks.length > 0 && (
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>🔒 Blocks: </span>
            <span style={{ color: 'var(--text-primary)' }}>{task.blocks.join(', ')}</span>
          </div>
        )}
        {task.blockedBy.length > 0 && (
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>⛔ Blocked by: </span>
            <span style={{ color: 'var(--text-primary)' }}>{task.blockedBy.join(', ')}</span>
          </div>
        )}
      </div>
    );
  },
};

// ============================================
// TaskUpdate Tool Renderer
// ============================================

interface TaskUpdateResult {
  success: boolean;
  taskId: string;
  updatedFields: string[];
  error?: string;
  statusChange?: { from: string; to: string };
}

export const taskUpdateRenderer: ToolConfig = {
  icon: '✏️',

  getInlineText: (args: ToolArgs): string => {
    const taskId = String(args.taskId || '');
    const status = args.status ? String(args.status) : '';
    return status ? `#${taskId} → ${status}` : `#${taskId}`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.subject || !!args.description || !!response;
  },

  defaultExpanded: true,

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse
  ) => {
    if (!args.subject && !args.description && !response) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        style={getButtonStyle(showDetails)}
      >
        {showDetails ? 'Hide' : 'Details'}
      </button>
    );
  },

  renderContent: (args: ToolArgs, _showResult?: boolean, response?: ToolResponse) => {
    const result = parseTaskToolResult<TaskUpdateResult>(response);
    const errorMessage = response?.error || result?.error;

    return (
      <div style={contentContainerStyle}>
        {!!args.subject && (
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📝 Subject: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.subject)}</span>
          </div>
        )}
        {!!args.description && (
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📋 Description: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.description)}</span>
          </div>
        )}
        {result?.statusChange && (
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>🔄 Status: </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {result.statusChange.from} → {result.statusChange.to}
            </span>
          </div>
        )}
        {result && (
          <div>
            <span style={{ color: result.success ? 'var(--success)' : 'var(--error)' }}>
              {result.success ? '✅ Updated' : '❌ Failed'}
            </span>
            {result.updatedFields.length > 0 && (
              <span style={{ color: 'var(--text-secondary)' }}> ({result.updatedFields.join(', ')})</span>
            )}
          </div>
        )}
        {errorMessage && (
          <pre style={{ ...codeStyle, color: 'var(--error)' }}>{errorMessage}</pre>
        )}
      </div>
    );
  },
};

// ============================================
// TaskList Tool Renderer
// ============================================

interface TaskListResultItem {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  owner?: string;
  blockedBy: string[];
}

interface TaskListResult {
  tasks: TaskListResultItem[];
}

export const taskListRenderer: ToolConfig = {
  icon: '📑',

  getInlineText: (): string => '',

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => !!response,

  defaultExpanded: true,

  renderButton: (
    _args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse
  ) => {
    if (!response) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        style={getButtonStyle(showDetails)}
      >
        {showDetails ? 'Hide' : 'Show Tasks'}
      </button>
    );
  },

  renderContent: (_args: ToolArgs, _showResult?: boolean, response?: ToolResponse) => {
    if (response?.error) {
      return (
        <div style={contentContainerStyle}>
          <pre style={{ ...codeStyle, color: 'var(--error)' }}>{response.error}</pre>
        </div>
      );
    }

    const result = parseTaskToolResult<TaskListResult>(response);

    if (!result?.tasks || result.tasks.length === 0) {
      return (
        <div style={contentContainerStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>No tasks</span>
        </div>
      );
    }

    return (
      <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {result.tasks.map((task) => (
            <div
              key={task.id}
              style={{
                padding: '0.375rem 0.5rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '4px',
                border: `1px solid ${task.status === 'in_progress' ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{getTaskStatusIcon(task.status)}</span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    flex: 1,
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    opacity: task.status === 'completed' ? 0.7 : 1,
                  }}
                >
                  {task.subject}
                </span>
                {task.owner && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>@{task.owner}</span>
                )}
                <span style={{ fontSize: '0.65rem', color: getTaskStatusColor(task.status), fontWeight: '600' }}>
                  {task.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              {task.blockedBy.length > 0 && (
                <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
                  ⛔ Blocked by: {task.blockedBy.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
};
