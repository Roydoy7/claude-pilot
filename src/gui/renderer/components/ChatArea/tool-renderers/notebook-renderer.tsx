/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Notebook/Edit Tools Renderers - MultiEdit and NotebookEdit
 */

import type { ReactNode } from 'react';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';
import { EditIcon } from './edit-renderer';

// ============================================
// MultiEdit Tool Renderer
// ============================================

interface EditItem {
  old_string: string;
  new_string: string;
}

export const multiEditRenderer: ToolConfig = {
  icon: <EditIcon />,

  getInlineText: (args: ToolArgs): string => {
    const path = String(args.file_path || '');
    const fileName = path.split(/[/\\]/).pop() || path;
    const editsCount = Array.isArray(args.edits) ? args.edits.length : 0;
    return `✏️ ${fileName} (${editsCount} edits)`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.file_path || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    const hasArgs = !!args.file_path;
    const hasResponse = !!response;
    if (!hasArgs && !hasResponse) return null;

    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {hasArgs && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            style={getButtonStyle(showDetails)}
          >
            {showDetails ? 'Hide' : 'Edits'}
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

    if (args.file_path && args.edits) {
      const edits = args.edits as EditItem[];

      elements.push(
        <div key="details" style={contentContainerStyle}>
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📄 File: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.file_path)}</span>
          </div>
          {edits.map((edit, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: idx < edits.length - 1 ? '0.5rem' : 0,
                paddingLeft: '0.5rem',
                borderLeft: '2px solid var(--border)',
              }}
            >
              <div style={{ color: 'var(--error)', fontSize: '0.7rem' }}>
                - {(edit.old_string?.length > 50 ? edit.old_string.substring(0, 50) + '...' : edit.old_string) || '(empty)'}
              </div>
              <div style={{ color: 'var(--success)', fontSize: '0.7rem' }}>
                + {(edit.new_string?.length > 50 ? edit.new_string.substring(0, 50) + '...' : edit.new_string) || '(empty)'}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (showResult && response) {
      elements.push(
        <div
          key="result"
          style={{
            ...contentContainerStyle,
            border: response.error ? '1px solid #ef4444' : '1px solid #10b981',
          }}
        >
          <span style={{ color: response.error ? 'var(--error)' : 'var(--success)' }}>
            {response.error ? `❌ ${response.error}` : '✅ All edits applied successfully'}
          </span>
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};

// ============================================
// NotebookEdit Tool Renderer
// ============================================

export const notebookEditRenderer: ToolConfig = {
  icon: '📓',

  getInlineText: (args: ToolArgs): string => {
    const path = String(args.notebook_path || '');
    const fileName = path.split(/[/\\]/).pop() || path;
    const mode = String(args.edit_mode || 'replace');
    return `📓 ${fileName} (${mode})`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.notebook_path || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    const hasArgs = !!args.notebook_path;
    const hasResponse = !!response;
    if (!hasArgs && !hasResponse) return null;

    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {hasArgs && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            style={getButtonStyle(showDetails)}
          >
            {showDetails ? 'Hide' : 'Details'}
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

    if (args.notebook_path) {
      elements.push(
        <div key="details" style={contentContainerStyle}>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📓 Notebook: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.notebook_path)}</span>
          </div>
          {!!args.cell_type && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📝 Cell type: </span>
              <span style={{ color: 'var(--text-primary)' }}>{String(args.cell_type)}</span>
            </div>
          )}
          {!!args.edit_mode && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>⚙️ Mode: </span>
              <span
                style={{
                  color: args.edit_mode === 'delete' ? 'var(--error)' :
                         args.edit_mode === 'insert' ? 'var(--success)' : 'var(--accent)',
                }}
              >
                {String(args.edit_mode)}
              </span>
            </div>
          )}
        </div>
      );
    }

    if (showResult && response) {
      elements.push(
        <div
          key="result"
          style={{
            ...contentContainerStyle,
            border: response.error ? '1px solid #ef4444' : '1px solid #10b981',
          }}
        >
          <span style={{ color: response.error ? 'var(--error)' : 'var(--success)' }}>
            {response.error ? `❌ ${response.error}` : '✅ Notebook updated'}
          </span>
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};
