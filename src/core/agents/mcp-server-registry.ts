/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MCP Server Registry - maps MCP server keys (the middle segment of
 * `mcp__<server>__<tool>` tool names) to their server instances.
 *
 * Used by agent-loader to resolve the `#MCP-TOOLS` section of an agent
 * definition's tools.md into actual MCP server instances.
 */

import { pythonMcpServer } from '../tools/python-mcp-server.js';
import { pdfMcpServer } from '../tools/pdf-mcp-server.js';
import { convertMcpServer } from '../tools/convert-mcp-server.js';
import { typescriptMcpServer } from '../tools/typescript-mcp-server.js';
import { imageMcpServer } from '../tools/image-mcp-server.js';
import { pptxMcpServer } from '../tools/pptx-mcp-server.js';
import { xlsxMcpServer } from '../tools/xlsx-mcp-server.js';
import { docxMcpServer } from '../tools/docx-mcp-server.js';
import { claudeMcpServer } from '../tools/claude-mcp-server.js';
import { browserMcpServer } from '../tools/browser-mcp-server.js';

export type McpServer = typeof pythonMcpServer;

export const MCP_SERVER_REGISTRY: Record<string, McpServer> = {
  python: pythonMcpServer,
  pdf: pdfMcpServer,
  convert: convertMcpServer,
  typescript: typescriptMcpServer,
  image: imageMcpServer,
  pptx: pptxMcpServer,
  xlsx: xlsxMcpServer,
  docx: docxMcpServer,
  claude: claudeMcpServer,
  browser: browserMcpServer,
};
