/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Python Code Display Component
 * Specialized rendering for Python tool with syntax highlighting
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { ToolResponse, ToolProgressEntry } from '../../../../preload/preload-types';
import { ProgressLog } from './shared-components';
import { isMcpToolError, contentContainerStyle } from './types';
import { McpToolResult } from './McpToolResult';

// ============================================
// Types
// ============================================

interface ToolArgs {
  code?: string;
  description?: string;
  workspaces?: string[];
  requirements?: string[];
  working_directory?: string;
  [key: string]: unknown;
}

interface PythonCodeDisplayProps {
  args: ToolArgs;
  response?: ToolResponse;
  progress?: ToolProgressEntry[];
  showResult: boolean;
  translations: {
    copyCode: string;
    copied: string;
  };
}

// ============================================
// Python Code Display Component
// ============================================

/**
 * Render MCP tool result using the McpToolResult component
 */
function renderMcpResult(response: ToolResponse): React.ReactNode {
  return (
    <McpToolResult
      output={response.output}
      error={response.error}
      isError={isMcpToolError(response)}
    />
  );
}

/**
 * Specialized Python code display with syntax highlighting,
 * copy button, workspace/requirements info, and progress log
 */
export function PythonCodeDisplay({
  args,
  response,
  progress,
  showResult,
  translations,
}: PythonCodeDisplayProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

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

  const code = typeof args.code === 'string' ? args.code : '';
  const description = typeof args.description === 'string' ? args.description : '';
  const workspaces = Array.isArray(args.workspaces) ? args.workspaces as string[] : [];
  const requirements = Array.isArray(args.requirements) ? args.requirements as string[] : [];
  const workingDirectory = typeof args.working_directory === 'string' ? args.working_directory : '';

  return (
    <>
      {/* Python code display with syntax highlighting */}
      <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
        {/* Description */}
        {description && (
          <div
            style={{
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem',
              fontSize: '0.75rem',
              fontStyle: 'italic',
            }}
          >
            📋 {description}
          </div>
        )}

        {/* Workspaces, Requirements, Working Directory */}
        {(workspaces.length > 0 || requirements.length > 0 || workingDirectory) && (
          <div
            style={{
              ...contentContainerStyle,
              marginBottom: '0.5rem',
            }}
          >
            {workspaces.length > 0 && (
              <div style={{ marginBottom: '0.25rem' }}>
                📂 <strong>Workspaces:</strong>{' '}
                {workspaces.map((ws: string, idx: number) => (
                  <span key={idx}>
                    <code
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                      }}
                    >
                      {ws}
                    </code>
                    {idx < workspaces.length - 1 && ', '}
                  </span>
                ))}
              </div>
            )}
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
                code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => (
                  <code className={className || 'language-python'} {...props}>
                    {children}
                  </code>
                ),
                pre: ({ children, ...props }: { children?: React.ReactNode }) => (
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
              {'```python\n' + code + '\n```'}
            </ReactMarkdown>
          </div>

          {/* Copy Code Button */}
          <button
            onClick={() => handleCopyCode(code)}
            style={{
              position: 'absolute',
              top: '1.05rem',
              right: '1.65rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              backgroundColor: copiedCode ? 'var(--success)' : 'rgba(255, 255, 255, 0.1)',
              color: 'var(--on-accent)',
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
            {copiedCode ? translations.copied : translations.copyCode}
          </button>
        </div>
      </div>

      {/* Progress log - auto-show during execution, collapsible after completion */}
      {progress && progress.length > 0 && (
        <ProgressLog
          progress={progress}
          hasResponse={!!response}
          showProgress={showProgress}
          setShowProgress={setShowProgress}
        />
      )}

      {showResult && response && renderMcpResult(response)}
    </>
  );
}
