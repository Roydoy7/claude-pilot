/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Document Conversion Tool Renderers
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, isMcpToolError, parseMcpOutput } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

/**
 * Document Convert Icon
 */
export const DocumentConvertIcon = () => (
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

/**
 * Word Document Icon
 */
export const WordDocIcon = () => (
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

/**
 * Convert tool renderer (Pandoc-based conversion)
 */
export const convertRenderer: ToolConfig = {
  icon: '🔄',

  getInlineText: (args: ToolArgs): string => {
    const op = String(args.operation || '');
    const file = String(args.file || '');
    const fileName = file.split(/[/\\]/).pop() || file;
    const to = String(args.to || '');
    const from = String(args.from || '');

    if (op === 'list-formats') {
      return '📋 List supported formats';
    }

    if (op === 'convert') {
      if (from && to) {
        return `${fileName} (${from} → ${to})`;
      }
      if (to) {
        return `${fileName} → ${to}`;
      }
      return fileName;
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
    const hasArgs = !!args.operation && args.operation !== 'list-formats';
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

    // Show args details for convert operation
    if (args.operation === 'convert') {
      const detailItems: Array<{ label: string; value: string; icon: string }> = [];

      if (args.file) {
        detailItems.push({ label: 'Input', value: String(args.file), icon: '📁' });
      }
      if (args.output) {
        detailItems.push({ label: 'Output', value: String(args.output), icon: '💾' });
      }
      if (args.from) {
        detailItems.push({ label: 'From', value: String(args.from), icon: '📥' });
      }
      if (args.to) {
        detailItems.push({ label: 'To', value: String(args.to), icon: '📤' });
      }
      if (args.toc) {
        detailItems.push({ label: 'TOC', value: 'Yes', icon: '📑' });
      }
      if (args.standalone === false) {
        detailItems.push({ label: 'Standalone', value: 'No', icon: '📄' });
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

/**
 * MarkItDown tool renderer (convert documents to markdown)
 */
export const markitdownRenderer: ToolConfig = {
  icon: <DocumentConvertIcon />,

  getInlineText: (args: ToolArgs): string => {
    const file = String(args.filePath || '');
    const fileName = file.split(/[/\\]/).pop() || file;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

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

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.filePath || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
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

    // Show conversion details
    if (args.filePath) {
      const file = String(args.filePath);
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
        <div key="details" style={contentContainerStyle}>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📁 Input: </span>
            <span style={{ color: 'var(--text-primary)' }}>{file}</span>
          </div>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📋 Format: </span>
            <span style={{ color: 'var(--text-primary)' }}>{formatNames[ext] || ext.toUpperCase()}</span>
          </div>
          {!!args.outputPath && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>💾 Output: </span>
              <span style={{ color: 'var(--text-primary)' }}>{String(args.outputPath)}</span>
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
            ...contentContainerStyle,
            padding: '0.75rem',
            border: response.error ? '1px solid var(--error)' : '1px solid var(--border)',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          {response.error ? (
            <div style={{ color: 'var(--error)' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>❌ Conversion Failed:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {response.error}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-primary)' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--success)' }}>✅ Conversion Complete:</div>
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
};

/**
 * Markdown to Word tool renderer
 */
export const markdownToWordRenderer: ToolConfig = {
  icon: <WordDocIcon />,

  getInlineText: (args: ToolArgs): string => {
    const output = String(args.outputPath || '');
    const outputName = output.split(/[/\\]/).pop() || output;
    const template = String(args.template || 'default');

    const templateEmoji: Record<string, string> = {
      default: '📄',
      professional: '💼',
      academic: '🎓',
      casual: '✏️',
    };

    const emoji = templateEmoji[template] || '📄';

    if (args.markdownFile) {
      const inputName = String(args.markdownFile).split(/[/\\]/).pop() || String(args.markdownFile);
      return `${emoji} ${inputName} → ${outputName}`;
    }
    return `${emoji} Markdown → ${outputName}`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.outputPath || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
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

    // Show conversion details
    if (args.outputPath) {
      const template = String(args.template || 'default');
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
            ...contentContainerStyle,
            border: '1px solid #2b579a33',
          }}
        >
          {!!args.markdownFile && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📥 Source: </span>
              <span style={{ color: 'var(--text-primary)' }}>{String(args.markdownFile)}</span>
            </div>
          )}
          {!!args.markdown && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📝 Content: </span>
              <span style={{ color: 'var(--text-primary)' }}>
                {String(args.markdown).length > 50 ? `${String(args.markdown).substring(0, 50)}...` : String(args.markdown)}
              </span>
            </div>
          )}
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>📤 Output: </span>
            <span style={{ color: 'var(--text-primary)' }}>{String(args.outputPath)}</span>
          </div>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>🎨 Template: </span>
            <span style={{ color: 'var(--accent)' }}>{templateNames[template] || template}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span>
              <span style={{ color: 'var(--text-secondary)' }}>📑 TOC: </span>
              <span style={{ color: args.includeTableOfContents ? 'var(--success)' : 'var(--text-secondary)' }}>
                {args.includeTableOfContents ? '✓ Yes' : 'No'}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--text-secondary)' }}>🔢 Page #: </span>
              <span style={{ color: args.includePageNumbers !== false ? 'var(--success)' : 'var(--text-secondary)' }}>
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
            ...contentContainerStyle,
            padding: '0.75rem',
            border: response.error ? '1px solid var(--error)' : '1px solid var(--accent)',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          {response.error ? (
            <div style={{ color: 'var(--error)' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>❌ Conversion Failed:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {response.error}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-primary)' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent)' }}>📘 Word Document Created:</div>
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
};
