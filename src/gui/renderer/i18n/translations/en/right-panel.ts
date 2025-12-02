/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * English translations - Right Panel (Sessions, Prompts, Workspace tabs)
 */

export const rightPanelEn = {
  // Tab labels
  sessions: 'Sessions',
  workspace: 'Workspace',
  prompts: 'Prompts',
  closePanel: 'Close Panel',

  // Sessions Tab
  sessionsTab: {
    loading: 'Loading sessions...',
    newSession: '+ New Session',
    noSessions: 'No sessions yet. Create one to get started!',
    newSessionFallback: 'New Session',
    deleteAllTooltip: (count: number) => `Delete all ${count} sessions`,
    noSessionsToDelete: 'No sessions to delete',
    deleteAllConfirm: (count: number) =>
      `Are you sure you want to delete all ${count} sessions? This action cannot be undone.`,
    deleteSessionConfirm: 'Are you sure you want to delete this session?',
  },

  // Prompts Tab
  promptsTab: {
    title: 'Prompt Templates',
    description: 'Click a template to apply it to your input',
    newTemplate: 'New Template',
    clearAll: 'Clear All',
    noTemplates: 'No templates yet',
    editTooltip: 'Edit template',
    deleteTooltip: 'Delete template',
    deleteConfirm: 'Are you sure you want to delete this template?',
    deleteAllConfirm: (count: number) =>
      `Are you sure you want to delete all ${count} templates? This action cannot be undone.`,
  },

  // Workspace Tab
  workspaceTab: {
    title: 'Workspaces',
    description: 'Add workspace folders to allow AI to access and work with your local files',
    pending: (count: number) => `Pending (${count})`,
    applied: (count: number) => `Applied (${count})`,
    addWorkspace: '+ Add Workspace',
    applyToSession: 'Apply to Session',
    removeTooltip: 'Remove workspace',
    noSessionTooltip: 'No active session - start a new session first',
    addWorkspacesTooltip: 'Add workspaces above to apply them',
    applyWorkspacesTooltip: 'Apply pending workspaces to current session',
    noSessionWarning: '⚠️ No active session. Start a new session to apply workspaces.',
    addWorkspacesInfo: 'ℹ️ Add new workspaces above to apply them to the current session.',
    workspaceLabel: (index: number) => `workspace${index}`,
  },
};
