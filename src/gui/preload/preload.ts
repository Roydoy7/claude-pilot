/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Electron preload script - exposes safe APIs to renderer process
 * Updated for Claude-only architecture
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  ChatRequest,
  ChatResponse,
  CacheStats,
  ServiceInitRequest,
  ServiceInitResponse,
  TemplateCreateRequest,
  StreamEventData,
  SessionCreateRequest,
  SessionSwitchRequest,
  PermissionMode,
  SettingSource,
  AgentSummary,
} from './preload-types.js';
import type { Session } from '../../core/sessions/session-manager.js';
import type { PromptTemplate } from '../../core/templates/template-manager.js';
import type { ModelInfo, EffortLevel } from '../../core/providers/model-list-manager.js';
import type { AuthStatus, OAuthLoginOptions, OAuthResult } from '../../core/types/auth-types.js';
import type { AppSettings } from '../../core/settings/settings-manager.js';
import { IpcChannels, type ChannelMap } from '../../shared/ipc-channels.js';

/**
 * Type-safe wrapper around `ipcRenderer.invoke`. The channel name constrains
 * both the argument tuple and the resolved result type via `ChannelMap`.
 */
function invokeChannel<C extends keyof ChannelMap>(
  channel: C,
  ...args: ChannelMap[C]['args']
): Promise<ChannelMap[C]['result']> {
  return ipcRenderer.invoke(channel, ...args);
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic invoke for extensibility
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  // Utility
  ping: () => invokeChannel(IpcChannels.ping),

  // Service initialization
  service: {
    initialize: (request?: ServiceInitRequest): Promise<ServiceInitResponse> =>
      invokeChannel(IpcChannels.service.initialize, request || {}),

    isInitialized: (): Promise<boolean> =>
      invokeChannel(IpcChannels.service.isInitialized),
  },

  // Agent operations
  agent: {
    chat: (request: ChatRequest): Promise<ChatResponse> =>
      invokeChannel(IpcChannels.agent.chat, request),

    getCurrentInfo: () =>
      invokeChannel(IpcChannels.agent.getCurrentInfo),

    // Unified streaming event listener
    onStreamEvent: (callback: (data: StreamEventData) => void) => {
      ipcRenderer.on(IpcChannels.agent.streamEvent, (_event, data: StreamEventData) => {
        callback(data);
      });
    },

    cancelRequest: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.cancelRequest, sessionId),

    // Tool approval via canUseTool callback
    onToolApprovalRequest: (callback: (data: { sessionId: string; toolUseId: string; toolName: string; toolInput: Record<string, unknown> }) => void) => {
      ipcRenderer.on(IpcChannels.agent.toolApprovalRequest, (_event, data) => {
        callback(data);
      });
    },

    approveTool: (toolUseId: string, updatedInput?: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.approveTool, toolUseId, updatedInput),

    rejectTool: (toolUseId: string, message?: string): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.rejectTool, toolUseId, message),

    getPermissionMode: (sessionId?: string): Promise<{ success: boolean; mode: PermissionMode }> =>
      invokeChannel(IpcChannels.agent.getPermissionMode, sessionId),

    setPermissionMode: (mode: PermissionMode, sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.setPermissionMode, mode, sessionId),

    getSettingSources: (): Promise<{ success: boolean; sources: SettingSource[] }> =>
      invokeChannel(IpcChannels.agent.getSettingSources),

    setSettingSources: (sources: SettingSource[]): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.setSettingSources, sources),

    getModelName: (): Promise<{ success: boolean; modelName: string }> =>
      invokeChannel(IpcChannels.agent.getModelName),

    setModel: (model: string): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.setModel, model),

    getEffortLevel: (): Promise<{ success: boolean; effortLevel?: EffortLevel }> =>
      invokeChannel(IpcChannels.agent.getEffortLevel),

    setEffortLevel: (level: EffortLevel): Promise<{ success: boolean; error?: string }> =>
      invokeChannel(IpcChannels.agent.setEffortLevel, level),
  },

  // Session management
  session: {
    list: (): Promise<Session[]> =>
      invokeChannel(IpcChannels.session.list),

    getHistory: (sessionId: string) =>
      invokeChannel(IpcChannels.session.getHistory, sessionId),

    create: (request: SessionCreateRequest): Promise<ChatResponse> =>
      invokeChannel(IpcChannels.session.create, request),

    switch: (request: SessionSwitchRequest): Promise<ChatResponse> =>
      invokeChannel(IpcChannels.session.switch, request),

    delete: (sessionId: string): Promise<{ success: boolean; sessionId: string }> =>
      invokeChannel(IpcChannels.session.delete, sessionId),

    updateTitle: (sessionId: string, newTitle: string) =>
      invokeChannel(IpcChannels.session.updateTitle, sessionId, newTitle),

    getLastCwd: (): Promise<string> =>
      invokeChannel(IpcChannels.session.getLastCwd),

    addAdditionalDirectory: (sessionId: string, directory: string): Promise<{ success: boolean }> =>
      invokeChannel(IpcChannels.session.addAdditionalDirectory, sessionId, directory),

    removeAdditionalDirectory: (sessionId: string, directory: string): Promise<{ success: boolean }> =>
      invokeChannel(IpcChannels.session.removeAdditionalDirectory, sessionId, directory),

    getAdditionalDirectories: (sessionId: string): Promise<string[]> =>
      invokeChannel(IpcChannels.session.getAdditionalDirectories, sessionId),

    clearAdditionalDirectories: (sessionId: string): Promise<{ success: boolean }> =>
      invokeChannel(IpcChannels.session.clearAdditionalDirectories, sessionId),

    getFileTree: (sessionId: string) =>
      invokeChannel(IpcChannels.session.getFileTree, sessionId),
  },

  // Workspace management
  workspace: {
    selectDirectory: (): Promise<string | null> =>
      invokeChannel(IpcChannels.workspace.selectDirectory),

    list: (): Promise<string[]> =>
      invokeChannel(IpcChannels.workspace.list),

    add: (dir: string): Promise<boolean> =>
      invokeChannel(IpcChannels.workspace.add, dir),

    remove: (dir: string): Promise<boolean> =>
      invokeChannel(IpcChannels.workspace.remove, dir),

    clear: (): Promise<boolean> =>
      invokeChannel(IpcChannels.workspace.clear),

    update: (sessionId: string): Promise<ChatResponse> =>
      invokeChannel(IpcChannels.workspace.update, sessionId),

    getFileTree: () =>
      invokeChannel(IpcChannels.workspace.getFileTree),

    getFileTreeForDirectory: (directoryPath: string) =>
      invokeChannel(IpcChannels.workspace.getFileTreeForDirectory, directoryPath),
  },

  // Cache management
  cache: {
    getStats: (): Promise<CacheStats> =>
      invokeChannel(IpcChannels.cache.stats),
  },

  // Template management
  templates: {
    list: (): Promise<PromptTemplate[]> =>
      invokeChannel(IpcChannels.template.list),

    get: (id: string): Promise<PromptTemplate | undefined> =>
      invokeChannel(IpcChannels.template.get, id),

    create: (request: TemplateCreateRequest): Promise<PromptTemplate> =>
      invokeChannel(IpcChannels.template.create, request),

    update: (id: string, updates: { name?: string; content?: string }): Promise<PromptTemplate> =>
      invokeChannel(IpcChannels.template.update, { id, updates }),

    delete: (id: string): Promise<boolean> =>
      invokeChannel(IpcChannels.template.delete, id),
  },

  // Model management - Claude only
  models: {
    list: (options?: { forceRefresh?: boolean }): Promise<ModelInfo[]> =>
      invokeChannel(IpcChannels.models.list, options),

    getDefault: (): Promise<string> =>
      invokeChannel(IpcChannels.models.getDefault),
  },

  // Authentication - Claude only
  auth: {
    isAuthenticated: (): Promise<AuthStatus> =>
      invokeChannel(IpcChannels.auth.isAuthenticated),

    loginWithOAuth: (options: OAuthLoginOptions): Promise<OAuthResult> =>
      invokeChannel(IpcChannels.auth.loginWithOAuth, options),

    logout: (): Promise<{ success: boolean }> =>
      invokeChannel(IpcChannels.auth.logout),

    getOAuthInfo: () =>
      invokeChannel(IpcChannels.auth.getOAuthInfo),
  },

  // Settings management
  settings: {
    get: (): Promise<AppSettings> =>
      invokeChannel(IpcChannels.settings.get),

    update: (updates: Partial<AppSettings>): Promise<{ success: boolean }> =>
      invokeChannel(IpcChannels.settings.update, updates),

    hasSettings: (): Promise<boolean> =>
      invokeChannel(IpcChannels.settings.hasSettings),

    reset: (): Promise<{ success: boolean }> =>
      invokeChannel(IpcChannels.settings.reset),
  },

  // Agent definitions
  agents: {
    list: (): Promise<AgentSummary[]> =>
      invokeChannel(IpcChannels.agents.list),
  },

  // Browser
  browser: {
    navigate: (url: string) =>
      invokeChannel(IpcChannels.browser.navigate, url),

    goBack: () =>
      invokeChannel(IpcChannels.browser.goBack),

    goForward: () =>
      invokeChannel(IpcChannels.browser.goForward),

    reload: () =>
      invokeChannel(IpcChannels.browser.reload),

    screenshot: () =>
      invokeChannel(IpcChannels.browser.screenshot),

    getContent: (selector?: string) =>
      invokeChannel(IpcChannels.browser.getContent, selector),

    click: (x: number, y: number) =>
      invokeChannel(IpcChannels.browser.click, x, y),

    type: (text: string) =>
      invokeChannel(IpcChannels.browser.type, text),

    executeJS: (code: string) =>
      invokeChannel(IpcChannels.browser.executeJS, code),

    getUrl: () =>
      invokeChannel(IpcChannels.browser.getUrl),

    // Main process asks the renderer to open the Browser tab (e.g. when an
    // agent invokes a browser tool while the pane is closed)
    onShowRequest: (callback: () => void) => {
      ipcRenderer.on('browser:show', () => callback());
    },

    // Tab commands (switch/new/close) issued by agent browser tools
    onCommand: (callback: (command: { type: 'switch' | 'new' | 'close'; tabId?: number; url?: string }) => void) => {
      ipcRenderer.on('browser:command', (_event, command) => callback(command));
    },
  },

  // Dialogs
  dialog: {
    confirm: (message: string): Promise<boolean> =>
      invokeChannel(IpcChannels.dialog.confirm, message),
  },
});
