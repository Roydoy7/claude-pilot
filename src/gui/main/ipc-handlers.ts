/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * IPC Handlers - Electron IPC handlers for Claude Agent Service
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { claudeAgentService } from '../../core/services/claude-agent-service.js';
import type { ChatRequest, StreamEventCallback } from '../../core/services/claude-agent-service.js';
import type { StreamEvent, ToolApprovalRequestHandler } from '../../core/agents/claude-agent.js';
import { RoleType } from '../../core/roles/role-enum.js';
import { SessionManager } from '../../core/sessions/session-manager.js';
import { modelListManager } from '../../core/providers/model-list-manager.js';
import { templateManager } from '../../core/templates/template-manager.js';
import { authManager } from '../../core/auth/auth-manager.js';
import type { OAuthLoginOptions } from '../../core/auth/auth-manager.js';
import { SkillManager } from '../../core/skills/skill-manager.js';
import { settingsManager } from '../../core/settings/settings-manager.js';
import type { AppSettings } from '../../core/settings/settings-manager.js';
import { suggestionsManager, type Language } from '../../core/suggestions/suggestions-manager.js';
import { IpcChannels, type ChannelMap } from '../../shared/ipc-channels.js';
import { getErrorMessage } from '../../core/errors.js';
import fs from 'fs';
import path from 'path';

/**
 * Type-safe wrapper around `ipcMain.handle`. The channel name and handler's
 * argument/result types are both constrained by `ChannelMap`, so renaming or
 * retyping a channel in `shared/ipc-channels.ts` surfaces every call site
 * that needs updating.
 */
