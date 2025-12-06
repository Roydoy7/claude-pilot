/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * English translations - Input Area
 */

export const inputAreaEn = {
  placeholder: 'Type a message',
  browseWorkspace: 'Browse Workspace Files',
  bold: 'Bold',
  italic: 'Italic',
  code: 'Code',
  clear: 'Clear',
  uploadImage: 'Upload Image',
  cancelRequest: 'Cancel Request',
  sendMessage: 'Send (Enter)',
  removeImage: 'Remove image',
  permissionMode: {
    label: 'Permission Mode',
    modes: {
      default: {
        name: 'Default',
        description: 'Ask before file edits and dangerous operations',
      },
      acceptEdits: {
        name: 'Accept Edits',
        description: 'Auto-approve file edits, but ask for other dangerous operations (e.g., Bash commands)',
      },
      bypassPermissions: {
        name: 'Bypass Permissions',
        description: 'Auto-approve all operations including file edits and Bash commands (YOLO mode)',
      },
      plan: {
        name: 'Plan',
        description: 'Analysis and planning only, no file modifications allowed',
      },
      dontAsk: {
        name: "Don't Ask",
        description: 'Silent mode - skip all confirmation prompts, used for automation scenarios',
      },
    },
  },
  settingSources: {
    label: 'Setting Sources',
    sources: {
      user: {
        name: 'User',
        description: 'User-level settings (~/.claude/settings.json)',
      },
      project: {
        name: 'Project',
        description: 'Project-level settings (CLAUDE.md files)',
      },
      local: {
        name: 'Local',
        description: 'Local settings (.claude/settings.local.json)',
      },
    },
  },
};
