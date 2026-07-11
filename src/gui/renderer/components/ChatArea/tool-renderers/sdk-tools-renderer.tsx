/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent SDK Tools Renderers
 * Read, Write, Edit, Bash, Glob, Grep, LS
 */

import type { ReactNode } from 'react';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, codeStyle, isMcpToolError } from './types';
import { CopyButton } from './shared-components';
import type { ToolResponse } from '../../../../preload/preload-types';

// ============================================
// SVG Icons
// ============================================

export const FileTextIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export const WriteIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#10b981"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" x2="12" y1="18" y2="12" />
    <line x1="9" x2="15" y1="15" y2="15" />
  </svg>
);

export const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" x2="16.65" y1="21" y2="16.65" />
  </svg>
);

export const GlobIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <line x1="12" x2="12" y1="2" y2="22" />
  </svg>
);

export const FolderIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

// ============================================
// Read Tool Renderer
// ============================================

export const readRenderer: ToolConfig = {
  icon: <FileTextIcon />,

  getInlineText: (args: ToolArgs): string => {
    const path = String(args.file_path || '');
    if (args.offset !== undefined || args.limit !== undefined) {
      const range = args.offset && args.limit
        ? `L${args.offset}-${Number(args.offset) + Number(args.limit)}`
        : args.limit ? `first ${args.limit} lines` : `from L${args.offset}`;
      return `📄 ${path} (${range})`;
    }
    return `📄 ${path}`;
  },

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => !!response,

  renderButton: (
    _args: ToolArgs,
    _showDetails: boolean,
    _setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    if (!response) return null;
    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {setShowResult && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
            style={getButtonStyle(showResult ?? false)}
          >
            {showResult ? 'Hide' : 'Content'}
          </button>
        )}
      </div>
    );
  },

  renderContent: (
    _args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse
  ) => {
    if (!showResult || !response) return null;

    let displayContent = response.error || response.output;
    let fileInfo: { numLines?: number; startLine?: number; totalLines?: number } | null = null;

    if (!response.error && response.output) {
      try {
        const parsed = JSON.parse(response.output);
        if (parsed.type === 'text' && parsed.file?.content) {
          displayContent = parsed.file.content;
          fileInfo = {
            numLines: parsed.file.numLines,
            startLine: parsed.file.startLine,
            totalLines: parsed.file.totalLines,
          };
        }
      } catch {
        // Not JSON, use as-is
      }
    }

    return (
      <div
        style={{
          ...contentContainerStyle,
          border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
          maxHeight: '300px',
          overflow: 'auto',
        }}
      >
        {fileInfo && (
          <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
            📊 Lines {fileInfo.startLine}-{(fileInfo.startLine || 1) + (fileInfo.numLines || 0) - 1} of {fileInfo.totalLines}
          </div>
        )}
        <pre style={{ ...codeStyle, color: response.error ? 'var(--error)' : 'var(--text-primary)' }}>
          {displayContent}
        </pre>
      </div>
    );
  },
};

// ============================================
// Write Tool Renderer
// ============================================