function handleIpc<C extends keyof ChannelMap>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: ChannelMap[C]['args']
  ) => ChannelMap[C]['result'] | Promise<ChannelMap[C]['result']>
): void {
  ipcMain.handle(channel, handler);
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Set up tool approval request handler once at initialization
  // This handler notifies the frontend when a tool needs user approval
  const toolApprovalRequestHandler: ToolApprovalRequestHandler = (
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ) => {
    console.log('[IPC] toolApprovalRequestHandler invoked:', { toolUseId, toolName });
    const sessionId = claudeAgentService.getCurrentSessionId();
    if (sessionId) {
      mainWindow.webContents.send(IpcChannels.agent.toolApprovalRequest, {
        sessionId,
        toolUseId,
        toolName,
        toolInput,
      });
    }
  };

  // Register the handler with the service
  claudeAgentService.setToolApprovalRequestHandler(toolApprovalRequestHandler);

  /**
   * Initialize service - load sessions and last used agent
   */
  handleIpc(IpcChannels.service.initialize, async () => {
    return await claudeAgentService.initialize();
  });

  /**
   * Check if service is initialized
   */
  handleIpc(IpcChannels.service.isInitialized, async () => {
    return claudeAgentService.isInitialized();
  });

  /**
   * Chat with agent - streaming mode
   */
  handleIpc(IpcChannels.agent.chat, async (_event, request: ChatRequest) => {
    // Create stream event callback that sends all events to frontend
    const streamEventCallback: StreamEventCallback = (sessionId: string, event: StreamEvent) => {
      mainWindow.webContents.send(IpcChannels.agent.streamEvent, {
        sessionId,
        event,
      });
    };

    const response = await claudeAgentService.chat({
      ...request,
      streamEventCallback,
    });

    return response;
  });

  /**
   * Get current agent info
   */
  handleIpc(IpcChannels.agent.getCurrentInfo, async () => {
    return claudeAgentService.getCurrentAgentInfo();
  });

  /**
   * Cancel ongoing request
   */
  handleIpc(IpcChannels.agent.cancelRequest, async (_event, sessionId?: string) => {
    return claudeAgentService.cancelRequest(sessionId);
  });

  /**
   * Approve a tool call
   */
  handleIpc(
    IpcChannels.agent.approveTool,
    async (
      _event,
      toolUseId: string,
      updatedInput?: Record<string, unknown>
    ) => {
      return claudeAgentService.approveToolCall(toolUseId, updatedInput);
    }
  );

  /**
   * Reject a tool call
   */
  handleIpc(
    IpcChannels.agent.rejectTool,
    async (
      _event,
      toolUseId: string,
      message?: string
    ) => {
      return claudeAgentService.rejectToolCall(toolUseId, message);
    }
  );

  /**
   * Get current permission mode
   */
  handleIpc(IpcChannels.agent.getPermissionMode, async () => {
    const mode = claudeAgentService.getPermissionMode();
    return { success: true, mode };
  });

  /**
   * Set permission mode
   */
  handleIpc(IpcChannels.agent.setPermissionMode, async (_event, mode: string) => {
    try {
      await claudeAgentService.setPermissionMode(mode as import('../../core/agents/claude-agent.js').PermissionMode);
      return { success: true };
    } catch (error) {
      console.error('[IPC] setPermissionMode error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get current setting sources
   */
  handleIpc(IpcChannels.agent.getSettingSources, async () => {
    const sources = claudeAgentService.getSettingSources();
    return { success: true, sources };
  });

  /**
   * Set setting sources
   */
  handleIpc(IpcChannels.agent.setSettingSources, async (_event, sources: string[]) => {
    try {
      claudeAgentService.setSettingSources(sources as import('../../core/agents/claude-agent.js').SettingSource[]);
      return { success: true };
    } catch (error) {
      console.error('[IPC] setSettingSources error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Session Management
   */

  /**
   * List all sessions
   */
  handleIpc(IpcChannels.session.list, async () => {
    return claudeAgentService.listSessions();
  });

  /**
   * Get session history
   */
  handleIpc(IpcChannels.session.getHistory, async (_event, sessionId: string) => {
    return await claudeAgentService.getSessionHistory(sessionId);
  });

  /**
   * Create new session
   */
  handleIpc(
    IpcChannels.session.create,
    async (
      _event,
      {
        title,
        role,
        modelName,
        cwd,
      }: {
        title: string;
        role: RoleType;
        modelName: string;
        cwd: string;
      }
    ) => {
      return await claudeAgentService.createSession(
        title,
        role,
        modelName,
        cwd
      );
    }
  );

  /**
   * Switch to existing session
   */
  handleIpc(
    IpcChannels.session.switch,
    async (
      _event,
      {
        sessionId,
      }: {
        sessionId: string;
      }
    ) => {
      return await claudeAgentService.switchSession(sessionId);
    }
  );

  /**
   * Delete session
   */
  handleIpc(IpcChannels.session.delete, async (_event, sessionId: string) => {
    return claudeAgentService.deleteSession(sessionId);
  });

  /**
   * Update session title
   */
  handleIpc(IpcChannels.session.updateTitle, async (_event, sessionId: string, newTitle: string) => {
    return claudeAgentService.updateSessionTitle(sessionId, newTitle);
  });

  /**
   * Get last used cwd
   */
  handleIpc(IpcChannels.session.getLastCwd, async () => {
    const sessionManager = SessionManager.getInstance();
    return sessionManager.getLastCwd();
  });

  /**
   * Add additional directory to session
   */
  handleIpc(IpcChannels.session.addAdditionalDirectory, async (_event, sessionId: string, directory: string) => {
    const sessionManager = SessionManager.getInstance();
    sessionManager.addAdditionalDirectory(sessionId, directory);
    return { success: true };
  });

  /**
   * Remove additional directory from session
   */
  handleIpc(IpcChannels.session.removeAdditionalDirectory, async (_event, sessionId: string, directory: string) => {
    const sessionManager = SessionManager.getInstance();
    sessionManager.removeAdditionalDirectory(sessionId, directory);
    return { success: true };
  });

  /**
   * Get additional directories for session
   */
  handleIpc(IpcChannels.session.getAdditionalDirectories, async (_event, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    return sessionManager.getAdditionalDirectories(sessionId);
  });

  /**
   * Clear all additional directories for session
   */
  handleIpc(IpcChannels.session.clearAdditionalDirectories, async (_event, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    sessionManager.clearAdditionalDirectories(sessionId);
    return { success: true };
  });

  /**
   * Get file tree for session directories (cwd + additionalDirectories)
   */
  handleIpc(IpcChannels.session.getFileTree, async (_event, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);

    if (!session) {
      return [];
    }

    interface FileNode {
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: FileNode[];
    }

    const buildTree = (dirPath: string): FileNode | null => {
      try {
        const stat = fs.statSync(dirPath);
        const name = path.basename(dirPath);

        if (stat.isFile()) {
          return {
            name,
            path: dirPath,
            type: 'file',
          };
        } else if (stat.isDirectory()) {
          const children: FileNode[] = [];
          const entries = fs.readdirSync(dirPath);

          for (const entry of entries) {
            // Skip hidden files and common ignore patterns
            if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__') {
              continue;
            }

            const childPath = path.join(dirPath, entry);
            const childNode = buildTree(childPath);
            if (childNode) {
              children.push(childNode);
            }
          }

          // Sort: directories first, then files, alphabetically
          children.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          return {
            name,
            path: dirPath,
            type: 'directory',
            children,
          };
        }
      } catch (error) {
        console.error(`Error reading ${dirPath}:`, error);
        return null;
      }
      return null;
    };

    const trees: Array<{
      directoryType: 'cwd' | 'additional';
      directoryPath: string;
      directoryLabel: string;
      tree: FileNode | null;
    }> = [];

    // Add cwd tree
    if (session.cwd) {
      trees.push({
        directoryType: 'cwd',
        directoryPath: session.cwd,
        directoryLabel: 'Working Directory (cwd)',
        tree: buildTree(session.cwd),
      });
    }

    // Add additional directories trees
    const additionalDirs = session.additionalDirectories || [];
    additionalDirs.forEach((dir, index) => {
      trees.push({
        directoryType: 'additional',
        directoryPath: dir,
        directoryLabel: `Additional Directory ${index + 1}`,
        tree: buildTree(dir),
      });
    });

    return trees;
  });

  /**
   * Workspace Management (Legacy - for backwards compatibility)
   */

  /**
   * Open directory selection dialog
   */
  handleIpc(IpcChannels.workspace.selectDirectory, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  /**
   * Get all workspaces
   */
  handleIpc(IpcChannels.workspace.list, async () => {
    return claudeAgentService.getWorkspaces();
  });

  /**
   * Add workspace
   */
  handleIpc(IpcChannels.workspace.add, async (_event, dir: string) => {
    return claudeAgentService.addWorkspace(dir);
  });

  /**
   * Remove workspace
   */
  handleIpc(IpcChannels.workspace.remove, async (_event, dir: string) => {
    return claudeAgentService.removeWorkspace(dir);
  });

  /**
   * Clear all workspaces
   */
  handleIpc(IpcChannels.workspace.clear, async () => {
    claudeAgentService.clearWorkspaces();
    return true;
  });

  /**
   * Update workspace configuration and recreate agent
   */
  handleIpc(IpcChannels.workspace.update, async (_event, sessionId: string) => {
    return await claudeAgentService.updateWorkspaces(sessionId);
  });

  /**
   * Get file tree for workspace directories
   */
  handleIpc(IpcChannels.workspace.getFileTree, async () => {
    const workspaces = claudeAgentService.getWorkspaces();

    interface FileNode {
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: FileNode[];
    }

    const buildTree = (dirPath: string): FileNode | null => {
      try {
        const stat = fs.statSync(dirPath);
        const name = path.basename(dirPath);

        if (stat.isFile()) {
          return {
            name,
            path: dirPath,
            type: 'file',
          };
        } else if (stat.isDirectory()) {
          const children: FileNode[] = [];
          const entries = fs.readdirSync(dirPath);

          for (const entry of entries) {
            // Skip hidden files and common ignore patterns
            if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__') {
              continue;
            }

            const childPath = path.join(dirPath, entry);
            const childNode = buildTree(childPath);
            if (childNode) {
              children.push(childNode);
            }
          }

          // Sort: directories first, then files, alphabetically
          children.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          return {
            name,
            path: dirPath,
            type: 'directory',
            children,
          };
        }
      } catch (error) {
        console.error(`Error reading ${dirPath}:`, error);
        return null;
      }
      return null;
    };

    const trees = workspaces.map((workspace: string, index: number) => {
      const tree = buildTree(workspace);
      return {
        workspaceIndex: index + 1,
        workspacePath: workspace,
        tree,
      };
    });

    return trees;
  });

  /**
   * Get file tree for a specific directory (no session required)
   * Used by InputArea @ button when session is not yet created
   */
  handleIpc(IpcChannels.workspace.getFileTreeForDirectory, async (_event, directoryPath: string) => {
    interface FileNode {
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: FileNode[];
    }

    const buildTree = (dirPath: string): FileNode | null => {
      try {
        const stat = fs.statSync(dirPath);
        const name = path.basename(dirPath);

        if (stat.isFile()) {
          return {
            name,
            path: dirPath,
            type: 'file',
          };
        } else if (stat.isDirectory()) {
          const children: FileNode[] = [];
          const entries = fs.readdirSync(dirPath);

          for (const entry of entries) {
            // Skip hidden files and common ignore patterns
            if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__') {
              continue;
            }

            const childPath = path.join(dirPath, entry);
            const childNode = buildTree(childPath);

            if (childNode) {
              children.push(childNode);
            }
          }

          // Sort: directories first, then files, alphabetically
          children.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          return {
            name,
            path: dirPath,
            type: 'directory',
            children,
          };
        }
      } catch (error) {
        console.error(`Error reading ${dirPath}:`, error);
        return null;
      }
      return null;
    };

    const tree = buildTree(directoryPath);
    return [{
      directoryType: 'cwd' as const,
      directoryPath,
      directoryLabel: 'Working Directory',
      tree,
    }];
  });

  /**
   * Cache Management
   */

  /**
   * Get cache statistics
   */
  handleIpc(IpcChannels.cache.stats, async () => {
    return claudeAgentService.getCacheStats();
  });

  /**
   * Template Management
   */

  /**
   * Get all templates
   */
  handleIpc(IpcChannels.template.list, async () => {
    return templateManager.getAllTemplates();
  });

  /**
   * Get template by ID
   */
  handleIpc(IpcChannels.template.get, async (_event, id: string) => {
    return templateManager.getTemplate(id);
  });

  /**
   * Create new template
   */
  handleIpc(IpcChannels.template.create, async (_event, { name, content }: { name: string; content: string }) => {
    return templateManager.createTemplate(name, content);
  });

  /**
   * Update template
   */
  handleIpc(
    IpcChannels.template.update,
    async (_event, { id, updates }: { id: string; updates: { name?: string; content?: string } }) => {
      return templateManager.updateTemplate(id, updates);
    }
  );

  /**
   * Delete template
   */
  handleIpc(IpcChannels.template.delete, async (_event, id: string) => {
    return templateManager.deleteTemplate(id);
  });

  /**
   * Model Management - Claude only now
   */

  /**
   * Get available Claude models from Anthropic API
   */
  handleIpc(IpcChannels.models.list, async (_event, options?: { forceRefresh?: boolean }) => {
    return modelListManager.fetchModels(options);
  });

  /**
   * Get default model
   */
  handleIpc(IpcChannels.models.getDefault, async () => {
    return modelListManager.getDefaultModel();
  });

  /**
   * Authentication Management
   */

  /**
   * Check if authenticated
   */
  handleIpc(IpcChannels.auth.isAuthenticated, async () => {
    return authManager.isAuthenticated();
  });

  /**
   * Start OAuth login flow
   */
  handleIpc(
    IpcChannels.auth.loginWithOAuth,
    async (_event, options: OAuthLoginOptions) => {
      return await authManager.loginWithOAuth(options);
    }
  );

  /**
   * Logout - clear OAuth credentials
   */
  handleIpc(IpcChannels.auth.logout, async () => {
    authManager.logout();
    return { success: true };
  });

  /**
   * Get OAuth info for UI display
   */
  handleIpc(IpcChannels.auth.getOAuthInfo, async () => {
    return authManager.getOAuthInfo();
  });

  /**
   * Utility handlers
   */

  /**
   * Ping handler for testing
   */
  handleIpc(IpcChannels.ping, async () => {
    return 'pong';
  });

  /**
   * Skills Management
   * Note: Skills are installed to {cwd}/.claude/skills/{skill-name}/
   * Claude Agent SDK automatically discovers and loads these skills
   */

  /**
   * Get skills data for a session (marketplaces, installed skills, enabled state)
   */
  handleIpc(IpcChannels.skills.getData, async (_event, sessionId: string) => {
    const skillManager = SkillManager.getInstance();
    await skillManager.initialize();

    // Get cwd from session to find installed skills
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);
    const cwd = session?.cwd;

    return {
      marketplaces: skillManager.getMarketplaces(),
      installedSkills: cwd ? await skillManager.getInstalledSkills(cwd) : [],
      enabled: skillManager.isGlobalEnabled(),
    };
  });

  /**
   * Fetch available skills from a marketplace
   */
  handleIpc(IpcChannels.skills.fetchMarketplace, async (_event, marketplaceId: string, sessionId: string) => {
    const skillManager = SkillManager.getInstance();

    // Get cwd from session to check which skills are installed
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);
    const cwd = session?.cwd;

    return await skillManager.fetchMarketplaceSkills(marketplaceId, cwd);
  });

  /**
   * Install a skill from a marketplace to session's cwd
   */
  handleIpc(IpcChannels.skills.install, async (_event, marketplaceId: string, skillPath: string, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);

    if (!session?.cwd) {
      throw new Error('Session not found or has no working directory');
    }

    const skillManager = SkillManager.getInstance();
    return await skillManager.installSkill(marketplaceId, skillPath, session.cwd);
  });

  /**
   * Uninstall a skill from session's cwd
   */
  handleIpc(IpcChannels.skills.uninstall, async (_event, skillName: string, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);

    if (!session?.cwd) {
      throw new Error('Session not found or has no working directory');
    }

    const skillManager = SkillManager.getInstance();
    await skillManager.uninstallSkill(session.cwd, skillName);
    return { success: true };
  });

  /**
   * Set global skills enabled/disabled
   */
  handleIpc(IpcChannels.skills.setGlobalEnabled, async (_event, enabled: boolean) => {
    const skillManager = SkillManager.getInstance();
    await skillManager.setGlobalEnabled(enabled);
    return { success: true };
  });

  /**
   * Settings Management
   */

  /**
   * Get application settings
   */
  handleIpc(IpcChannels.settings.get, async () => {
    return settingsManager.getSettings();
  });

  /**
   * Update application settings
   */
  handleIpc(IpcChannels.settings.update, async (_event, updates: Partial<AppSettings>) => {
    settingsManager.updateSettings(updates);
    return { success: true };
  });

  /**
   * Check if settings exist (first-time use detection)
   */
  handleIpc(IpcChannels.settings.hasSettings, async () => {
    return settingsManager.hasSettings();
  });

  /**
   * Reset settings to defaults
   */
  handleIpc(IpcChannels.settings.reset, async () => {
    settingsManager.resetSettings();
    return { success: true };
  });

  /**
   * Suggestions Management
   */

  /**
   * Get suggestions for a role (templates + cached LLM or defaults)
   */
  handleIpc(IpcChannels.suggestions.get, async (_event, role: RoleType, language: Language = 'en') => {
    return suggestionsManager.getSuggestions(role, language);
  });

  /**
   * Get only template suggestions
   */
  handleIpc(IpcChannels.suggestions.getTemplates, async () => {
    return suggestionsManager.getTemplates();
  });

  /**
   * Get default tool suggestions (without LLM)
   */
  handleIpc(IpcChannels.suggestions.getDefaults, async (_event, role: RoleType, language: Language = 'en') => {
    return suggestionsManager.getDefaultSuggestions(role, language);
  });

  /**
   * Refresh suggestions
   * Generates new suggestions using LLM via Claude Agent SDK
   */
  handleIpc(IpcChannels.suggestions.refresh, async (_event, role: RoleType, language: Language = 'en') => {
    try {
      // Get template suggestions
      const templateSuggestions = suggestionsManager.getTemplates();

      // Generate new suggestions using LLM
      const llmSuggestions = await suggestionsManager.generateWithLLM(role, language);

      const suggestions = [...templateSuggestions, ...llmSuggestions];

      return {
        success: true,
        suggestions,
      };
    } catch (error) {
      console.error('[IPC] suggestions:refresh error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  /**
   * Clear suggestions cache
   */
  handleIpc(IpcChannels.suggestions.clearCache, async (_event, role?: RoleType) => {
    suggestionsManager.clearCache(role);
    return { success: true };
  });
}
