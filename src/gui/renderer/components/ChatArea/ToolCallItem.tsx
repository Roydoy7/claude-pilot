/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ToolCallItem Component - Standalone tool call display item
 * Displays tool calls as independent items in the message list
 * Features: No avatar, left indentation
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { ReactNode } from 'react';
import type { MessageListItem, ToolResponse, ToolProgressEntry } from '../../../preload/preload-types';
import { useLanguage } from '../../i18n/LanguageContext';

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

interface ToolCallItemProps {
  item: MessageListItem;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string, reason?: string) => void;
}

/**
 * Tool display configuration
 */
interface ToolConfig {
  icon: string | ReactNode; // Support both emoji string and SVG ReactNode
  getInlineText: (args: Record<string, any>) => string;
  hasDetails: (args: Record<string, any>, response?: ToolResponse) => boolean;
  defaultExpanded?: boolean; // If true, details are shown by default
  renderButton: (
    args: Record<string, any>,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => ReactNode;
  renderContent: (args: Record<string, any>, showResult?: boolean, response?: ToolResponse) => ReactNode;
}

/**
 * SVG Icons for tools
 */
const PdfIcon = () => (
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
    <path d="M10 12h4" />
    <path d="M10 16h4" />
  </svg>
);

const DocumentConvertIcon = () => (
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
    <path d="M9 15l3-3 3 3" />
    <path d="M12 12v6" />
  </svg>
);

const WordDocIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#2b579a"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="8" y="17" fontSize="7" fontWeight="bold" fill="#2b579a" stroke="none">W</text>
  </svg>
);

