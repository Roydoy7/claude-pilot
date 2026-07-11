/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Web Tools Renderers - WebFetch and WebSearch
 */

import type { ReactNode } from 'react';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, codeStyle } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';

// ============================================
// Types for WebSearch results
// ============================================

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

interface ParsedSearchResponse {
  query?: string;
  results: SearchResult[];
  error?: string;
}

/**
 * Parse WebSearch response output
 * Format: {"query":"...","results":[{"tool_use_id":"...","content":[{"title":"...","url":"..."},...]}]}
 */
function parseSearchResponse(output: string): ParsedSearchResponse {
  if (!output) return { results: [] };

  try {
    const parsed = JSON.parse(output);

    // Handle array format: [{"type":"text","text":"..."}]
    if (Array.isArray(parsed)) {
      const textItem = parsed.find((item: { type?: string }) => item.type === 'text');
      if (textItem?.text) {
        return parseSearchResponse(textItem.text);
      }
    }

    // Handle Claude SDK WebSearch format: {"query":"...","results":[{"content":[{title,url},...]}]}
    if (parsed.results && Array.isArray(parsed.results)) {
      const allResults: SearchResult[] = [];

      for (const resultItem of parsed.results) {
        // Check if resultItem has content array (Claude SDK format)
        if (resultItem.content && Array.isArray(resultItem.content)) {
          for (const item of resultItem.content) {
            if (item.title || item.url) {
              allResults.push({
                title: String(item.title || ''),
                url: String(item.url || ''),
                snippet: item.snippet ? String(item.snippet) : undefined,
              });
            }
          }
        } else if (resultItem.title || resultItem.url) {
          // Direct result format
          allResults.push({
            title: String(resultItem.title || ''),
            url: String(resultItem.url || ''),
            snippet: resultItem.snippet ? String(resultItem.snippet) : undefined,
          });
        }
      }

      if (allResults.length > 0) {
        return { query: parsed.query, results: allResults };
      }
    }

    // Handle content array format
    if (parsed.content && Array.isArray(parsed.content)) {
      const results: SearchResult[] = [];
      for (const item of parsed.content) {
        if (item.title || item.url) {
          results.push({
            title: String(item.title || ''),
            url: String(item.url || ''),
            snippet: item.snippet ? String(item.snippet) : undefined,
          });
        }
      }
      if (results.length > 0) {
        return { query: parsed.query, results };
      }
    }
  } catch {
    // Not JSON, try to extract URLs from text
  }

  // Fallback: try to parse as plain text with URLs
  const urlMatches = output.match(/https?:\/\/[^\s"'<>]+/g);
  if (urlMatches) {
    return {
      results: urlMatches.slice(0, 10).map(url => ({
        title: new URL(url).hostname,
        url,
      })),
    };
  }

  return { results: [], error: output };
}

// ============================================
// WebFetch Tool Renderer
// ============================================

export const webFetchRenderer: ToolConfig = {
  icon: '🌐',

  getInlineText: (args: ToolArgs): string => {
    const url = String(args.url || '');
    try {
      const hostname = new URL(url).hostname;
      return `🌐 ${hostname}`;
    } catch {
      return `🌐 ${url.substring(0, 30)}${url.length > 30 ? '...' : ''}`;
    }
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.url || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    const hasArgs = !!args.url;
    const hasResponse = !!response;
    if (!hasArgs && !hasResponse) return null;

    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {hasArgs && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            style={getButtonStyle(showDetails)}
          >
            {showDetails ? 'Hide' : 'URL'}
          </button>
        )}
        {hasResponse && setShowResult && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
            style={getButtonStyle(showResult ?? false)}
          >
            {showResult ? 'Hide' : 'Content'}
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
    const elements: ReactNode[] = [];

    if (args.url) {
      elements.push(
        <div key="details" style={contentContainerStyle}>
          <div style={{ marginBottom: args.prompt ? '0.25rem' : 0 }}>
            <span style={{ color: 'var(--text-secondary)' }}>🔗 URL: </span>
            <a
              href={String(args.url)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              {String(args.url)}
            </a>
          </div>
          {!!args.prompt && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>💬 Prompt: </span>
              <span style={{ color: 'var(--text-primary)' }}>{String(args.prompt)}</span>
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
            ...contentContainerStyle,
            border: response.error ? '1px solid #ef4444' : '1px solid var(--border)',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          <pre style={{ ...codeStyle, color: response.error ? 'var(--error)' : 'var(--text-primary)' }}>
            {response.error || response.output}
          </pre>
        </div>
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};

// ============================================
// WebSearch Tool Renderer
// ============================================

export const webSearchRenderer: ToolConfig = {
  icon: '🔎',

  getInlineText: (args: ToolArgs): string => {
    const query = String(args.query || '');
    const truncated = query.length > 40 ? query.substring(0, 40) + '...' : query;
    return `🔎 "${truncated}"`;
  },

  hasDetails: (args: ToolArgs, response?: ToolResponse): boolean => {
    return !!args.query || !!response;
  },

  renderButton: (
    args: ToolArgs,
    showDetails: boolean,
    setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    const hasArgs = !!args.query;
    const hasResponse = !!response;
    if (!hasArgs && !hasResponse) return null;

    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {hasArgs && (!!args.allowed_domains || !!args.blocked_domains) && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            style={getButtonStyle(showDetails)}
          >
            {showDetails ? 'Hide' : 'Filters'}
          </button>
        )}
        {hasResponse && setShowResult && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowResult(!showResult); }}
            style={getButtonStyle(showResult ?? false)}
          >
            {showResult ? 'Hide' : 'Results'}
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
    const elements: ReactNode[] = [];

    if (args.allowed_domains || args.blocked_domains) {
      const allowedDomains = Array.isArray(args.allowed_domains) ? args.allowed_domains as string[] : [];
      const blockedDomains = Array.isArray(args.blocked_domains) ? args.blocked_domains as string[] : [];

      elements.push(
        <div key="details" style={contentContainerStyle}>
          {allowedDomains.length > 0 && (
            <div style={{ marginBottom: blockedDomains.length > 0 ? '0.25rem' : 0 }}>
              <span style={{ color: 'var(--text-secondary)' }}>✅ Only: </span>
              <span style={{ color: 'var(--success)' }}>{allowedDomains.join(', ')}</span>
            </div>
          )}
          {blockedDomains.length > 0 && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>🚫 Exclude: </span>
              <span style={{ color: 'var(--error)' }}>{blockedDomains.join(', ')}</span>
            </div>
          )}
        </div>
      );
    }

    if (showResult && response) {
      if (response.error) {
        // Show error
        elements.push(
          <div
            key="result"
            style={{
              ...contentContainerStyle,
              border: '1px solid #ef4444',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            <pre style={{ ...codeStyle, color: 'var(--error)' }}>
              {response.error}
            </pre>
          </div>
        );
      } else {
        // Parse and display search results
        const parsed = parseSearchResponse(response.output || '');

        if (parsed.error) {
          // Fallback to raw output
          elements.push(
            <div
              key="result"
              style={{
                ...contentContainerStyle,
                maxHeight: '300px',
                overflow: 'auto',
              }}
            >
              <pre style={{ ...codeStyle, color: 'var(--text-primary)' }}>
                {parsed.error}
              </pre>
            </div>
          );
        } else if (parsed.results.length > 0) {
          // Show formatted search results
          elements.push(
            <div
              key="result"
              style={{
                marginLeft: '1.5rem',
                marginBottom: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                {parsed.results.length} result{parsed.results.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {parsed.results.map((result, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', minWidth: '1rem' }}>
                        {index + 1}.
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={result.title}
                        >
                          {result.title || result.url}
                        </a>
                        <div
                          style={{
                            color: 'var(--success)',
                            fontSize: '0.65rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '0.125rem',
                          }}
                        >
                          {result.url}
                        </div>
                        {result.snippet && (
                          <div
                            style={{
                              color: 'var(--text-secondary)',
                              fontSize: '0.7rem',
                              marginTop: '0.25rem',
                              lineHeight: 1.4,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {result.snippet}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        } else {
          // No results
          elements.push(
            <div
              key="result"
              style={{
                ...contentContainerStyle,
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              No search results found
            </div>
          );
        }
      }
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};
