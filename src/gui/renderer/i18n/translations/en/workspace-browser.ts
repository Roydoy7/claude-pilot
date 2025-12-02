/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * English translations - Workspace Browser
 */

export const workspaceBrowserEn = {
  title: 'Browse Workspace Files',
  description: 'Select files or folders to insert their paths into your message. Use this to tell the AI which files to work with.',
  addWorkspace: 'Add Workspace',
  addWorkspaceTooltip: 'Add a new workspace directory',
  loading: 'Loading workspace files...',
  noWorkspacesTitle: 'No Workspaces Configured',
  noWorkspacesDescription: 'Click "Add Workspace" above to add a directory that the AI can access.',
  workspaceLabel: (index: number) => `Workspace ${index}`,
  remove: 'Remove',
  removeTooltip: 'Remove this workspace',
  failedToRead: 'Failed to read directory',
  selectedCount: (count: number) => `${count} item${count !== 1 ? 's' : ''} selected`,
  clearSelection: 'Clear Selection',
  insertPaths: 'Insert Paths',
  close: 'Close',
};