const FolderIcon = () => (
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

const FileTextIcon = () => (
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

const EditIcon = () => (
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
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const SearchIcon = () => (
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

const GlobIcon = () => (
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

const WriteIcon = () => (
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

/**
 * Tool configurations registry
 */
const TOOL_CONFIGS: Record<string, ToolConfig> = {
  python: {
    icon: '🐍',
    getInlineText: (args) => {
      const parts: string[] = [];

      // Show description if available (primary info)
      if (args.description) {
        const desc = args.description.length > 50
          ? `${args.description.substring(0, 50)}...`
          : args.description;
        parts.push(desc);
      } else if (args.code) {
        // Fallback to code preview if no description
        const firstLine = args.code.split('\n')[0].trim();
        const codePreview = firstLine.length > 40 ? `${firstLine.substring(0, 40)}...` : firstLine;
        parts.push(codePreview);
      }

      // Show workspace count
      if (args.workspaces && Array.isArray(args.workspaces) && args.workspaces.length > 0) {
        parts.push(`📂 ${args.workspaces.length} workspace${args.workspaces.length !== 1 ? 's' : ''}`);
      }

      if (args.requirements && Array.isArray(args.requirements) && args.requirements.length > 0) {
        const pkgCount = args.requirements.length;
        parts.push(`📦 ${pkgCount} pkg${pkgCount !== 1 ? 's' : ''}`);
      }

      return parts.join(' • ');
    },
    hasDetails: (args, response) => !!args.code || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasCode = !!args.code;
      const hasResponse = !!response;

      if (!hasCode && !hasResponse) return null;

      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasCode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(!showDetails);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide Code' : 'Show Code'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowResult(!showResult);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide Result' : 'Show Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      // When showResult is false, show code; when showResult is true, show result
      if (!showResult) {
        // Show code block
        if (!args.code) return null;
        return (
          <div
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            {args.description && (
              <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.7rem' }}>
                📋 {args.description}
              </div>
            )}
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#3b82f6', fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace", fontSize: '0.7rem', lineHeight: '1.4' }}>
              {args.code}
            </pre>
            {args.requirements && Array.isArray(args.requirements) && args.requirements.length > 0 && (
              <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.7rem' }}>
                📦 Dependencies: {args.requirements.join(', ')}
              </div>
            )}
          </div>
        );
      }

      // Show result
      if (!response) return null;

      let displayOutput = '';
      const isError = !!response.error;

      if (response.error) {
        displayOutput = response.error;
      } else if (response.output) {
        // MCP tool returns JSON array like [{"type":"text","text":"..."}]
        try {
          const parsed = JSON.parse(response.output);
          if (Array.isArray(parsed)) {
            // Extract text from MCP content array
            displayOutput = parsed
              .filter((item: { type?: string }) => item.type === 'text')
              .map((item: { text?: string }) => item.text || '')
              .join('\n');
          } else if (typeof parsed === 'object' && parsed !== null) {
            // Handle other object formats
            if (parsed.text) {
              displayOutput = parsed.text;
            } else if (parsed.stdout !== undefined) {
              displayOutput = parsed.stdout || '(no output)';
            } else {
              displayOutput = JSON.stringify(parsed, null, 2);
            }
          } else {
            displayOutput = response.output;
          }
        } catch {
          // Not JSON, use as-is
          displayOutput = response.output;
        }
      }

      if (!displayOutput) {
        displayOutput = '(no output)';
      }

      return (
        <div
          style={{
            marginLeft: '1.5rem',
            marginBottom: '0.5rem',
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '4px',
            border: isError ? '1px solid #ef4444' : '1px solid var(--border)',
            fontSize: '0.75rem',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: isError ? '#ef4444' : 'var(--text-primary)', fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace", fontSize: '0.7rem', lineHeight: '1.4' }}>
            {displayOutput}
          </pre>
        </div>
      );
    },
  },
  pdf: {
    icon: <PdfIcon />,
    getInlineText: (args) => {
      const op = args.operation || '';
      const file = args.file || '';
      const fileName = file.split(/[/\\]/).pop() || file;

      // Operation-specific inline text
      const opEmoji: Record<string, string> = {
        create: '✏️',
        info: 'ℹ️',
        extracttext: '📝',
        search: '🔍',
        merge: '🔗',
        split: '✂️',
      };

      const emoji = opEmoji[op] || '📄';

      if (op === 'search' && args.query) {
        return `${emoji} ${op}: "${args.query}" in ${fileName}`;
      }
      if (op === 'merge' && args.sources) {
        return `${emoji} ${op}: ${args.sources.length} files`;
      }
      if (op === 'split' && args.pages) {
        return `${emoji} ${op}: pages ${args.pages} from ${fileName}`;
      }
      if (op && fileName) {
        return `${emoji} ${op}: ${fileName}`;
      }
      return op || fileName || '';
    },
    hasDetails: (args, response) => !!args.operation || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.operation;
      const hasResponse = !!response;

      if (!hasArgs && !hasResponse) return null;

      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(!showDetails);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowResult(!showResult);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide Result' : 'Show Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];

      // Show args details
      if (args.operation) {
        const detailItems: Array<{ label: string; value: string; icon: string }> = [];

        if (args.file) {
          detailItems.push({ label: 'File', value: args.file, icon: '📁' });
        }
        if (args.pages) {
          detailItems.push({ label: 'Pages', value: args.pages, icon: '📑' });
        }
        if (args.query) {
          detailItems.push({ label: 'Query', value: args.query, icon: '🔍' });
        }
        if (args.output) {
          detailItems.push({ label: 'Output', value: args.output, icon: '💾' });
        }
        if (args.sources && Array.isArray(args.sources)) {
          detailItems.push({ label: 'Sources', value: args.sources.join(', '), icon: '📚' });
        }
        if (args.content) {
          const preview = args.content.length > 100 ? args.content.substring(0, 100) + '...' : args.content;
          detailItems.push({ label: 'Content', value: preview, icon: '📝' });
        }

        if (detailItems.length > 0) {
          elements.push(
            <div
              key="details"
              style={{
                marginLeft: '1.5rem',
                marginBottom: '0.5rem',
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                fontSize: '0.75rem',
              }}
            >
              {detailItems.map((item, idx) => (
                <div key={idx} style={{ marginBottom: idx < detailItems.length - 1 ? '0.25rem' : 0 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.icon} {item.label}: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          );
        }
      }

      // Show result if requested
      if (showResult && response) {
        elements.push(
          <div
            key="result"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {response.error ? (
              <div style={{ color: '#ef4444' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>❌ Error:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {response.error}
                </pre>
              </div>
            ) : (
              <div style={{ color: 'var(--text-primary)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#10b981' }}>✅ Result:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {response.output}
                </pre>
              </div>
            )}
          </div>
        );
      }

      return elements.length > 0 ? <>{elements}</> : null;
    },
  },
  markitdown: {
    icon: <DocumentConvertIcon />,
    getInlineText: (args) => {
      const file = args.filePath || '';
      const fileName = file.split(/[/\\]/).pop() || file;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      // Format-specific emoji
      const formatEmoji: Record<string, string> = {
        pdf: '📕',
        docx: '📘',
        pptx: '📙',
        xlsx: '📗',
        html: '🌐',
        htm: '🌐',
        xml: '📋',
        zip: '📦',
      };

      const emoji = formatEmoji[ext] || '📄';
      return `${emoji} ${fileName} → Markdown`;
    },
    hasDetails: (args, response) => !!args.filePath || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.filePath;
      const hasResponse = !!response;

      if (!hasArgs && !hasResponse) return null;

      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(!showDetails);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowResult(!showResult);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide Result' : 'Show Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];

      // Show conversion details
      if (args.filePath) {
        const file = args.filePath;
        const fileName = file.split(/[/\\]/).pop() || file;
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        const formatNames: Record<string, string> = {
          pdf: 'PDF Document',
          docx: 'Word Document',
          pptx: 'PowerPoint',
          xlsx: 'Excel Spreadsheet',
          html: 'HTML Page',
          htm: 'HTML Page',
          xml: 'XML Document',
          zip: 'ZIP Archive',
        };

        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📁 Input: </span>
              <span style={{ color: 'var(--text-primary)' }}>{file}</span>
            </div>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📋 Format: </span>
              <span style={{ color: 'var(--text-primary)' }}>{formatNames[ext] || ext.toUpperCase()}</span>
            </div>
            {args.outputPath && (
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>💾 Output: </span>
                <span style={{ color: 'var(--text-primary)' }}>{args.outputPath}</span>
              </div>
            )}
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>📤 Return Content: </span>
              <span style={{ color: 'var(--text-primary)' }}>{args.returnContent !== false ? 'Yes' : 'No'}</span>
            </div>
          </div>
        );
      }

      // Show result if requested
      if (showResult && response) {
        elements.push(
          <div
            key="result"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {response.error ? (
              <div style={{ color: '#ef4444' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>❌ Conversion Failed:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {response.error}
                </pre>
              </div>
            ) : (
              <div style={{ color: 'var(--text-primary)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#10b981' }}>✅ Conversion Complete:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {response.output}
                </pre>
              </div>
            )}
          </div>
        );
      }

      return elements.length > 0 ? <>{elements}</> : null;
    },
  },
  markdown_to_word: {
    icon: <WordDocIcon />,
    getInlineText: (args) => {
      const output = args.outputPath || '';
      const outputName = output.split(/[/\\]/).pop() || output;
      const template = args.template || 'default';

      // Template emoji
      const templateEmoji: Record<string, string> = {
        default: '📄',
        professional: '💼',
        academic: '🎓',
        casual: '✏️',
      };

      const emoji = templateEmoji[template] || '📄';

      if (args.markdownFile) {
        const inputName = args.markdownFile.split(/[/\\]/).pop() || args.markdownFile;
        return `${emoji} ${inputName} → ${outputName}`;
      }
      return `${emoji} Markdown → ${outputName}`;
    },
    hasDetails: (args, response) => !!args.outputPath || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.outputPath;
      const hasResponse = !!response;

      if (!hasArgs && !hasResponse) return null;

      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(!showDetails);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowResult(!showResult);
              }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide Result' : 'Show Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];

      // Show conversion details
      if (args.outputPath) {
        const template = args.template || 'default';
        const templateNames: Record<string, string> = {
          default: 'Default (Calibri 12pt)',
          professional: 'Professional (Arial 11pt)',
          academic: 'Academic (Times New Roman 12pt)',
          casual: 'Casual (Calibri 11pt)',
        };

        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid #2b579a33',
              fontSize: '0.75rem',
            }}
          >
            {args.markdownFile && (
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>📥 Source: </span>
                <span style={{ color: 'var(--text-primary)' }}>{args.markdownFile}</span>
              </div>
            )}
            {args.markdown && (
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>📝 Content: </span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {args.markdown.length > 50 ? `${args.markdown.substring(0, 50)}...` : args.markdown}
                </span>
              </div>
            )}
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📤 Output: </span>
              <span style={{ color: 'var(--text-primary)' }}>{args.outputPath}</span>
            </div>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>🎨 Template: </span>
              <span style={{ color: '#2b579a' }}>{templateNames[template] || template}</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <span>
                <span style={{ color: 'var(--text-secondary)' }}>📑 TOC: </span>
                <span style={{ color: args.includeTableOfContents ? '#10b981' : 'var(--text-secondary)' }}>
                  {args.includeTableOfContents ? '✓ Yes' : 'No'}
                </span>
              </span>
              <span>
                <span style={{ color: 'var(--text-secondary)' }}>🔢 Page #: </span>
                <span style={{ color: args.includePageNumbers !== false ? '#10b981' : 'var(--text-secondary)' }}>
                  {args.includePageNumbers !== false ? '✓ Yes' : 'No'}
                </span>
              </span>
            </div>
          </div>
        );
      }

      // Show result if requested
      if (showResult && response) {
        elements.push(
          <div
            key="result"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid #2b579a',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {response.error ? (
              <div style={{ color: '#ef4444' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>❌ Conversion Failed:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {response.error}
                </pre>
              </div>
            ) : (
              <div style={{ color: 'var(--text-primary)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#2b579a' }}>📘 Word Document Created:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {response.output}
                </pre>
              </div>
            )}
          </div>
        );
      }

      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  // ============================================
  // Claude Agent SDK Tools (PascalCase naming)
  // ============================================

  Read: {
    icon: <FileTextIcon />,
    getInlineText: (args) => {
      const path = args.file_path || '';
      if (args.offset !== undefined || args.limit !== undefined) {
        const range = args.offset && args.limit
          ? `L${args.offset}-${args.offset + args.limit}`
          : args.limit ? `first ${args.limit} lines` : `from L${args.offset}`;
        return `📄 ${path} (${range})`;
      }
      return `📄 ${path}`;
    },
    hasDetails: (_args, response) => !!response,
    renderButton: (_args, _showDetails, _setShowDetails, response, showResult, setShowResult) => {
      const hasResponse = !!response;
      if (!hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Content'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (_args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (showResult && response) {
        // Parse structured toolUseResult if available
        let displayContent = response.error || response.output;
        let fileInfo: { numLines?: number; startLine?: number; totalLines?: number } | null = null;

        if (!response.error && response.output) {
          try {
            const parsed = JSON.parse(response.output);
            // SDK Read tool returns: { type: "text", file: { filePath, content, numLines, ... } }
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

        elements.push(
          <div
            key="result"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {fileInfo && (
              <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                📊 Lines {fileInfo.startLine}-{(fileInfo.startLine || 1) + (fileInfo.numLines || 0) - 1} of {fileInfo.totalLines}
              </div>
            )}
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: '1.4' }}>
              {displayContent}
            </pre>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  Edit: {
    icon: <EditIcon />,
    getInlineText: (args) => {
      const path = args.file_path || '';
      const fileName = path.split(/[/\\]/).pop() || path;
      // Count lines instead of characters
      const oldLines = args.old_string ? args.old_string.split('\n').length : 0;
      const newLines = args.new_string ? args.new_string.split('\n').length : 0;
      const addedLines = Math.max(0, newLines - oldLines);
      const removedLines = Math.max(0, oldLines - newLines);
      // Show +N/-M format
      const diffParts: string[] = [];
      if (addedLines > 0) diffParts.push(`+${addedLines}`);
      if (removedLines > 0) diffParts.push(`-${removedLines}`);
      const diffStr = diffParts.length > 0 ? diffParts.join('/') : '±0';
      return `✏️ ${fileName} (${diffStr} lines)`;
    },
    hasDetails: (args, response) => !!args.file_path || !!response,
    defaultExpanded: true, // Show diff by default
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.file_path;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Diff'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.file_path) {
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📄 File: </span>
              <span style={{ color: 'var(--text-primary)' }}>{args.file_path}</span>
              {args.replace_all && (
                <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.7rem' }}>(replace all)</span>
              )}
            </div>
            {(args.old_string !== undefined || args.new_string !== undefined) && (
              <div>
                {renderDiffLines(computeDiff(args.old_string || '', args.new_string || ''))}
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid #10b981',
              fontSize: '0.75rem',
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
  },

  Write: {
    icon: <WriteIcon />,
    getInlineText: (args) => {
      const path = args.file_path || '';
      const fileName = path.split(/[/\\]/).pop() || path;
      const contentLen = args.content?.length || 0;
      return `✍️ ${fileName} (${contentLen} chars)`;
    },
    hasDetails: (args, response) => !!args.file_path || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.file_path;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Preview'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.file_path) {
        // Show full content without truncation
        const content = args.content || null;
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid #10b981',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: content ? '0.25rem' : 0 }}>
              <span style={{ color: 'var(--text-secondary)' }}>📝 Creating: </span>
              <span style={{ color: 'var(--text-primary)' }}>{args.file_path}</span>
            </div>
            {content && (
              <div style={{ marginTop: '0.5rem' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)', fontSize: '0.7rem', fontFamily: 'monospace', maxHeight: '400px', overflow: 'auto' }}>
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid #10b981',
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: response.error ? '#ef4444' : '#10b981' }}>
              {response.error ? `❌ ${response.error}` : '✅ File created successfully'}
            </span>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  Bash: {
    icon: '⚡',
    getInlineText: (args) => {
      const cmd = args.command || '';
      return `$ ${cmd}`;
    },
    hasDetails: (_args, response) => !!response,
    renderButton: (_args, _showDetails, _setShowDetails, response, showResult, setShowResult) => {
      const hasResponse = !!response;
      if (!hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Output'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (_args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (showResult && response) {
        // Parse SDK Bash result: { stdout, stderr, interrupted, isImage }
        let displayOutput = response.error || response.output;
        let hasStderr = false;
        let stderrContent = '';
        let wasInterrupted = false;
        const isError = !!response.error;

        if (!response.error && response.output) {
          try {
            const parsed = JSON.parse(response.output);
            if (typeof parsed === 'object' && parsed !== null) {
              // Extract stdout
              if (parsed.stdout !== undefined) {
                displayOutput = parsed.stdout || '(no output)';
              }
              // Extract stderr
              if (parsed.stderr && parsed.stderr.trim()) {
                hasStderr = true;
                stderrContent = parsed.stderr;
              }
              // Check if interrupted
              if (parsed.interrupted) {
                wasInterrupted = true;
              }
            }
          } catch {
            // Not JSON, use as-is
          }
        }

        elements.push(
          <div
            key="result"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: isError ? '1px solid #ef4444' : wasInterrupted ? '1px solid #f59e0b' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {wasInterrupted && (
              <div style={{ color: '#f59e0b', fontSize: '0.65rem', marginBottom: '0.5rem' }}>
                ⚠️ Command was interrupted
              </div>
            )}
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: isError ? '#ef4444' : 'var(--text-primary)', fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace", fontSize: '0.7rem', lineHeight: '1.4' }}>
              {displayOutput}
            </pre>
            {hasStderr && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ color: '#f59e0b', fontSize: '0.65rem', marginBottom: '0.25rem' }}>stderr:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#f59e0b', fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace", fontSize: '0.7rem', lineHeight: '1.4', opacity: 0.8 }}>
                  {stderrContent}
                </pre>
              </div>
            )}
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  Glob: {
    icon: <GlobIcon />,
    getInlineText: (args) => {
      const pattern = args.pattern || '';
      const path = args.path || '';
      if (path) {
        return `🔎 ${pattern} in ${path}`;
      }
      return `🔎 ${pattern}`;
    },
    hasDetails: (_args, response) => !!response,
    renderButton: (_args, _showDetails, _setShowDetails, response, showResult, setShowResult) => {
      const hasResponse = !!response;
      if (!hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Files'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (_args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (showResult && response) {
        // Parse structured toolUseResult if available
        let filenames: string[] = [];
        let metadata: { durationMs?: number; numFiles?: number; truncated?: boolean } | null = null;
        let displayContent = response.error || response.output;

        if (!response.error && response.output) {
          try {
            const parsed = JSON.parse(response.output);
            // SDK Glob tool returns: { filenames: [...], durationMs, numFiles, truncated }
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

        elements.push(
          <div
            key="result"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {metadata && (
              <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                📊 Found {metadata.numFiles} files in {metadata.durationMs}ms
                {metadata.truncated && <span style={{ color: '#f59e0b' }}> (truncated)</span>}
              </div>
            )}
            {filenames.length > 0 ? (
              <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: '1.4' }}>
                {filenames.map((file, idx) => {
                  // Show last 2-3 path segments for context (avoid showing just filename which can be duplicate)
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
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace' }}>
                {displayContent}
              </pre>
            )}
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  Grep: {
    icon: <SearchIcon />,
    getInlineText: (args) => {
      const pattern = args.pattern || '';
      const truncated = pattern.length > 30 ? pattern.substring(0, 30) + '...' : pattern;
      return `🔍 "${truncated}"`;
    },
    hasDetails: (args, response) => !!args.pattern || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.pattern;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Details'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Matches'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.pattern) {
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: args.path ? '0.25rem' : 0 }}>
              <span style={{ color: 'var(--text-secondary)' }}>🔍 Pattern: </span>
              <code style={{ color: '#f59e0b', backgroundColor: 'var(--bg-secondary)', padding: '0.125rem 0.25rem', borderRadius: '2px' }}>{args.pattern}</code>
            </div>
            {args.path && (
              <div style={{ marginBottom: args.glob ? '0.25rem' : 0 }}>
                <span style={{ color: 'var(--text-secondary)' }}>📂 In: </span>
                <span style={{ color: 'var(--text-primary)' }}>{args.path}</span>
              </div>
            )}
            {args.glob && (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>📁 Filter: </span>
                <code style={{ color: 'var(--text-primary)' }}>{args.glob}</code>
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace' }}>
              {response.error || response.output}
            </pre>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  LS: {
    icon: <FolderIcon />,
    getInlineText: (args) => {
      const path = args.path || '.';
      const dirName = path.split(/[/\\]/).pop() || path;
      return `📂 ${dirName}`;
    },
    hasDetails: (_args, response) => !!response,
    renderButton: (_args, _showDetails, _setShowDetails, response, showResult, setShowResult) => {
      if (!response) return null;
      return (
        <button
          onClick={(e) => { e.stopPropagation(); if (setShowResult) setShowResult(!showResult); }}
          style={{
            padding: '0.125rem 0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
            color: showResult ? '#ffffff' : 'var(--text-secondary)',
            fontSize: '0.7rem',
            cursor: 'pointer',
          }}
        >
          {showResult ? 'Hide' : 'Contents'}
        </button>
      );
    },
    renderContent: (_args, showResult, response) => {
      if (!showResult || !response) return null;
      return (
        <div
          style={{
            marginLeft: '1.5rem',
            marginBottom: '0.5rem',
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '4px',
            border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
            fontSize: '0.75rem',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace' }}>
            {response.error || response.output}
          </pre>
        </div>
      );
    },
  },

  Task: {
    icon: '🤖',
    getInlineText: (args) => {
      const desc = args.description || '';
      const agentType = args.subagent_type || '';
      if (desc) return `${agentType ? `[${agentType}] ` : ''}${desc}`;
      return agentType || 'Sub-agent task';
    },
    hasDetails: (args, response) => !!args.prompt || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasPrompt = !!args.prompt;
      const hasResponse = !!response;
      if (!hasPrompt && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasPrompt && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Prompt'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.prompt) {
        const promptPreview = args.prompt.length > 500 ? args.prompt.substring(0, 500) + '...' : args.prompt;
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            {args.subagent_type && (
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🤖 Agent: </span>
                <span style={{ color: '#3b82f6', fontWeight: '500' }}>{args.subagent_type}</span>
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace' }}>
              {response.error || response.output}
            </pre>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  WebFetch: {
    icon: '🌐',
    getInlineText: (args) => {
      const url = args.url || '';
      try {
        const hostname = new URL(url).hostname;
        return `🌐 ${hostname}`;
      } catch {
        return `🌐 ${url.substring(0, 30)}${url.length > 30 ? '...' : ''}`;
      }
    },
    hasDetails: (args, response) => !!args.url || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.url;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'URL'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Content'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.url) {
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: args.prompt ? '0.25rem' : 0 }}>
              <span style={{ color: 'var(--text-secondary)' }}>🔗 URL: </span>
              <a href={args.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                {args.url}
              </a>
            </div>
            {args.prompt && (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>💬 Prompt: </span>
                <span style={{ color: 'var(--text-primary)' }}>{args.prompt}</span>
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace' }}>
              {response.error || response.output}
            </pre>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  WebSearch: {
    icon: '🔎',
    getInlineText: (args) => {
      const query = args.query || '';
      const truncated = query.length > 40 ? query.substring(0, 40) + '...' : query;
      return `🔎 "${truncated}"`;
    },
    hasDetails: (args, response) => !!args.query || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.query;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (args.allowed_domains || args.blocked_domains) && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Filters'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Results'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.allowed_domains || args.blocked_domains) {
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            {args.allowed_domains && (
              <div style={{ marginBottom: args.blocked_domains ? '0.25rem' : 0 }}>
                <span style={{ color: 'var(--text-secondary)' }}>✅ Only: </span>
                <span style={{ color: '#10b981' }}>{args.allowed_domains.join(', ')}</span>
              </div>
            )}
            {args.blocked_domains && (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>🚫 Exclude: </span>
                <span style={{ color: '#ef4444' }}>{args.blocked_domains.join(', ')}</span>
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
              fontSize: '0.75rem',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: response.error ? '#ef4444' : 'var(--text-primary)', fontFamily: 'monospace' }}>
              {response.error || response.output}
            </pre>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  TodoWrite: {
    icon: '📋',
    getInlineText: (args) => {
      if (!args.todos || !Array.isArray(args.todos)) return '';
      const completed = args.todos.filter((t: { status: string }) => t.status === 'completed').length;
      const inProgress = args.todos.filter((t: { status: string }) => t.status === 'in_progress').length;
      return `${args.todos.length} tasks (${completed}✓ ${inProgress}→)`;
    },
    hasDetails: (args) => args.todos && Array.isArray(args.todos) && args.todos.length > 0,
    defaultExpanded: true, // Show tasks by default
    renderButton: (args, showDetails, setShowDetails) => {
      if (!args.todos || args.todos.length === 0) return null;
      return (
        <button
          onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
          style={{
            padding: '0.125rem 0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
            color: showDetails ? '#ffffff' : 'var(--text-secondary)',
            fontSize: '0.7rem',
            cursor: 'pointer',
          }}
        >
          {showDetails ? 'Hide Tasks' : 'Show Tasks'}
        </button>
      );
    },
    renderContent: (args) => {
      if (!args.todos || args.todos.length === 0) return null;
      return (
        <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {args.todos.map((todo: { status: string; content: string; activeForm?: string }, index: number) => {
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
                    <span style={{ color: 'var(--text-primary)', flex: 1, textDecoration: todo.status === 'completed' ? 'line-through' : 'none', opacity: todo.status === 'completed' ? 0.7 : 1 }}>
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
  },

  MultiEdit: {
    icon: <EditIcon />,
    getInlineText: (args) => {
      const path = args.file_path || '';
      const fileName = path.split(/[/\\]/).pop() || path;
      const editsCount = args.edits?.length || 0;
      return `✏️ ${fileName} (${editsCount} edits)`;
    },
    hasDetails: (args, response) => !!args.file_path || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.file_path;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Edits'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.file_path && args.edits) {
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📄 File: </span>
              <span style={{ color: 'var(--text-primary)' }}>{args.file_path}</span>
            </div>
            {args.edits.map((edit: { old_string: string; new_string: string }, idx: number) => (
              <div key={idx} style={{ marginBottom: idx < args.edits.length - 1 ? '0.5rem' : 0, paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
                <div style={{ color: '#ef4444', fontSize: '0.7rem' }}>
                  - {(edit.old_string?.length > 50 ? edit.old_string.substring(0, 50) + '...' : edit.old_string) || '(empty)'}
                </div>
                <div style={{ color: '#10b981', fontSize: '0.7rem' }}>
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid #10b981',
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: response.error ? '#ef4444' : '#10b981' }}>
              {response.error ? `❌ ${response.error}` : '✅ All edits applied successfully'}
            </span>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },

  NotebookEdit: {
    icon: '📓',
    getInlineText: (args) => {
      const path = args.notebook_path || '';
      const fileName = path.split(/[/\\]/).pop() || path;
      const mode = args.edit_mode || 'replace';
      return `📓 ${fileName} (${mode})`;
    },
    hasDetails: (args, response) => !!args.notebook_path || !!response,
    renderButton: (args, showDetails, setShowDetails, response, showResult, setShowResult) => {
      const hasArgs = !!args.notebook_path;
      const hasResponse = !!response;
      if (!hasArgs && !hasResponse) return null;
      return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasArgs && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showDetails ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showDetails ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? 'Hide' : 'Details'}
            </button>
          )}
          {hasResponse && setShowResult && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
              style={{
                padding: '0.125rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: showResult ? 'var(--accent)' : 'var(--bg-secondary)',
                color: showResult ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {showResult ? 'Hide' : 'Result'}
            </button>
          )}
        </div>
      );
    },
    renderContent: (args, showResult, response) => {
      const elements: ReactNode[] = [];
      if (args.notebook_path) {
        elements.push(
          <div
            key="details"
            style={{
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📓 Notebook: </span>
              <span style={{ color: 'var(--text-primary)' }}>{args.notebook_path}</span>
            </div>
            {args.cell_type && (
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>📝 Cell type: </span>
                <span style={{ color: 'var(--text-primary)' }}>{args.cell_type}</span>
              </div>
            )}
            {args.edit_mode && (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>⚙️ Mode: </span>
                <span style={{ color: args.edit_mode === 'delete' ? '#ef4444' : args.edit_mode === 'insert' ? '#10b981' : '#3b82f6' }}>
                  {args.edit_mode}
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
              marginLeft: '1.5rem',
              marginBottom: '0.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '4px',
              border: response.error ? '1px solid #ef4444' : '1px solid #10b981',
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: response.error ? '#ef4444' : '#10b981' }}>
              {response.error ? `❌ ${response.error}` : '✅ Notebook updated'}
            </span>
          </div>
        );
      }
      return elements.length > 0 ? <>{elements}</> : null;
    },
  },
};

/**
 * Tool name aliases - maps MCP tool names to canonical names
 */
const TOOL_ALIASES: Record<string, string> = {
  'mcp__python__run': 'python',
};

/**
 * Get tool config, checking aliases first
 */
function getToolConfig(toolName: string): ToolConfig {
  // Check for exact match first
  if (TOOL_CONFIGS[toolName]) {
    return TOOL_CONFIGS[toolName];
  }
  // Check aliases
  const aliasedName = TOOL_ALIASES[toolName];
  if (aliasedName && TOOL_CONFIGS[aliasedName]) {
    return TOOL_CONFIGS[aliasedName];
  }
  // Return default
  return DEFAULT_TOOL_CONFIG;
}

/**
 * Default tool config for unknown tools
 */
const DEFAULT_TOOL_CONFIG: ToolConfig = {
  icon: '🔧',
  getInlineText: (args) => {
    const entries = Object.entries(args);
    if (entries.length === 0) return '';
    const firstValue = entries[0][1];
    if (typeof firstValue === 'string') {
      return firstValue.length > 50 ? `${firstValue.substring(0, 50)}...` : firstValue;
    }
    return JSON.stringify(firstValue);
  },
  hasDetails: () => false,
  renderButton: () => null,
  renderContent: () => null,
};

export function ToolCallItem({
  item,
  onApprove,
  onReject
}: ToolCallItemProps) {
  // Validate item type
  if (item.type !== 'tool_call' || !item.toolCall) {
    return null;
  }

  const { toolCall, toolResponse: response, needsApproval, wasRejected, progress } = item;

  // Get tool configuration first (needed for defaultExpanded)
  const toolConfig = getToolConfig(toolCall.name);

  // Initialize state with tool's defaultExpanded setting
  const [showDetails, setShowDetails] = useState(toolConfig.defaultExpanded ?? false);
  const [showResult, setShowResult] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const { t } = useLanguage();

  // Resolve tool name (handle MCP aliases like mcp__python__run -> python)
  const canonicalToolName = TOOL_ALIASES[toolCall.name] || toolCall.name;

  const icon = toolConfig.icon;

  // Copy code to clipboard
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  // Copy result to clipboard
  const handleCopyResult = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    } catch (error) {
      console.error('Failed to copy result:', error);
    }
  };
  const inlineText = toolConfig.getInlineText(toolCall.args);
  const hasDetails = toolConfig.hasDetails(toolCall.args, response);

  return (
    <div className="chat-item chat-item-ai" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
      {/* AI Avatar */}
      <div className="chat-item-avatar">
        <div className="avatar-icon ai-avatar">
          {/* AI icon - bot/robot face */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <path d="M12 2v4" />
            <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
          </svg>
        </div>
      </div>

      {/* Tool call content */}
      <div className="chat-item-content">
        {/* Tool call - first line: icon, name, inline text */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.25rem',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {typeof icon === 'string' ? icon : icon}
          </span>
          <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
            {toolCall.name}
          </span>
          {inlineText && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {inlineText}
            </span>
          )}
        </div>

        {/* Second line: status + action buttons */}
        {(response || wasRejected || hasDetails) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
              marginLeft: '1.5rem',
            }}
          >
            {/* Status badge */}
            {wasRejected && !response && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: '#f59e0b',
                  padding: '0.125rem 0.375rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '3px',
                }}
              >
                REJECTED
              </span>
            )}
            {response && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: response.error ? '#ef4444' : '#10b981',
                  padding: '0.125rem 0.375rem',
                  backgroundColor: response.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                  borderRadius: '3px',
                }}
              >
                {response.error ? 'FAIL' : 'SUCCESS'}
              </span>
            )}
            {/* Tool-specific action buttons */}
            {hasDetails && toolConfig.renderButton(toolCall.args, showDetails, setShowDetails, response, showResult, setShowResult)}
          </div>
        )}

      {/* Tool-specific details content (below the header) */}
      {canonicalToolName === 'python' ? (
        // Special rendering for Python tool - separate code and result
        <>
          {showDetails && ((): React.ReactNode => {
            const args = toolCall.args;
            if (!args.code) return null;

            // Parse requirements to array
            const requirements: string[] = args.requirements
              ? Array.isArray(args.requirements)
                ? (args.requirements as string[])
                : typeof args.requirements === 'string'
                  ? args.requirements.split(/[\s,]+/).filter((r: string) => r.trim())
                  : []
              : [];

            // Parse workspaces
            const workspaces: string[] = args.workspaces && Array.isArray(args.workspaces)
              ? (args.workspaces as string[])
              : [];

            // Extract typed values for rendering
            const description = typeof args.description === 'string' ? args.description : '';
            const workingDirectory = typeof args.workingDirectory === 'string' ? args.workingDirectory : '';

            return (
              <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
                {/* Description */}
                {description && (
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                    <strong>📝 Task:</strong> {description}
                  </div>
                )}

                {/* Workspaces */}
                {workspaces.length > 0 && (
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    <div style={{ marginBottom: '0.25rem' }}>
                      <strong>📂 Workspaces:</strong>
                    </div>
                    {workspaces.map((ws: string, idx: number) => (
                      <div key={idx} style={{ marginLeft: '1rem', marginBottom: '0.125rem' }}>
                        <code
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            fontSize: '0.7rem',
                          }}
                        >
                          {ws.toUpperCase()}
                        </code>
                        {' → '}
                        <code
                          style={{
                            backgroundColor: 'var(--bg-tertiary)',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            fontSize: '0.7rem',
                          }}
                        >
                          {ws}
                        </code>
                      </div>
                    ))}
                  </div>
                )}

                {/* Requirements and Working Directory */}
                {(requirements.length > 0 || workingDirectory) && (
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {requirements.length > 0 && (
                      <div style={{ marginBottom: '0.25rem' }}>
                        📦 <strong>Requirements:</strong>{' '}
                        {requirements.map((req: string, idx: number) => (
                          <span key={idx}>
                            <code
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '3px',
                                fontSize: '0.7rem',
                              }}
                            >
                              {req}
                            </code>
                            {idx < requirements.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    )}
                    {workingDirectory && (
                      <div>
                        📁 <strong>Working Directory:</strong> <code>{workingDirectory}</code>
                      </div>
                    )}
                  </div>
                )}

                {/* Python code */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      margin: 0,
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '300px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <ReactMarkdown
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      code: ({ className, children, ...props }: any) => (
                        <code className={className || 'language-python'} {...props}>
                          {children}
                        </code>
                      ),
                      pre: ({ children, ...props }: any) => (
                        <pre
                          style={{
                            margin: 0,
                            padding: '0.75rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            whiteSpace: 'pre',
                            fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
                            lineHeight: '1.4',
                            backgroundColor: 'transparent',
                          }}
                          {...props}
                        >
                          {children}
                        </pre>
                      ),
                    }}
                  >
                    {'```python\n' + String(args.code) + '\n```'}
                  </ReactMarkdown>
                  </div>

                  {/* Copy Code Button */}
                  <button
                    onClick={() => handleCopyCode(String(args.code))}
                    style={{
                      position: 'absolute',
                      top: '1.05rem',
                      right: '1.65rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.7rem',
                      backgroundColor: copiedCode ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      backdropFilter: 'blur(4px)',
                      zIndex: 10,
                    }}
                    onMouseEnter={(e) => {
                      if (!copiedCode) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copiedCode) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      }
                    }}
                  >
                    {copiedCode ? t.common.buttons.copied : t.common.buttons.copyCode}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Progress log - auto-show during execution, collapsible after completion */}
          {progress && progress.length > 0 && (
            <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
              {/* Show toggle button only after execution completes */}
              {response && (
                <button
                  onClick={() => setShowProgress(!showProgress)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem 0',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span style={{ transform: showProgress ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                  <span>Execution Log ({progress.length} entries)</span>
                </button>
              )}
              {/* Show progress: always during execution (!response), or when toggled on after completion */}
              {(!response || showProgress) && (
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    fontSize: '0.7rem',
                    fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
                    maxHeight: '150px',
                    overflow: 'auto',
                    marginTop: response ? '0.25rem' : 0,
                  }}
                >
                  {!response && (
                    <div style={{ marginBottom: '0.25rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      ⏳ Execution Progress:
                    </div>
                  )}
                  {progress.slice(-10).map((entry: ToolProgressEntry, idx: number) => {
                    const typeIcon =
                      entry.type === 'stdout' ? '📤' :
                      entry.type === 'stderr' ? '⚠️' :
                      entry.type === 'start' ? '▶️' :
                      entry.type === 'end' ? '✅' :
                      entry.type === 'error' ? '❌' : '•';
                    const typeColor =
                      entry.type === 'stderr' || entry.type === 'error' ? '#f59e0b' :
                      entry.type === 'end' ? '#10b981' :
                      'var(--text-secondary)';

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          marginBottom: '0.125rem',
                          color: typeColor,
                        }}
                      >
                        <span>{typeIcon}</span>
                        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {entry.message}
                        </span>
                      </div>
                    );
                  })}
                  {progress.length > 10 && (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                      ... and {progress.length - 10} more entries
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showResult && response && ((): React.ReactNode => {
            // Parse MCP tool output format: [{"type":"text","text":"..."}]
            let displayOutput = '';
            const isError = !!response.error;

            if (response.error) {
              displayOutput = response.error;
            } else if (response.output) {
              try {
                const parsed = JSON.parse(response.output);
                if (Array.isArray(parsed)) {
                  // Extract text from MCP content array
                  displayOutput = parsed
                    .filter((item: { type?: string }) => item.type === 'text')
                    .map((item: { text?: string }) => item.text || '')
                    .join('\n');
                } else if (typeof parsed === 'object' && parsed !== null && parsed.text) {
                  displayOutput = parsed.text;
                } else {
                  displayOutput = response.output;
                }
              } catch {
                // Not JSON, use as-is
                displayOutput = response.output;
              }
            }

            if (!displayOutput) {
              displayOutput = '(no output)';
            }

            return (
              <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      margin: 0,
                      padding: '0.75rem',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      maxHeight: '300px',
                      color: isError ? '#ef4444' : 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      border: isError ? '1px solid #ef4444' : '1px solid var(--border)',
                    }}
                  >
                    {isError ? (
                      <>
                        <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#ef4444' }}>
                          ❌ Error:
                        </div>
                        {displayOutput}
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#10b981' }}>
                          ✅ Output:
                        </div>
                        {displayOutput}
                      </>
                    )}
                  </div>

                  {/* Copy Result Button */}
                  <button
                    onClick={() => handleCopyResult(displayOutput)}
                    style={{
                      position: 'absolute',
                      top: '1.05rem',
                      right: '1.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.7rem',
                      backgroundColor: copiedResult ? '#10b981' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      zIndex: 10,
                    }}
                    onMouseEnter={(e) => {
                      if (!copiedResult) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copiedResult) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                  >
                    {copiedResult ? t.common.buttons.copied : t.common.buttons.copyCode}
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      ) : (toolCall.name === 'pdf' || toolCall.name === 'markitdown' || toolCall.name === 'python') ? (
        // Specialized rendering for pdf, markitdown, and python tools - separate details and result
        <>
          {showDetails && toolConfig.renderContent(toolCall.args, false, undefined)}
          {showResult && response && toolConfig.renderContent(toolCall.args, true, response)}
        </>
      ) : (
        // Default rendering for other tools
        hasDetails && (showDetails || showResult) && toolConfig.renderContent(toolCall.args, showResult, response)
      )}

      {/* Approval buttons (if needed) - inline */}
      {needsApproval && !response && (onApprove || onReject) && (
        <div
          style={{
            marginBottom: '0.5rem',
            marginLeft: '1.5rem',
            display: 'flex',
            gap: '0.5rem',
          }}
        >
          {onReject && (
            <button
              onClick={() => onReject(toolCall.id)}
              style={{
                padding: '0.25rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Reject
            </button>
          )}
          {onApprove && (
            <button
              onClick={() => onApprove(toolCall.id)}
              style={{
                padding: '0.25rem 0.75rem',
                border: '1px solid #10b981',
                borderRadius: '4px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Approve
            </button>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
