/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Role Tool Sets - Configure allowed tools for each role
 * Provides allowedTools configuration for Claude Agent SDK
 */

import { RoleType } from './role-enum.js';

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
 * Full file operation tools (including write)
 */
const FILE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep'] as const;

/**
 * Web tools
 */
const WEB_TOOLS = ['WebFetch', 'WebSearch'] as const;

/**
 * Allowed tools for each role
 */
export const ROLE_ALLOWED_TOOLS: Record<RoleType, readonly string[]> = {
  [RoleType.OFFICE_ASSISTANT]: [
    ...ALL_SDK_TOOLS,
  ],

  [RoleType.TRANSLATOR]: [
    ...ALL_SDK_TOOLS,
  ],
};

/**
 * Get the allowed tools for a specific role
 */
export function getAllowedTools(role: RoleType): readonly string[] {
  return ROLE_ALLOWED_TOOLS[role];
}

/**
 * Check if a role can use a specific tool
 */
export function canUseTool(role: RoleType, toolName: string): boolean {
  return ROLE_ALLOWED_TOOLS[role].includes(toolName);
}
