/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * McpToolResult - Simple component to display MCP tool results
 * Handles JSON parsing, error states, and Markdown rendering
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface McpToolResultProps {
  /** Raw output from MCP tool (may be JSON string) */
  output?: string;
  /** Error message if any */
  error?: string;
  /** Whether this is an error result */
  isError?: boolean;
  /** Optional max height for scrolling */
  maxHeight?: string;
}

/**
 * Parse MCP tool output to extract text content
 * MCP tools return JSON like: [{"type":"text","text":"..."}]
 */
function parseOutput(output: string): string {
  if (!output) return '';

  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item: { type?: string }) => item.type === 'text')
        .map((item: { text?: string }) => item.text || '')
        .join('\n');
    }
    if (typeof parsed === 'object' && parsed !== null && parsed.text) {
      return parsed.text;
    }
  } catch {
    // Not JSON, return as-is
  }

  return output;
}

const styles = {
  container: {
    marginLeft: '1.5rem',
    marginBottom: '0.5rem',
    marginTop: '0.5rem',
  },
  content: {
    padding: '0.75rem',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '6px',
    fontSize: '0.75rem',
    overflow: 'auto',
    border: '1px solid var(--border)',
  },
  contentError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
    fontWeight: 600,
    fontSize: '0.7rem',
  },
  headerSuccess: {
    color: '#10b981',
  },
  headerError: {
    color: '#ef4444',
  },
  markdown: {
    lineHeight: 1.5,
    fontSize: '0.75rem',
  },
} as const;

/**
 * McpToolResult Component
 * Displays MCP tool output with proper formatting
 */
export function McpToolResult({
  output,
  error,
  isError = false,
  maxHeight = '300px',
}: McpToolResultProps): React.ReactElement | null {
  // Parse the output
  const text = error || parseOutput(output || '');

  if (!text) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            (no output)
          </span>
        </div>
      </div>
    );
  }

  const hasError = isError || !!error;
  const contentStyle = {
    ...styles.content,
    ...(hasError ? styles.contentError : {}),
    maxHeight,
  };

  return (
    <div style={styles.container}>
      <div style={contentStyle}>
        {/* Header */}
        <div
          style={{
            ...styles.header,
            ...(hasError ? styles.headerError : styles.headerSuccess),
          }}
        >
          {hasError ? '❌ Error' : '✅ Output'}
        </div>

        {/* Content - render as Markdown */}
        <div style={styles.markdown} className="mcp-tool-result-markdown">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default McpToolResult;
