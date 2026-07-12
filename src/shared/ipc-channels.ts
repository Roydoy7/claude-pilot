/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Shared IPC channel name constants and the typed request/response
 * contract between the main process (ipc-handlers.ts) and the
 * preload/renderer processes (preload.ts, preload-types.ts).
 *
 * Channel name strings are copied verbatim from the existing
 * ipcMain.handle()/ipcRenderer.invoke() literals - this file is a
 * pure rename, not a behavior change.
 */

import type {
  ServiceInitRequest,
  ServiceInitResponse,
  ChatRequest,
  ChatResponse,
  CacheStats,
  TemplateCreateRequest,
  TemplateUpdateRequest,
  SessionCreateRequest,
  SessionSwitchRequest,
  ToolApprovalRequestEvent,
  StreamEventData,
  FileTreeNode,
  CurrentAgentInfo,
  AgentSummary,
  PermissionMode,
  SettingSource,
} from '../gui/preload/preload-types.js';
import type { HistoryMessage } from '../core/agents/claude-agent.js';
import type { Session } from '../core/sessions/session-manager.js';
import type { PromptTemplate } from '../core/templates/template-manager.js';
import type { ModelInfo, EffortLevel } from '../core/providers/model-list-manager.js';
import type { AuthStatus, OAuthLoginOptions, OAuthResult } from '../core/types/auth-types.js';
import type { AppSettings } from '../core/settings/settings-manager.js';
import type { SkillMarketplace, AvailableSkill, InstalledSkillInfo } from '../core/skills/skill-types.js';

/**
 * File tree result for a single session/workspace directory
 * (session:getFileTree, workspace:getFileTreeForDirectory)
 */
export interface DirectoryFileTree {
  directoryType: 'cwd' | 'additional';
  directoryPath: string;
  directoryLabel: string;
  tree: FileTreeNode | null;
}

/**
 * File tree result for a configured workspace (workspace:getFileTree)
 */
export interface WorkspaceFileTree {
  workspaceIndex: number;
  workspacePath: string;
  tree: FileTreeNode | null;
}

/**
 * All IPC channel name constants, grouped by domain.
 * Names are verbatim copies of the existing channel string literals.
 */
export const IpcChannels = {
  ping: 'ping',
  service: {
    initialize: 'service:initialize',
    isInitialized: 'service:isInitialized',
  },
  agent: {
    chat: 'agent:chat',
    getCurrentInfo: 'agent:getCurrentInfo',
    streamEvent: 'agent:streamEvent',
    cancelRequest: 'agent:cancelRequest',
    toolApprovalRequest: 'agent:toolApprovalRequest',
    approveTool: 'agent:approveTool',
    rejectTool: 'agent:rejectTool',
    getPermissionMode: 'agent:getPermissionMode',
    setPermissionMode: 'agent:setPermissionMode',
    getSettingSources: 'agent:getSettingSources',
    setSettingSources: 'agent:setSettingSources',
    getModelName: 'agent:getModelName',
    setModel: 'agent:setModel',
    getEffortLevel: 'agent:getEffortLevel',
    setEffortLevel: 'agent:setEffortLevel',
  },
  session: {
    list: 'session:list',
    getHistory: 'session:getHistory',
    create: 'session:create',
    switch: 'session:switch',
    delete: 'session:delete',
    updateTitle: 'session:updateTitle',
    getLastCwd: 'session:getLastCwd',
    addAdditionalDirectory: 'session:addAdditionalDirectory',
    removeAdditionalDirectory: 'session:removeAdditionalDirectory',
    getAdditionalDirectories: 'session:getAdditionalDirectories',
    clearAdditionalDirectories: 'session:clearAdditionalDirectories',
    getFileTree: 'session:getFileTree',
  },
  workspace: {
    selectDirectory: 'workspace:selectDirectory',
    list: 'workspace:list',
    add: 'workspace:add',
    remove: 'workspace:remove',
    clear: 'workspace:clear',
    update: 'workspace:update',
    getFileTree: 'workspace:getFileTree',
    getFileTreeForDirectory: 'workspace:getFileTreeForDirectory',
  },
  cache: {
    stats: 'cache:stats',
  },
  template: {
    list: 'template:list',
    get: 'template:get',
    create: 'template:create',
    update: 'template:update',
    delete: 'template:delete',
  },
  models: {
    list: 'models:list',
    getDefault: 'models:getDefault',
  },
  auth: {
    isAuthenticated: 'auth:isAuthenticated',
    loginWithOAuth: 'auth:loginWithOAuth',
    logout: 'auth:logout',
    getOAuthInfo: 'auth:getOAuthInfo',
  },
  skills: {
    getData: 'skills:getData',
    fetchMarketplace: 'skills:fetchMarketplace',
    install: 'skills:install',
    uninstall: 'skills:uninstall',
    setGlobalEnabled: 'skills:setGlobalEnabled',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    hasSettings: 'settings:hasSettings',
    reset: 'settings:reset',
  },
  agents: {
    list: 'agents:list',
  },
  browser: {
    navigate: 'browser:navigate',
    goBack: 'browser:goBack',
    goForward: 'browser:goForward',
    reload: 'browser:reload',
    screenshot: 'browser:screenshot',
    getContent: 'browser:getContent',
    click: 'browser:click',
    type: 'browser:type',
    executeJS: 'browser:executeJS',
    getUrl: 'browser:getUrl',
  },
  dialog: {
    confirm: 'dialog:confirm',
  },
} as const;

