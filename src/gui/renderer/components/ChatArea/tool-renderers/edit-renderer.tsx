/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Edit Tool Renderer - File edit with diff view
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

// ============================================
// Diff View Components
// ============================================

/**
 * Diff line type for edit tool display
 */
type DiffLineType = 'unchanged' | 'added' | 'removed';

interface DiffLine {
  type: DiffLineType;
  content: string;
}

/**
 * Simple LCS-based diff algorithm for computing line differences
 */
function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const result: DiffLine[] = [];
  let i = m, j = n;

  const tempResult: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      tempResult.push({ type: 'unchanged', content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempResult.push({ type: 'added', content: newLines[j - 1] });
      j--;
    } else {
      tempResult.push({ type: 'removed', content: oldLines[i - 1] });
      i--;
    }
  }

  // Reverse to get correct order
  for (let k = tempResult.length - 1; k >= 0; k--) {
    result.push(tempResult[k]);
  }

  return result;
}

/**
 * Render diff lines with appropriate colors
 */
function renderDiffLines(diffLines: DiffLine[]): ReactNode {
  return (
    <pre style={{ margin: 0, padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}>
      {diffLines.map((line, idx) => {
        let bgColor = 'transparent';
        let textColor = 'inherit';
        let prefix = ' ';

        if (line.type === 'added') {
          bgColor = 'rgba(16,185,129,0.2)';
          textColor = '#059669';
          prefix = '+';
        } else if (line.type === 'removed') {
          bgColor = 'rgba(239,68,68,0.2)';
          textColor = '#dc2626';
          prefix = '-';
        }

        return (
          <div
            key={idx}
            style={{
              backgroundColor: bgColor,
              color: textColor,
              padding: '0 0.25rem',
              marginLeft: '-0.25rem',
              marginRight: '-0.25rem',
            }}
          >
            <span style={{ opacity: 0.6, marginRight: '0.5rem' }}>{prefix}</span>
            {line.content}
          </div>
        );
      })}
    </pre>
  );
}

/**
 * Side-by-side diff view component
 */
function SideBySideDiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const diffLines = computeDiff(oldStr, newStr);

  // Build aligned lines for side-by-side view
  const leftLines: Array<{ content: string; type: 'unchanged' | 'removed' | 'empty' }> = [];
  const rightLines: Array<{ content: string; type: 'unchanged' | 'added' | 'empty' }> = [];

  for (const line of diffLines) {
    if (line.type === 'unchanged') {
      leftLines.push({ content: line.content, type: 'unchanged' });
      rightLines.push({ content: line.content, type: 'unchanged' });
    } else if (line.type === 'removed') {
      leftLines.push({ content: line.content, type: 'removed' });
      rightLines.push({ content: '', type: 'empty' });
    } else if (line.type === 'added') {
      leftLines.push({ content: '', type: 'empty' });
      rightLines.push({ content: line.content, type: 'added' });
    }
  }

  const lineStyle: React.CSSProperties = {
    padding: '0 0.25rem',
    minHeight: '1.2em',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', lineHeight: '1.5' }}>
      {/* Left panel - Original */}
      <div style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', padding: '0.5rem', border: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem', fontWeight: 500 }}>Original</div>
        <pre style={{ margin: 0 }}>
          {leftLines.map((line, idx) => {
            let bgColor = 'transparent';
            let textColor = 'inherit';
            if (line.type === 'removed') {
              bgColor = 'rgba(239,68,68,0.2)';
              textColor = '#dc2626';
            } else if (line.type === 'empty') {
              bgColor = 'rgba(128,128,128,0.1)';
            }
            return (
              <div key={idx} style={{ ...lineStyle, backgroundColor: bgColor, color: textColor }}>
                {line.content || '\u00A0'}
              </div>
            );
          })}
        </pre>
      </div>
      {/* Right panel - Modified */}
      <div style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', padding: '0.5rem', border: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem', fontWeight: 500 }}>Modified</div>
        <pre style={{ margin: 0 }}>
          {rightLines.map((line, idx) => {
            let bgColor = 'transparent';
            let textColor = 'inherit';
            if (line.type === 'added') {
              bgColor = 'rgba(16,185,129,0.2)';
              textColor = '#059669';
            } else if (line.type === 'empty') {
              bgColor = 'rgba(128,128,128,0.1)';
            }
            return (
              <div key={idx} style={{ ...lineStyle, backgroundColor: bgColor, color: textColor }}>
                {line.content || '\u00A0'}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

const DIFF_VIEW_MODE_KEY = 'claude-pilot-diff-view-mode';

/**
 * Edit diff view component with toggle between unified and side-by-side views
 */
function EditDiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const [viewMode, setViewMode] = useState<'unified' | 'sideBySide'>(() => {
    const saved = localStorage.getItem(DIFF_VIEW_MODE_KEY);
    return saved === 'sideBySide' ? 'sideBySide' : 'unified';
  });

  const handleViewModeChange = (mode: 'unified' | 'sideBySide') => {
    setViewMode(mode);
    localStorage.setItem(DIFF_VIEW_MODE_KEY, mode);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
        <button
          onClick={() => handleViewModeChange('unified')}
          style={{
            padding: '0.125rem 0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            backgroundColor: viewMode === 'unified' ? 'var(--accent)' : 'var(--bg-secondary)',
            color: viewMode === 'unified' ? '#ffffff' : 'var(--text-secondary)',
            fontSize: '0.65rem',
            cursor: 'pointer',
          }}
        >
          Unified
        </button>
        <button
          onClick={() => handleViewModeChange('sideBySide')}
          style={{
            padding: '0.125rem 0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            backgroundColor: viewMode === 'sideBySide' ? 'var(--accent)' : 'var(--bg-secondary)',
            color: viewMode === 'sideBySide' ? '#ffffff' : 'var(--text-secondary)',
            fontSize: '0.65rem',
            cursor: 'pointer',
          }}
        >
          Side by Side
        </button>
      </div>
      {viewMode === 'unified' ? (
        renderDiffLines(computeDiff(oldStr, newStr))
      ) : (
        <SideBySideDiffView oldStr={oldStr} newStr={newStr} />
      )}
    </div>
  );
}

// ============================================
// Edit Icon
// ============================================

export function EditIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: '#f59e0b' }}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ============================================
// Edit Tool Renderer
// ============================================

export const editRenderer: ToolConfig = {
  icon: <EditIcon />,

  getInlineText: (args: ToolArgs): string => {
    const path = String(args.file_path || '');
    const fileName = path.split(/[/\\]/).pop() || path;
    const oldStr = typeof args.old_string === 'string' ? args.old_string : '';
    const newStr = typeof args.new_string === 'string' ? args.new_string : '';
    const oldLines = oldStr ? oldStr.split('\n').length : 0;
    const newLines = newStr ? newStr.split('\n').length : 0;
    const addedLines = Math.max(0, newLines - oldLines);
    const removedLines = Math.max(0, oldLines - newLines);
    const diffParts: string[] = [];
    if (addedLines > 0) diffParts.push(`+${addedLines}`);
    if (removedLines > 0) diffParts.push(`-${removedLines}`);
    const diffStr = diffParts.length > 0 ? diffParts.join('/') : '±0';
    return `✏️ ${fileName} (${diffStr} lines)`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.file_path || !!response;
  },

  defaultExpanded: true,

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
            {showDetails ? 'Hide' : 'Diff'}
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
      elements.push(
        <div
          key="details"
          style={{
            ...contentContainerStyle,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📄 File: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.file_path)}</span>
            {!!args.replace_all && (
              <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.7rem' }}>(replace all)</span>
            )}
          </div>
          {(args.old_string !== undefined || args.new_string !== undefined) && (
            <div>
              <EditDiffView oldStr={String(args.old_string || '')} newStr={String(args.new_string || '')} />
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
          <span style={{ color: response.error ? '#ef4444' : '#10b981' }}>
            {response.error ? `❌ ${response.error}` : '✅ Edit applied successfully'}
          </span>
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};
