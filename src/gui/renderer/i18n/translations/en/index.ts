/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * English translations - Index
 */

import type { Translation } from '../../types';
import { commonEn } from './common';
import { headerEn } from './header';
import { sessionConfigEn } from './session-config';
import { inputAreaEn } from './input-area';
import { leftSidebarEn } from './left-sidebar';
import { rightPanelEn } from './right-panel';
import { workspaceBrowserEn } from './workspace-browser';
import { settingsEn } from './settings';
import { suggestionsEn } from './suggestions';

export const enTranslations: Translation = {
  common: commonEn,
  header: headerEn,
  sessionConfig: sessionConfigEn,
  inputArea: inputAreaEn,

  // Message
  message: {
    saveAsTemplate: 'Save as template',
    saved: 'Saved!',
    attachment: (index: number) => `Attachment ${index + 1}`,
    tokens: {
      input: 'Input tokens (new)',
      output: 'Output tokens',
      total: 'Total tokens',
      cacheHit: (count: number) => `Cache hit: ${count} tokens read from cache (90% cost savings)`,
      cacheWrite: (count: number) => `Cache write: ${count} tokens written to cache (25% cost increase)`,
      cache5min: '5-minute cache',
      cache1hour: '1-hour cache (Max tier)',
      serviceTier: (tier: string) => `Service tier: ${tier}`,
    },
    stats: {
      duration: 'Duration',
      cost: 'Cost for this turn (USD)',
      turns: 'Number of turns',
      model: 'Model used',
    },
  },

  // Message List
  messageList: {
    noMessages: 'No messages yet. Start a conversation!',
    newMessages: 'New messages',
    scrollToBottom: 'Scroll to bottom',
    usageLimitReached: 'Usage limit reached',
    assistant: 'Assistant',
  },

  // Compact Summary
  compactSummary: {
    title: 'Conversation Summary',
    continuedFrom: 'Continued from previous context',
    expand: 'Show full summary',
    collapse: 'Show less',
  },

  taskNotification: {
    outputFile: 'Output file',
    tokens: 'tokens',
    toolUses: 'tool uses',
    duration: 'duration',
  },

  // Tool Call
  toolCall: {
    showCode: 'Show Code',
    hideCode: 'Hide Code',
    showResult: 'Show Result',
    hideResult: 'Hide Result',
    showDetails: 'Show Details',
    hideDetails: 'Hide Details',
    showTasks: 'Show Tasks',
    hideTasks: 'Hide Tasks',
    error: '❌ Error:',
    output: '✅ Output:',
    agentType: '🎯 Agent Type:',
    requirements: '📦 **Requirements:**',
    workingDirectory: '📁 **Working Directory:**',
    file: 'File:',
    operation: 'Operation:',
    pages: 'Pages:',
    query: 'Query:',
    outputFile: 'Output:',
    sources: 'Sources:',
  },

  // Status
  status: {
    aiThinking: 'AI is thinking...',
    aiThinkingWithTokens: (tokens: number) => `AI is thinking... (~${tokens} tokens)`,
    executingTool: (toolName: string) => `Executing ${toolName}...`,
    waitingForApproval: 'Waiting for tool approval',
    messageQueued: 'Message queued, waiting...',
    subagentRunning: (name: string, action?: string, elapsedSeconds?: number) =>
      `Subagent ${name} running${action ? ` — ${action}` : ''}${elapsedSeconds ? ` (${elapsedSeconds}s)` : ''}`,
    apiRetrying: (attempt: number, maxRetries: number, delaySeconds: number, errorStatus?: number | null) =>
      `API request failed${errorStatus ? ` (HTTP ${errorStatus})` : ''} — retrying in ${delaySeconds}s (attempt ${attempt}/${maxRetries})`,
    commands: {
      compact: 'Compacting conversation...',
      clear: 'Clearing conversation...',
      help: 'Loading help...',
      model: 'Switching model...',
      config: 'Loading configuration...',
      init: 'Initializing project...',
      resume: 'Resuming session...',
      memory: 'Managing memory...',
      mcp: 'Managing MCP servers...',
      permissions: 'Managing permissions...',
    },
  },

  // Workspace Browser
  workspaceBrowser: workspaceBrowserEn,

  // Left Sidebar
  leftSidebar: leftSidebarEn,

  // Right Panel - Including all tab translations
  rightPanel: {
    context: rightPanelEn.context,
    workspace: rightPanelEn.workspace,
    prompts: rightPanelEn.prompts,
    skills: rightPanelEn.skills,
    browser: rightPanelEn.browser,
    closePanel: rightPanelEn.closePanel,
    browserTab: rightPanelEn.browserTab,
    promptsTab: rightPanelEn.promptsTab,
    workspaceTab: rightPanelEn.workspaceTab,
    skillsTab: rightPanelEn.skillsTab,
  },

  // Template Editor
  templateEditor: {
    title: 'Edit Template',
    namePlaceholder: 'Template name...',
    contentPlaceholder: 'Enter your prompt template content here...\n\nSupports Markdown:\n- **bold**, *italic*\n- # Headers\n- - Lists\n- ```code blocks```\n- [links](url)',
    edit: 'Edit',
    preview: 'Preview',
    bold: 'Bold',
    italic: 'Italic',
    codeBlock: 'Code Block',
    inlineCode: 'Inline Code',
    link: 'Link',
    bulletList: 'Bullet List',
    numberedList: 'Numbered List',
    heading: 'Heading',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving...',
    noContent: 'No content yet',
  },

  // Error Messages
  errors: {
    failedToCancel: 'Failed to cancel request',
    failedToCreateSession: 'Failed to create session',
    failedToLoadModels: 'Failed to load models and auth',
    failedToUpdateTitle: 'Failed to update session title',
    failedToSendMessage: 'Failed to send message',
    failedToSaveTemplate: 'Failed to save template',
    failedToDeleteTemplate: 'Failed to delete template',
    failedToDeleteAllTemplates: 'Failed to delete all templates',
    failedToDeleteSession: 'Failed to delete session',
    failedToLoadSessions: 'Failed to load sessions',
    failedToLoadTemplates: 'Failed to load templates',
    failedToLoadWorkspaces: 'Failed to load workspace trees',
    failedToAddWorkspace: 'Failed to add workspace',
    failedToRemoveWorkspace: 'Failed to remove workspace',
    failedToApplyWorkspaces: 'Failed to apply workspaces',
    failedToReadImage: 'Failed to read image file',
    failedToPasteImage: 'Failed to read pasted image',
  },

  // Settings Dialog
  settings: settingsEn,

  // Prompt Suggestions
  suggestions: suggestionsEn,
};
