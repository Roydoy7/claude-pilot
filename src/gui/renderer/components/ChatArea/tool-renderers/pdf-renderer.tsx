/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * PDF Tool Renderer
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, isMcpToolError, parseMcpOutput } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

/**
 * PDF Icon Component
 */
export const PdfIcon = () => (
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

export const pdfRenderer: ToolConfig = {
  icon: <PdfIcon />,

  getInlineText: (args: ToolArgs): string => {
    const op = String(args.operation || '');
    const file = String(args.file || '');
    const fileName = file.split(/[/\\]/).pop() || file;

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
    if (op === 'merge' && Array.isArray(args.sources)) {
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

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.operation || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
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
            style={getButtonStyle(showDetails)}
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
            style={getButtonStyle(showResult ?? false)}
          >
            {showResult ? 'Hide Result' : 'Show Result'}
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
    const elements: React.ReactNode[] = [];

    // Show args details
    if (args.operation) {
      const detailItems: Array<{ label: string; value: string; icon: string }> = [];

      if (args.file) {
        detailItems.push({ label: 'File', value: String(args.file), icon: '📁' });
      }
      if (args.pages) {
        detailItems.push({ label: 'Pages', value: String(args.pages), icon: '📑' });
      }
      if (args.query) {
        detailItems.push({ label: 'Query', value: String(args.query), icon: '🔍' });
      }
      if (args.output) {
        detailItems.push({ label: 'Output', value: String(args.output), icon: '💾' });
      }
      if (args.sources && Array.isArray(args.sources)) {
        detailItems.push({ label: 'Sources', value: (args.sources as string[]).join(', '), icon: '📚' });
      }
      if (args.content) {
        const content = String(args.content);
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        detailItems.push({ label: 'Content', value: preview, icon: '📝' });
      }

      if (detailItems.length > 0) {
        elements.push(
          <div key="details" style={contentContainerStyle}>
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
      const isError = isMcpToolError(response);
      const displayOutput = response.error || parseMcpOutput(response.output || '') || '(no output)';

      elements.push(
        <div
          key="result"
          style={{
            ...contentContainerStyle,
            padding: '0.75rem 1rem',
            border: isError ? '1px solid var(--error)' : '1px solid var(--border)',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          {isError ? (
            <div style={{ color: 'var(--error)' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Error:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {displayOutput}
              </pre>
            </div>
          ) : (
            <div className="tool-result-markdown" style={{ color: 'var(--text-primary)' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {displayOutput}
              </ReactMarkdown>
            </div>
          )}
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};
