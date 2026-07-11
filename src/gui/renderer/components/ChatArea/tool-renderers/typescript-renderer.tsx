/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * TypeScript Tool Renderer
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

export const typescriptRenderer: ToolConfig = {
  icon: '🔷',

  getInlineText: (args: ToolArgs): string => {
    if (args.code && typeof args.code === 'string') {
      const firstLine = args.code.split('\n')[0].trim();
      return firstLine.length > 40 ? `${firstLine.substring(0, 40)}...` : firstLine;
    }
    return '';
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
    if (!showResult) {
      if (!args.code || typeof args.code !== 'string') return null;

      const packages = args.packages && Array.isArray(args.packages) ? args.packages as string[] : [];

      return (
        <div style={contentContainerStyle}>
          <pre style={{ ...codeStyle, color: 'var(--accent)' }}>
            {String(args.code)}
          </pre>
          {packages.length > 0 && (
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.7rem' }}>
              📦 Packages: {packages.join(', ')}
            </div>
          )}
        </div>
      );
    }

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