export const writeRenderer: ToolConfig = {
  icon: <WriteIcon />,

  getInlineText: (args: ToolArgs): string => {
    const path = String(args.file_path || '');
    const fileName = path.split(/[/\\]/).pop() || path;
    const contentLen = typeof args.content === 'string' ? args.content.length : 0;
    return `✍️ ${fileName} (${contentLen} chars)`;
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
            {showDetails ? 'Hide' : 'Preview'}
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

    if (args.file_path) {
      const content = typeof args.content === 'string' ? args.content : null;
      elements.push(
        <div
          key="details"
          style={{
            ...contentContainerStyle,
            border: '1px solid #10b981',
          }}
        >
          <div style={{ marginBottom: content ? '0.25rem' : 0 }}>
            <span style={{ color: 'var(--text-secondary)' }}>📝 Creating: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.file_path)}</span>
          </div>
          {content && (
            <div style={{ marginTop: '0.5rem' }}>
              <pre style={{ ...codeStyle, color: 'var(--text-secondary)', maxHeight: '400px', overflow: 'auto' }}>
                {content}
              </pre>
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
            {response.error ? `❌ ${response.error}` : '✅ File created successfully'}
          </span>
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};

// ============================================
// Bash Tool Renderer
// ============================================

export const bashRenderer: ToolConfig = {
  icon: '⚡',

  getInlineText: (): string => '',

  hasDetails: (): boolean => true,

  defaultExpanded: false,

  renderButton: () => null,

  renderContent: (
    args: ToolArgs,
    _showResult?: boolean,
    response?: ToolResponse,
    showDetails?: boolean,
    setShowDetails?: (show: boolean) => void
  ) => {
    const cmd = String(args.command || '');
    const formattedCmd = cmd
      .replace(/ && /g, ' \\\n  && ')
      .replace(/ \|\| /g, ' \\\n  || ')
      .replace(/ \| /g, ' \\\n  | ');

    let displayOutput = '';
    let hasStderr = false;
    let stderrContent = '';
    let wasInterrupted = false;
    let isError = false;

    if (response) {
      displayOutput = response.error || response.output || '';
      isError = isMcpToolError(response);

      if (!response.error && response.output) {
        try {
          const parsed = JSON.parse(response.output);
          if (typeof parsed === 'object' && parsed !== null) {
            if (parsed.stdout !== undefined) {
              displayOutput = parsed.stdout || '';
            }
            if (parsed.stderr && parsed.stderr.trim()) {
              hasStderr = true;
              stderrContent = parsed.stderr;
            }
            if (parsed.interrupted) {
              wasInterrupted = true;
            }
          }
        } catch {
          // Not JSON, use as-is
        }
      }
    }

    const hasOutput = !!(displayOutput || wasInterrupted || hasStderr);

    return (
      <div
        style={{
          marginTop: '0.5rem',
          width: 'fit-content',
          maxWidth: '100%',
          padding: '0.05rem 0.75rem',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '10px',
          border: isError ? '1px solid #ef4444' : wasInterrupted ? '1px solid #f59e0b' : '1px solid var(--border)',
          maxHeight: showDetails ? '400px' : undefined,
          overflow: showDetails ? 'auto' : 'hidden',
        }}
      >
        <pre
          onClick={() => hasOutput && setShowDetails?.(!showDetails)}
          style={{ ...codeStyle, color: 'var(--text-primary)', lineHeight: '1.5', cursor: hasOutput ? 'pointer' : 'default' }}
        >
          <span style={{ color: 'var(--success)' }}>$</span> {formattedCmd}
          {hasOutput && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.5, fontSize: '0.65rem' }}>
              {showDetails ? '▾' : '▸'}
            </span>
          )}
        </pre>

        {showDetails && (displayOutput || wasInterrupted) && (
          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)' }}>
            {wasInterrupted && (
              <div style={{ color: 'var(--warning)', fontSize: '0.65rem', marginBottom: '0.25rem' }}>
                ⚠️ Command was interrupted
              </div>
            )}
            {displayOutput && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
                  <CopyButton text={displayOutput} />
                </div>
                <pre style={{ ...codeStyle, color: isError ? 'var(--error)' : 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {displayOutput}
                </pre>
              </>
            )}
          </div>
        )}

        {showDetails && hasStderr && (
          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--warning)', fontSize: '0.65rem' }}>stderr:</span>
              <CopyButton text={stderrContent} />
            </div>
            <pre style={{ ...codeStyle, color: 'var(--warning)', lineHeight: '1.5', opacity: 0.8 }}>
              {stderrContent}
            </pre>
          </div>
        )}
      </div>
    );
  },
};

// ============================================
// Glob Tool Renderer
// ============================================

