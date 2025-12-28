/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tool Renderer Types - Shared types for tool rendering
 */

import type { ReactNode } from 'react';
import type { ToolResponse } from '../../../../preload/preload-types';

/**
 * Tool arguments type - generic key-value object
 */
export type ToolArgs = Record<string, unknown>;

/**
 * Tool display configuration
 */
export interface ToolConfig {
  /** Icon for the tool - emoji string or SVG ReactNode */
  icon: string | ReactNode;
  /** Get inline text to display next to tool name */
  getInlineText: (args: ToolArgs) => string;
  /** Check if tool has details to show */
  hasDetails: (args: ToolArgs, response?: ToolResponse) => boolean;
  /** If true, details are shown by default */
  defaultExpanded?: boolean;
  /** Render toggle buttons for show/hide */
  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => ReactNode;
  /** Render the tool content (code, result, etc.) */
  renderContent: (
    args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse,
    showDetails?: boolean
  ) => ReactNode;
}

/**
 * Common button styles
 */
export const buttonStyle = {
  padding: '0.125rem 0.5rem',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  fontSize: '0.7rem',
  cursor: 'pointer',
};

/**
 * Get button style based on active state
 */
export function getButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    ...buttonStyle,
    backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
    color: isActive ? '#ffffff' : 'var(--text-secondary)',
  };
}

/**
 * Common content container styles
 */
export const contentContainerStyle: React.CSSProperties = {
  marginLeft: '1.5rem',
  marginBottom: '0.5rem',
  marginTop: '0.5rem',
  padding: '0.5rem 0.75rem',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  fontSize: '0.75rem',
};

/**
 * Code block styles
 */
export const codeStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
  fontSize: '0.7rem',
  lineHeight: '1.4',
};

/**
 * Check if MCP tool response is an error
 */
export function isMcpToolError(response: ToolResponse | undefined): boolean {
  if (!response) return false;
  if (response.error) return true;
  if (!response.output) return false;

  try {
    const parsed = JSON.parse(response.output);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'text') {
      const text = parsed[0].text || '';
      if (text.startsWith('**Status**: Failed') || text.includes('## Error')) {
        return true;
      }
    }
  } catch {
    // Not JSON, check raw output
    if (response.output.includes('Error') || response.output.includes('error')) {
      return true;
    }
  }
  return false;
}

/**
 * Parse MCP tool output to extract text content
 */
export function parseMcpOutput(output: string): string {
  if (!output) return '';

  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item: { type?: string }) => item.type === 'text')
        .map((item: { text?: string }) => item.text || '')
        .join('\n');
    }
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.text) return parsed.text;
      if (parsed.stdout !== undefined) return parsed.stdout || '(no output)';
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Not JSON, return as-is
  }
  return output;
}
