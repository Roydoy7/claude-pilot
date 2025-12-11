/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * AutoCAD Tool Display Component
 * Specialized display for AutoCAD MCP server tool calls
 *
 * This is the main entry point. Detailed renderers are in ./autocad/ folder.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { ToolResponse } from '../../../preload/preload-types';
import { parseAutoCADResponse } from './autocad/ResultParser';
import { ResultRenderer } from './autocad/ResultRenderer';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * AutoCAD icon component
 */
export const AutoCADIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#E41E20"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* A stylized "A" representing AutoCAD */}
    <path d="M12 2L2 22h20L12 2z" />
    <path d="M8 18l4-8 4 8" />
    <line x1="9.5" y1="15" x2="14.5" y2="15" />
  </svg>
);

/**
 * Command descriptions for display
 */
const commandDescriptions: Record<string, string> = {
  // 11 core operations
  'extract': 'Extract Data',
  'get_document_list': 'Get Document List',
  'get_drawing_overview': 'Get Drawing Overview',
  'set_active_document': 'Set Active Document',
  'get_index_path': 'Get Index Path',
  'get_view': 'Get View',
  'zoom_extents': 'Zoom Extents',
  'zoom_window': 'Zoom Window',
  'zoom_center': 'Zoom Center',
  'pan_to_point': 'Pan to Point',
  'execute_script': 'Execute Script',
};

/**
 * Parse AutoCAD command type from tool args
 */
function getCommandType(args: Record<string, any>): string {
  if (args.operation) return args.operation;
  if (args.command) return args.command;
  if (args.type) return args.type;
  return 'unknown';
}

/**
 * Get human-readable command description
 */
function getCommandDescription(commandType: string): string {
  return commandDescriptions[commandType] || commandType;
}

/**
 * Get inline text for AutoCAD tool call
 */
export function getAutocadInlineText(args: Record<string, any>): string {
  const commandType = getCommandType(args);
  const description = getCommandDescription(commandType);

  const parts: string[] = [description];

  // Add specific details based on command type
  if (commandType === 'get_block_def_detail' && args.blockName) {
    parts.push(`(${args.blockName})`);
  } else if (commandType === 'get_block_ref_list' && args.blockName) {
    parts.push(`(${args.blockName})`);
  } else if (commandType === 'get_layer_detail' && args.layerName) {
    parts.push(`(${args.layerName})`);
  } else if (commandType === 'create_layer' && args.name) {
    parts.push(`(${args.name})`);
  } else if (commandType === 'insert_block_ref' && args.blockName) {
    parts.push(`(${args.blockName})`);
  }

  return parts.join(' ');
}

/**
 * Check if AutoCAD tool call has details to show
 */
export function hasAutocadDetails(args: Record<string, any>, response?: ToolResponse): boolean {
  // Always show details if there's a response
  if (response) return true;

  // Show details if there are parameters beyond just 'operation'
  const params = Object.keys(args).filter(key => key !== 'operation');
  if (params.length > 0) return true;

  return false;
}

/**
 * Render AutoCAD tool call details button
 */
export function renderAutocadButton(
  args: Record<string, any>,
  showDetails: boolean,
  setShowDetails: (show: boolean) => void,
  response?: ToolResponse,
  showResult?: boolean,
  setShowResult?: (show: boolean) => void
): ReactNode {
  // Check if there are parameters beyond just 'operation'
  const params = Object.keys(args).filter(key => key !== 'operation');
  const hasDetails = params.length > 0;
  const hasResponse = !!response;

  if (!hasDetails && !hasResponse) return null;

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {hasDetails && (
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
          {showDetails ? 'Hide' : 'Details'}
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
          {showResult ? 'Hide' : 'Result'}
        </button>
      )}
    </div>
  );
}

/**
 * Render command parameters in a compact format (excluding 'code' for execute_script)
 */
function renderParams(params: Record<string, unknown>): ReactNode {
  // Filter out 'code' parameter as it's rendered separately with syntax highlighting
  const entries = Object.entries(params).filter(([key]) => key !== 'code');
  if (entries.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem',
      fontSize: '0.7rem',
      fontFamily: 'var(--font-mono)',
    }}>
      {entries.map(([key, value]) => (
        <span key={key} style={{
          padding: '0.125rem 0.375rem',
          backgroundColor: 'var(--background-modifier-form-field)',
          borderRadius: '3px',
        }}>
          <span style={{ color: '#9cdcfe' }}>{key}</span>
          <span style={{ color: 'var(--text-muted)' }}>: </span>
          <span style={{ color: '#ce9178' }}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * C# code display component with syntax highlighting
 */
function CSharpCodeDisplay({ code }: { code: string }): ReactNode {
  const [copiedCode, setCopiedCode] = useState(false);
  const { t } = useLanguage();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
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
            code: ({ className, children, ...props }) => (
              <code className={className || 'language-csharp'} {...props}>
                {children}
              </code>
            ),
            pre: ({ children, ...props }) => (
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
          {'```csharp\n' + code + '\n```'}
        </ReactMarkdown>
      </div>

      {/* Copy Code Button */}
      <button
        onClick={handleCopyCode}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
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
  );
}

/**
 * Render AutoCAD tool call content details
 * showDetails controls parameter display, showResult controls result display
 * Both can be shown simultaneously
 */
export function renderAutocadContent(
  args: Record<string, unknown>,
  showDetails: boolean,
  showResult: boolean,
  response?: ToolResponse
): ReactNode {
  const commandType = getCommandType(args as Record<string, string>);
  const isExecuteScript = commandType === 'execute_script';
  const code = isExecuteScript && typeof args.code === 'string' ? args.code : null;

  // Get parameters excluding 'operation'
  const params = Object.keys(args).filter(key => key !== 'operation').reduce((acc, key) => {
    acc[key] = args[key];
    return acc;
  }, {} as Record<string, unknown>);

  // For execute_script, check if there are params other than 'code'
  const hasNonCodeParams = Object.keys(params).filter(k => k !== 'code').length > 0;
  const hasParams = hasNonCodeParams || code;

  // Don't render anything if nothing to show
  if (!showDetails && !showResult) {
    return null;
  }

  return (
    <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
      {/* Command Arguments - show when showDetails is true */}
      {showDetails && hasParams && (
        <div style={{ marginBottom: showResult && response ? '0.75rem' : '0' }}>
          {/* Non-code parameters */}
          {hasNonCodeParams && (
            <div style={{ marginBottom: code ? '0.5rem' : '0' }}>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem'
              }}>
                Parameters:
              </div>
              {renderParams(params)}
            </div>
          )}

          {/* C# code with syntax highlighting for execute_script */}
          {code && <CSharpCodeDisplay code={code} />}
        </div>
      )}

      {/* Response Data - show when showResult is true */}
      {showResult && response && (
        <div style={{
          padding: '0.5rem 0.75rem',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '4px',
          border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
        }}>
          {response.error ? (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#ef4444',
            }}>
              Error: {response.error}
            </div>
          ) : (
            renderResponseContent(commandType, response.output)
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Render response content using the new modular renderer
 */
function renderResponseContent(operation: string, output: unknown): ReactNode {
  const result = parseAutoCADResponse(output);

  if (!result) {
    // Fallback for unparseable responses
    return (
      <div style={{
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
      }}>
        Unable to parse response
      </div>
    );
  }

  return <ResultRenderer result={result} operation={operation} />;
}