/**
 * Maps every IPC channel name to its invoke argument tuple and result type.
 * `agent:streamEvent` and `agent:toolApprovalRequest` are main->renderer push
 * events (webContents.send / ipcRenderer.on), not invoke/handle channels;
 * `result: void` reflects that they have no return value.
 */
export interface ChannelMap {
  ping: { args: []; result: string };

  // Service
  'service:initialize': { args: [request?: ServiceInitRequest]; result: ServiceInitResponse };
  'service:isInitialized': { args: []; result: boolean };

  // Agent
  'agent:chat': { args: [request: ChatRequest]; result: ChatResponse };
  'agent:getCurrentInfo': { args: []; result: CurrentAgentInfo | null };
  'agent:streamEvent': { args: [data: StreamEventData]; result: void };
  'agent:cancelRequest': { args: [sessionId?: string]; result: { success: boolean; error?: string } };
  'agent:toolApprovalRequest': { args: [data: ToolApprovalRequestEvent]; result: void };
  'agent:approveTool': { args: [toolUseId: string, updatedInput?: Record<string, unknown>]; result: { success: boolean; error?: string } };
  'agent:rejectTool': { args: [toolUseId: string, message?: string]; result: { success: boolean; error?: string } };
  'agent:getPermissionMode': { args: []; result: { success: boolean; mode: PermissionMode } };
  'agent:setPermissionMode': { args: [mode: PermissionMode]; result: { success: boolean; error?: string } };
  'agent:getSettingSources': { args: []; result: { success: boolean; sources: SettingSource[] } };
  'agent:setSettingSources': { args: [sources: SettingSource[]]; result: { success: boolean; error?: string } };
  'agent:getModelName': { args: []; result: { success: boolean; modelName: string } };
  'agent:setModel': { args: [model: string]; result: { success: boolean; error?: string } };
  'agent:getEffortLevel': { args: []; result: { success: boolean; effortLevel?: EffortLevel } };
  'agent:setEffortLevel': { args: [level: EffortLevel]; result: { success: boolean; error?: string } };

  // Session
  'session:list': { args: []; result: Session[] };
  'session:getHistory': { args: [sessionId: string]; result: HistoryMessage[] };
  'session:create': { args: [request: SessionCreateRequest]; result: { success: boolean; session?: Session; error?: string } };
  'session:switch': { args: [request: SessionSwitchRequest]; result: ChatResponse };
  'session:delete': { args: [sessionId: string]; result: { success: boolean; sessionId: string } };
  'session:updateTitle': { args: [sessionId: string, newTitle: string]; result: { success: boolean; session: Session } };
  'session:getLastCwd': { args: []; result: string };
  'session:addAdditionalDirectory': { args: [sessionId: string, directory: string]; result: { success: boolean } };
  'session:removeAdditionalDirectory': { args: [sessionId: string, directory: string]; result: { success: boolean } };
  'session:getAdditionalDirectories': { args: [sessionId: string]; result: string[] };
  'session:clearAdditionalDirectories': { args: [sessionId: string]; result: { success: boolean } };
  'session:getFileTree': { args: [sessionId: string]; result: DirectoryFileTree[] };

