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
              <span style={{ color: '#3b82f6', fontWeight: '500' }}>{String(args.subagent_type)}</span>
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
            border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          <pre style={{ ...codeStyle, color: response.error ? '#ef4444' : 'var(--text-primary)' }}>
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
              todo.status === 'completed' ? '#10b981' :
              todo.status === 'in_progress' ? '#3b82f6' :
              '#6b7280';
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
                  border: `1px solid ${todo.status === 'in_progress' ? '#3b82f6' : 'var(--border)'}`,
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
