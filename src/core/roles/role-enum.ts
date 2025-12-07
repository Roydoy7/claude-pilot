/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Agent role enumeration
 */

export enum RoleType {
  // Office productivity
  OFFICE_ASSISTANT = 'office-assistant',

  // Claude code
  CLAUDE_CODE = 'claude-code',
}

/**
 * Display names for each role
 */
export const ROLE_DISPLAY_NAMES: Record<RoleType, string> = {
  [RoleType.OFFICE_ASSISTANT]: 'Office Assistant',
  [RoleType.CLAUDE_CODE]: 'Claude Code',
};

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role: RoleType): string {
  return ROLE_DISPLAY_NAMES[role];
}