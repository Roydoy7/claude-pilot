/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MCP Tool Renderer - Generic renderer for MCP tools
 * Used for: image, pptx, xlsx, and other MCP tools
 */

import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, isMcpToolError } from './types';
import { McpToolResult } from './McpToolResult';
import type { ToolResponse } from '../../../../preload/preload-types';

/**
 * Create a generic MCP tool renderer with custom icon and inline text
 */
export function createMcpRenderer(
  icon: string,
  getInlineText: (args: ToolArgs) => string = () => ''
): ToolConfig {
  return {
    icon,
    getInlineText,
    hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => !!response,

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

      return (
        <McpToolResult
          output={response.output}
          error={response.error}
          isError={isMcpToolError(response)}
        />
      );
    },
  };
}

// Pre-defined MCP tool renderers
export const imageRenderer = createMcpRenderer('🖼️', (args) => {
  const op = args.operation || '';
  if (op === 'download' && args.url) return `Downloading image...`;
  if (op === 'resize') return `Resizing image...`;
  if (op === 'convert') return `Converting image...`;
  return String(op);
});

export const pptxRenderer = createMcpRenderer('📊', (args) => {
  const op = args.operation || '';
  if (op === 'create' && args.outputPath) {
    const fileName = String(args.outputPath).split(/[/\\]/).pop() || '';
    return `Creating ${fileName}`;
  }
  return String(op);
});

export const xlsxRenderer = createMcpRenderer('📈', (args) => {
  const op = args.operation || '';
  if (args.filePath) {
    const fileName = String(args.filePath).split(/[/\\]/).pop() || '';
    return `${op} ${fileName}`;
  }
  return String(op);
});

// Default renderer for unknown MCP tools
export const defaultMcpRenderer = createMcpRenderer('🔧');
