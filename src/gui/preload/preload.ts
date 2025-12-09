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
  UsageMetadata,
  StreamEventData,
  SessionCreateRequest,
  SessionSwitchRequest,
  PermissionMode,
  SettingSource,
} from './preload-types.js';
import type { Session } from '../../core/sessions/session-manager.js';
import type { PromptTemplate } from '../../core/templates/template-manager.js';
import type { ModelInfo } from '../../core/providers/model-list-manager.js';
import type { AuthStatus, OAuthLoginOptions, OAuthResult } from '../../core/types/auth-types.js';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic invoke for extensibility
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  // Utility
  ping: () => ipcRenderer.invoke('ping'),

  // Service initialization
  service: {
    initialize: (request?: ServiceInitRequest): Promise<ServiceInitResponse> =>
      ipcRenderer.invoke('service:initialize', request || {}),

    isInitialized: (): Promise<boolean> =>
      ipcRenderer.invoke('service:isInitialized'),
  },

  // Agent operations
  agent: {
    chat: (request: ChatRequest): Promise<ChatResponse> =>
      ipcRenderer.invoke('agent:chat', request),

    getCurrentInfo: () =>
      ipcRenderer.invoke('agent:getCurrentInfo'),

    // Unified streaming event listener
    onStreamEvent: (callback: (data: StreamEventData) => void) => {
      ipcRenderer.on('agent:streamEvent', (_event, data: StreamEventData) => {
        callback(data);
      });
    },

    cancelRequest: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:cancelRequest', sessionId),

    // Tool approval via canUseTool callback
    onToolApprovalRequest: (callback: (data: { sessionId: string; toolUseId: string; toolName: string; toolInput: Record<string, unknown> }) => void) => {
      ipcRenderer.on('agent:toolApprovalRequest', (_event, data) => {
        callback(data);
      });
    },

    approveTool: (toolUseId: string, updatedInput?: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:approveTool', toolUseId, updatedInput),

    rejectTool: (toolUseId: string, message?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:rejectTool', toolUseId, message),

    getPermissionMode: (): Promise<{ success: boolean; mode: PermissionMode }> =>
      ipcRenderer.invoke('agent:getPermissionMode'),

    setPermissionMode: (mode: PermissionMode): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:setPermissionMode', mode),

    getSettingSources: (): Promise<{ success: boolean; sources: SettingSource[] }> =>
      ipcRenderer.invoke('agent:getSettingSources'),

    setSettingSources: (sources: SettingSource[]): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:setSettingSources', sources),
  },

  // Session management
  session: {
    list: (): Promise<Session[]> =>
      ipcRenderer.invoke('session:list'),

    getHistory: (sessionId: string): Promise<Array<{ role: string; content: string; timestamp?: number; usage?: UsageMetadata }>> =>
      ipcRenderer.invoke('session:getHistory', sessionId),

    create: (request: SessionCreateRequest): Promise<ChatResponse> =>
      ipcRenderer.invoke('session:create', request),

    switch: (request: SessionSwitchRequest): Promise<ChatResponse> =>
      ipcRenderer.invoke('session:switch', request),

    delete: (sessionId: string): Promise<{ success: boolean; sessionId: string }> =>
      ipcRenderer.invoke('session:delete', sessionId),

    updateTitle: (sessionId: string, newTitle: string) =>
      ipcRenderer.invoke('session:updateTitle', sessionId, newTitle),

    getLastCwd: (): Promise<string> =>
      ipcRenderer.invoke('session:getLastCwd'),

    addAdditionalDirectory: (sessionId: string, directory: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('session:addAdditionalDirectory', sessionId, directory),

    removeAdditionalDirectory: (sessionId: string, directory: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('session:removeAdditionalDirectory', sessionId, directory),

    getAdditionalDirectories: (sessionId: string): Promise<string[]> =>
      ipcRenderer.invoke('session:getAdditionalDirectories', sessionId),

    clearAdditionalDirectories: (sessionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('session:clearAdditionalDirectories', sessionId),

    getFileTree: (sessionId: string): Promise<Array<{
      directoryType: 'cwd' | 'additional';
      directoryPath: string;
      directoryLabel: string;
      tree: {
        name: string;
        path: string;
        type: 'file' | 'directory';
        children?: unknown[];
      } | null;
    }>> =>
      ipcRenderer.invoke('session:getFileTree', sessionId),
  },

  // Workspace management
  workspace: {
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('workspace:selectDirectory'),

    list: (): Promise<string[]> =>
      ipcRenderer.invoke('workspace:list'),

    add: (dir: string): Promise<boolean> =>
      ipcRenderer.invoke('workspace:add', dir),

    remove: (dir: string): Promise<boolean> =>
      ipcRenderer.invoke('workspace:remove', dir),

    clear: (): Promise<boolean> =>
      ipcRenderer.invoke('workspace:clear'),

    update: (sessionId: string): Promise<ChatResponse> =>
      ipcRenderer.invoke('workspace:update', sessionId),

    getFileTree: (): Promise<Array<{
      workspaceIndex: number;
      workspacePath: string;
      tree: {
        name: string;
        path: string;
        type: 'file' | 'directory';
        children?: unknown[];
      } | null;
    }>> =>
      ipcRenderer.invoke('workspace:getFileTree'),
  },

  // Cache management
  cache: {
    getStats: (): Promise<CacheStats> =>
      ipcRenderer.invoke('cache:stats'),
  },

  // Template management
  templates: {
    list: (): Promise<PromptTemplate[]> =>
      ipcRenderer.invoke('template:list'),

    get: (id: string): Promise<PromptTemplate | undefined> =>
      ipcRenderer.invoke('template:get', id),

    create: (request: TemplateCreateRequest): Promise<PromptTemplate> =>
      ipcRenderer.invoke('template:create', request),

    update: (id: string, updates: { name?: string; content?: string }): Promise<PromptTemplate> =>
      ipcRenderer.invoke('template:update', { id, updates }),

    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('template:delete', id),
  },

  // Model management - Claude only
  models: {
    list: (options?: { apiKey?: string; forceRefresh?: boolean }): Promise<ModelInfo[]> =>
      ipcRenderer.invoke('models:list', options),

    getDefault: (): Promise<string> =>
      ipcRenderer.invoke('models:getDefault'),
  },

  // Authentication - Claude only
  auth: {
    isAuthenticated: (): Promise<AuthStatus> =>
      ipcRenderer.invoke('auth:isAuthenticated'),

    loginWithOAuth: (options: OAuthLoginOptions): Promise<OAuthResult> =>
      ipcRenderer.invoke('auth:loginWithOAuth', options),

    logout: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('auth:logout'),

    getOAuthInfo: (): Promise<{
      authenticated: boolean;
      subscriptionType?: string | null;
      expiresAt?: number;
      scopes?: string[];
    }> =>
      ipcRenderer.invoke('auth:getOAuthInfo'),
  },
});
