/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Role Tool Sets - Configure allowed tools for each role
 * Provides tool configuration for Claude Agent SDK
 *
 * Two types of tool lists:
 * - availableTools: All tools the role can use (passed to SDK as 'tools')
 * - autoApprovedTools: Safe tools that don't require user approval (passed as 'allowedTools')
 *
 * MCP Servers:
 * - Custom tools provided via MCP servers (e.g., Python execution)
 */

import { RoleType } from './role-enum.js';
import { pythonMcpServer } from '../tools/python-mcp-server.js';
import { pdfMcpServer } from '../tools/pdf-mcp-server.js';

/**
 * All available Claude SDK built-in tools
 */
export const ALL_SDK_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
] as const;

/**
 * Safe read-only tools that don't modify files or execute commands
 * These are auto-approved and won't trigger canUseTool callback
 */
const SAFE_READ_TOOLS = ['Read', 'Glob', 'Grep'] as const;

/**
 * Safe web tools (read-only web operations)
 */
const SAFE_WEB_TOOLS = ['WebFetch', 'WebSearch'] as const;

/**
 * Dangerous tools that require user approval
 * - Write/Edit: Modify files
 * - Bash: Execute arbitrary commands
 * - TodoWrite: Modify todo state (less dangerous but still modifying)
 */
const DANGEROUS_TOOLS = ['Write', 'Edit', 'Bash', 'TodoWrite'] as const;

/**
 * Full file operation tools (read + write)
 */
const FILE_TOOLS = [...SAFE_READ_TOOLS, 'Write', 'Edit'] as const;

/**
 * Skill
 */
const SKILL = ['Skill'] as const;

/**
 * Available tools for each role (what tools the agent CAN use)
 * Passed to SDK as 'tools' parameter
 */
export const ROLE_AVAILABLE_TOOLS: Record<RoleType, readonly string[]> = {
  [RoleType.OFFICE_ASSISTANT]: [
    ...ALL_SDK_TOOLS,
  ],

  [RoleType.CLAUDE_CODE]: [
    ...ALL_SDK_TOOLS,
  ],
};

/**
 * Auto-approved tools for each role (what tools DON'T need user approval)
 * Passed to SDK as 'allowedTools' parameter - these bypass canUseTool callback
 */
export const ROLE_AUTO_APPROVED_TOOLS: Record<RoleType, readonly string[]> = {
  [RoleType.OFFICE_ASSISTANT]: [
    ...SAFE_READ_TOOLS,
    ...SAFE_WEB_TOOLS,
    ...SKILL,
  ],

  [RoleType.CLAUDE_CODE]: [
    ...SAFE_READ_TOOLS,
    ...SAFE_WEB_TOOLS,
    ...SKILL,
  ],
};

/**
 * Legacy: Get all allowed tools for a role (for backward compatibility)
 * @deprecated Use getAvailableTools and getAutoApprovedTools instead
 */
export const ROLE_ALLOWED_TOOLS = ROLE_AVAILABLE_TOOLS;

/**
 * Get the available tools for a specific role
 * These are the tools the agent CAN use
 */
export function getAvailableTools(role: RoleType): readonly string[] {
  return ROLE_AVAILABLE_TOOLS[role];
}

/**
 * Get the auto-approved tools for a specific role
 * These tools don't require user approval (bypass canUseTool)
 */
export function getAutoApprovedTools(role: RoleType): readonly string[] {
  return ROLE_AUTO_APPROVED_TOOLS[role];
}

/**
 * MCP Server type - use typeof to get the actual type
 */
type McpServer = typeof pythonMcpServer;

/**
 * MCP servers configuration for each role
 * Key is the server name, value is the server instance
 */
export const ROLE_MCP_SERVERS: Record<RoleType, Record<string, McpServer>> = {
  [RoleType.OFFICE_ASSISTANT]: {
    python: pythonMcpServer,
    pdf: pdfMcpServer,
  },

  [RoleType.CLAUDE_CODE]: {},
};

/**
 * Get MCP servers for a specific role
 */
export function getMcpServers(role: RoleType): Record<string, McpServer> {
  return ROLE_MCP_SERVERS[role];
}
