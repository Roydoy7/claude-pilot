/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Python Tool Renderer
 */

import type { ToolConfig, ToolArgs } from './types';
import {
  getButtonStyle,
  contentContainerStyle,
  codeStyle,
  isMcpToolError,
  parseMcpOutput,
} from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

export const pythonRenderer: ToolConfig = {
  icon: '🐍',

  getInlineText: (args: ToolArgs): string => {
    const parts: string[] = [];

    if (args.description && typeof args.description === 'string') {
      const desc = args.description.length > 50
        ? `${args.description.substring(0, 50)}...`
        : args.description;
      parts.push(desc);
    } else if (args.code && typeof args.code === 'string') {
      const firstLine = args.code.split('\n')[0].trim();
      const codePreview = firstLine.length > 40 ? `${firstLine.substring(0, 40)}...` : firstLine;
      parts.push(codePreview);
    }

    if (args.workspaces && Array.isArray(args.workspaces) && args.workspaces.length > 0) {
      parts.push(`📂 ${args.workspaces.length} workspace${args.workspaces.length !== 1 ? 's' : ''}`);
    }

    if (args.requirements && Array.isArray(args.requirements) && args.requirements.length > 0) {
      const pkgCount = args.requirements.length;
      parts.push(`📦 ${pkgCount} pkg${pkgCount !== 1 ? 's' : ''}`);
    }

    return parts.join(' • ');
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.code || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
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
            style={getButtonStyle(showDetails)}
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
    // When showResult is false, show code; when true, show result
    if (!showResult) {
      if (!args.code || typeof args.code !== 'string') return null;

      const description = typeof args.description === 'string' ? args.description : '';
      const requirements = args.requirements && Array.isArray(args.requirements) ? args.requirements as string[] : [];

      return (
        <div style={contentContainerStyle}>
          {description && (
            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.7rem' }}>
              📋 {description}
            </div>
          )}
          <pre style={{ ...codeStyle, color: 'var(--accent)' }}>
            {String(args.code)}
          </pre>
          {requirements.length > 0 && (
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.7rem' }}>
              📦 Dependencies: {requirements.join(', ')}
            </div>
          )}
        </div>
      );
    }

    // Show result
    if (!response) return null;

    const isError = isMcpToolError(response);
    const displayOutput = response.error || parseMcpOutput(response.output || '') || '(no output)';

    return (
      <div
        style={{
          ...contentContainerStyle,
          border: isError ? '1px solid #ef4444' : '1px solid var(--border)',
          maxHeight: '300px',
          overflow: 'auto',
        }}
      >
        <pre style={{ ...codeStyle, color: isError ? 'var(--error)' : 'var(--text-primary)' }}>
          {displayOutput}
        </pre>
      </div>
    );
  },
};