export const globRenderer: ToolConfig = {
  icon: <GlobIcon />,

  getInlineText: (args: ToolArgs): string => {
    const pattern = String(args.pattern || '');
    const path = String(args.path || '');
    if (path) {
      return `🔎 ${pattern} in ${path}`;
    }
    return `🔎 ${pattern}`;
  },

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => !!response,

  renderButton: (
    _args: ToolArgs,
    _showDetails: boolean,
    _setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    if (!response) return null;
    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {setShowResult && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
            style={getButtonStyle(showResult ?? false)}
          >
            {showResult ? 'Hide' : 'Files'}
          </button>
        )}
      </div>
    );
  },

  renderContent: (
    _args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse
  ) => {
    if (!showResult || !response) return null;

    let filenames: string[] = [];
    let metadata: { durationMs?: number; numFiles?: number; truncated?: boolean } | null = null;
    let displayContent = response.error || response.output;

    if (!response.error && response.output) {
      try {
        const parsed = JSON.parse(response.output);
        if (parsed.filenames && Array.isArray(parsed.filenames)) {
          filenames = parsed.filenames;
          metadata = {
            durationMs: parsed.durationMs,
            numFiles: parsed.numFiles,
            truncated: parsed.truncated,
          };
        }
      } catch {
        // Not JSON, use as-is
      }
    }

    return (
      <div
        style={{
          ...contentContainerStyle,
          border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
          maxHeight: '300px',
          overflow: 'auto',
        }}
      >
        {metadata && (
          <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
            📊 Found {metadata.numFiles} files in {metadata.durationMs}ms
            {metadata.truncated && <span style={{ color: 'var(--warning)' }}> (truncated)</span>}
          </div>
        )}
        {filenames.length > 0 ? (
          <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: '1.4' }}>
            {filenames.map((file, idx) => {
              const segments = file.split(/[/\\]/);
              const displayPath = segments.length > 3
                ? '.../' + segments.slice(-3).join('/')
                : file;
              return (
                <div key={idx} style={{ color: 'var(--text-primary)' }}>
                  📄 {displayPath}
                </div>
              );
            })}
          </div>
        ) : (
          <pre style={{ ...codeStyle, color: response.error ? 'var(--error)' : 'var(--text-primary)' }}>
            {displayContent}
          </pre>
        )}
      </div>
    );
  },
};

// ============================================
// Grep Tool Renderer
// ============================================

export const grepRenderer: ToolConfig = {
  icon: <SearchIcon />,

  getInlineText: (args: ToolArgs): string => {
    const pattern = String(args.pattern || '');
    const truncated = pattern.length > 30 ? pattern.substring(0, 30) + '...' : pattern;
    return `🔍 "${truncated}"`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.pattern || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    const hasArgs = !!args.pattern;
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
            {showResult ? 'Hide' : 'Matches'}
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

    if (args.pattern) {
      elements.push(
        <div key="details" style={contentContainerStyle}>
          <div style={{ marginBottom: args.path ? '0.25rem' : 0 }}>
            <span style={{ color: 'var(--text-secondary)' }}>🔍 Pattern: </span>
            <code style={{ color: 'var(--warning)', backgroundColor: 'var(--bg-secondary)', padding: '0.125rem 0.25rem', borderRadius: '2px' }}>
              {String(args.pattern)}
            </code>
          </div>
          {!!args.path && (
            <div style={{ marginBottom: args.glob ? '0.25rem' : 0 }}>
              <span style={{ color: 'var(--text-secondary)' }}>📂 In: </span>
              <span style={{ color: 'var(--text-primary)' }}>{String(args.path)}</span>
            </div>
          )}
          {!!args.glob && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>📁 Filter: </span>
              <code style={{ color: 'var(--text-primary)' }}>{String(args.glob)}</code>
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
            border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
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
// LS Tool Renderer
// ============================================

export const lsRenderer: ToolConfig = {
  icon: <FolderIcon />,

  getInlineText: (args: ToolArgs): string => {
    const path = String(args.path || '.');
    const dirName = path.split(/[/\\]/).pop() || path;
    return `📂 ${dirName}`;
  },

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => !!response,

  renderButton: (
    _args: ToolArgs,
    _showDetails: boolean,
    _setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    if (!response) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (setShowResult) setShowResult(!showResult); }}
        style={getButtonStyle(showResult ?? false)}
      >
        {showResult ? 'Hide' : 'Contents'}
      </button>
    );
  },

  renderContent: (
    _args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse
  ) => {
    if (!showResult || !response) return null;
    return (
      <div
        style={{
          ...contentContainerStyle,
          border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
          maxHeight: '300px',
          overflow: 'auto',
        }}
      >
        <pre style={{ ...codeStyle, color: response.error ? 'var(--error)' : 'var(--text-primary)' }}>
          {response.error || response.output}
        </pre>
      </div>
    );
  },
};
