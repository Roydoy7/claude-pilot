/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * McpToolResult - Simple component to display MCP tool results
 * Handles JSON parsing, error states, and Markdown rendering
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

type JsonRecord = Record<string, unknown>;

interface ParsedOutput {
  text: string;
  data?: unknown;
}

/**
 * Parse MCP tool output to extract text content
 * MCP tools return JSON like: [{"type":"text","text":"..."}]
 */
function tryParseJson(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function parseOutput(output: string): ParsedOutput {
  if (!output) return { text: '' };

  let text = output;

  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      const extracted = parsed
        .filter((item: { type?: string }) => item.type === 'text')
        .map((item: { text?: string }) => item.text || '')
        .join('\n');
      if (extracted) text = extracted;
    }
    if (typeof parsed === 'object' && parsed !== null && 'text' in parsed && typeof parsed.text === 'string') {
      text = parsed.text;
    }
  } catch {
    // The response may already be plain text.
  }

  const data = tryParseJson(text);
  return data === undefined ? { text } : { text: JSON.stringify(data, null, 2), data };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function formatScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
  }
  return String(value ?? '—');
}

function inferColumns(rows: JsonRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows.slice(0, 50)) {
    for (const [key, value] of Object.entries(row)) {
      if (isScalar(value)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const minimum = Math.max(1, Math.ceil(Math.min(rows.length, 50) * 0.5));
  return [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key]) => key);
}

function JsonTable({ rows }: { rows: JsonRecord[] }): React.ReactElement {
  const columns = inferColumns(rows);
  if (columns.length === 0) return <JsonValue value={rows} depth={1} forceList />;

  return (
    <div className="auto-json-table-wrap">
      <table className="auto-json-table">
        <thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 100).map((row, index) => (
            <tr key={index}>{columns.map(column => <td key={column} title={formatScalar(row[column])}>{formatScalar(row[column])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && <div className="auto-json-truncated">Showing 100 of {rows.length} rows</div>}
    </div>
  );
}

function JsonValue({ value, depth = 0, forceList = false }: { value: unknown; depth?: number; forceList?: boolean }): React.ReactElement {
  if (depth > 5) return <pre className="json-result"><code>{JSON.stringify(value, null, 2)}</code></pre>;
  if (isScalar(value)) return <span className={`json-scalar json-${value === null ? 'null' : typeof value}`}>{formatScalar(value)}</span>;

  if (Array.isArray(value)) {
    const records = value.filter(isRecord);
    if (!forceList && records.length === value.length && records.length > 0) return <JsonTable rows={records} />;
    return (
      <div className="auto-json-list">
        {value.map((item, index) => <div className="auto-json-list-item" key={index}><span className="auto-json-index">{index}</span><JsonValue value={item} depth={depth + 1} /></div>)}
      </div>
    );
  }

  if (isRecord(value)) {
    return (
      <div className="auto-json-object">
        {Object.entries(value).map(([key, item]) => (
          <div className="auto-json-field" key={key} data-nested={!isScalar(item)}>
            <span className="auto-json-key">{key}</span>
            <div className="auto-json-value"><JsonValue value={item} depth={depth + 1} /></div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="json-scalar">{String(value)}</span>;
}

function StructuredResult({ data }: { data: unknown }): React.ReactElement {
  return <div className="auto-json-view"><JsonValue value={data} /></div>;
}

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
  const parsed: ParsedOutput = error ? { text: error } : parseOutput(output || '');
  const text = parsed.text;

  if (!text) {
    return (
      <div className="mcp-result">
        <div className="mcp-result-content">
          <span className="mcp-result-empty">
            (no output)
          </span>
        </div>
      </div>
    );
  }

  const hasError = isError || !!error;
  return (
    <div className="mcp-result">
      <div className="mcp-result-content" data-error={hasError} style={{ maxHeight }}>
        {/* Header */}
        <div className="mcp-result-header" data-error={hasError}>
          <span className="mcp-result-status-dot" />
          {hasError ? 'Error' : 'Output'}
        </div>

        {/* Content - render as Markdown */}
        <div className="tool-result-markdown mcp-result-body">
          {parsed.data !== undefined ? <StructuredResult data={parsed.data} /> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
        </div>
      </div>
    </div>
  );
}

export default McpToolResult;
