/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * DOCX Tool Renderer - Word document info display
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, isMcpToolError, parseMcpOutput } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

/**
 * Word Document Icon (blue)
 */
export const DocxIcon = () => (
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
 * DOCX tool renderer
 */
export const docxRenderer: ToolConfig = {
  icon: <DocxIcon />,

  getInlineText: (args: ToolArgs): string => {
    const op = String(args.operation || 'get-info');
    const docxFile = String(args.docxFile || '');
    const fileName = docxFile.split(/[/\\]/).pop() || docxFile;

    if (op === 'get-info') {
      return `📄 ${fileName}`;
    }

    return fileName || op;
  },

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => {
    return !!response;
  },

  renderButton: (
    _args: ToolArgs,
    _showDetails: boolean,
    _setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    if (!response || !setShowResult) return null;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowResult(!showResult);
        }}
        style={getButtonStyle(showResult ?? false)}
      >
        {showResult ? 'Hide' : 'Show'}
      </button>
    );
  },

  renderContent: (
    _args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse
  ) => {
    if (!showResult || !response) return null;

    const isError = isMcpToolError(response);
    const output = response.error || parseMcpOutput(response.output || '') || '(no output)';

    return (
      <div
        style={{
          ...contentContainerStyle,
          padding: '0.75rem 1rem',
          border: isError ? '1px solid #ef4444' : '1px solid #2b579a33',
          maxHeight: '400px',
          overflow: 'auto',
        }}
      >
        {isError ? (
          <div style={{ color: 'var(--error)' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Error:</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {output}
            </pre>
          </div>
        ) : (
          <div className="tool-result-markdown" style={{ color: 'var(--text-primary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {output}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  },
};