  // Workspace (legacy)
  'workspace:selectDirectory': { args: []; result: string | null };
  'workspace:list': { args: []; result: string[] };
  'workspace:add': { args: [dir: string]; result: boolean };
  'workspace:remove': { args: [dir: string]; result: boolean };
  'workspace:clear': { args: []; result: boolean };
  'workspace:update': { args: [sessionId: string]; result: ChatResponse };
  'workspace:getFileTree': { args: []; result: WorkspaceFileTree[] };
  'workspace:getFileTreeForDirectory': { args: [directoryPath: string]; result: DirectoryFileTree[] };

  // Cache
  'cache:stats': { args: []; result: CacheStats };

  // Templates
  'template:list': { args: []; result: PromptTemplate[] };
  'template:get': { args: [id: string]; result: PromptTemplate | undefined };
  'template:create': { args: [request: TemplateCreateRequest]; result: PromptTemplate };
  'template:update': { args: [request: TemplateUpdateRequest]; result: PromptTemplate };
  'template:delete': { args: [id: string]; result: boolean };

  // Models
  'models:list': { args: [options?: { forceRefresh?: boolean }]; result: ModelInfo[] };
  'models:getDefault': { args: []; result: string };

  // Auth
  'auth:isAuthenticated': { args: []; result: AuthStatus };
  'auth:loginWithOAuth': { args: [options: OAuthLoginOptions]; result: OAuthResult };
  'auth:logout': { args: []; result: { success: boolean } };
  'auth:getOAuthInfo': {
    args: [];
    result: {
      authenticated: boolean;
      subscriptionType?: string | null;
      expiresAt?: number;
      scopes?: string[];
    };
  };

  // Skills
  'skills:getData': {
    args: [sessionId: string];
    result: { marketplaces: SkillMarketplace[]; installedSkills: InstalledSkillInfo[]; enabled: boolean };
  };
  'skills:fetchMarketplace': { args: [marketplaceId: string, sessionId: string]; result: AvailableSkill[] };
  'skills:install': { args: [marketplaceId: string, skillPath: string, sessionId: string]; result: InstalledSkillInfo };
  'skills:uninstall': { args: [skillName: string, sessionId: string]; result: { success: boolean } };
  'skills:setGlobalEnabled': { args: [enabled: boolean]; result: { success: boolean } };

  // Settings
  'settings:get': { args: []; result: AppSettings };
  'settings:update': { args: [updates: Partial<AppSettings>]; result: { success: boolean } };
  'settings:hasSettings': { args: []; result: boolean };
  'settings:reset': { args: []; result: { success: boolean } };

  // Agents
  'agents:list': { args: []; result: AgentSummary[] };

  // Browser
  'browser:navigate': { args: [url: string]; result: { success: boolean; error?: string } };
  'browser:goBack': { args: []; result: { success: boolean } };
  'browser:goForward': { args: []; result: { success: boolean } };
  'browser:reload': { args: []; result: { success: boolean } };
  'browser:screenshot': { args: []; result: { success: boolean; data?: string; error?: string } };
  'browser:getContent': { args: [selector?: string]; result: { success: boolean; content?: string; error?: string } };
  'browser:click': { args: [x: number, y: number]; result: { success: boolean; error?: string } };
  'browser:type': { args: [text: string]; result: { success: boolean; error?: string } };
  'browser:executeJS': { args: [code: string]; result: { success: boolean; result?: string; error?: string } };
  'browser:getUrl': { args: []; result: { success: boolean; url?: string } };

  // Dialog
  'dialog:confirm': { args: [message: string]; result: boolean };
}
