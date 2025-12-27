/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * IPC Handlers - Electron IPC handlers for Claude Agent Service
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { claudeAgentService } from '../../core/services/claude-agent-service.js';
import type { ChatRequest, StreamEventCallback } from '../../core/services/claude-agent-service.js';
import type { StreamEvent, ToolApprovalRequestHandler } from '../../core/agents/claude-agent.js';
import { RoleType } from '../../core/roles/role-enum.js';
import { SessionManager } from '../../core/sessions/session-manager.js';
import { modelListManager } from '../../core/providers/model-list-manager.js';
import { templateManager } from '../../core/templates/template-manager.js';
import { authManager } from '../../core/auth/auth-manager.js';
import type { OAuthLoginOptions } from '../../core/auth/auth-manager.js';
import { getSkillManager } from '../../core/skills/skill-manager.js';
import fs from 'fs';
import path from 'path';

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
      mainWindow.webContents.send('agent:toolApprovalRequest', {
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
  ipcMain.handle('service:initialize', async () => {
    return await claudeAgentService.initialize();
  });

  /**
   * Check if service is initialized
   */
  ipcMain.handle('service:isInitialized', async () => {
    return claudeAgentService.isInitialized();
  });

  /**
   * Chat with agent - streaming mode
   */
  ipcMain.handle('agent:chat', async (_event, request: ChatRequest) => {
    // Create stream event callback that sends all events to frontend
    const streamEventCallback: StreamEventCallback = (sessionId: string, event: StreamEvent) => {
      mainWindow.webContents.send('agent:streamEvent', {
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
  ipcMain.handle('agent:getCurrentInfo', async () => {
    return claudeAgentService.getCurrentAgentInfo();
  });

  /**
   * Cancel ongoing request
   */
  ipcMain.handle('agent:cancelRequest', async (_event, sessionId?: string) => {
    return claudeAgentService.cancelRequest(sessionId);
  });

  /**
   * Approve a tool call
   */
  ipcMain.handle(
    'agent:approveTool',
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
  ipcMain.handle(
    'agent:rejectTool',
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
  ipcMain.handle('agent:getPermissionMode', async () => {
    const mode = claudeAgentService.getPermissionMode();
    return { success: true, mode };
  });

  /**
   * Set permission mode
   */
  ipcMain.handle('agent:setPermissionMode', async (_event, mode: string) => {
    try {
      await claudeAgentService.setPermissionMode(mode as import('../../core/agents/claude-agent.js').PermissionMode);
      return { success: true };
    } catch (error) {
      console.error('[IPC] setPermissionMode error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Get current setting sources
   */
  ipcMain.handle('agent:getSettingSources', async () => {
    const sources = claudeAgentService.getSettingSources();
    return { success: true, sources };
  });

  /**
   * Set setting sources
   */
  ipcMain.handle('agent:setSettingSources', async (_event, sources: string[]) => {
    try {
      claudeAgentService.setSettingSources(sources as import('../../core/agents/claude-agent.js').SettingSource[]);
      return { success: true };
    } catch (error) {
      console.error('[IPC] setSettingSources error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Session Management
   */

  /**
   * List all sessions
   */
  ipcMain.handle('session:list', async () => {
    return claudeAgentService.listSessions();
  });

  /**
   * Get session history
   */
  ipcMain.handle('session:getHistory', async (_event, sessionId: string) => {
    return await claudeAgentService.getSessionHistory(sessionId);
  });

  /**
   * Create new session
   */
  ipcMain.handle(
    'session:create',
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
  ipcMain.handle(
    'session:switch',
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
  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    return claudeAgentService.deleteSession(sessionId);
  });

  /**
   * Update session title
   */
  ipcMain.handle('session:updateTitle', async (_event, sessionId: string, newTitle: string) => {
    return claudeAgentService.updateSessionTitle(sessionId, newTitle);
  });

  /**
   * Get last used cwd
   */
  ipcMain.handle('session:getLastCwd', async () => {
    const sessionManager = SessionManager.getInstance();
    return sessionManager.getLastCwd();
  });

  /**
   * Add additional directory to session
   */
  ipcMain.handle('session:addAdditionalDirectory', async (_event, sessionId: string, directory: string) => {
    const sessionManager = SessionManager.getInstance();
    sessionManager.addAdditionalDirectory(sessionId, directory);
    return { success: true };
  });

  /**
   * Remove additional directory from session
   */
  ipcMain.handle('session:removeAdditionalDirectory', async (_event, sessionId: string, directory: string) => {
    const sessionManager = SessionManager.getInstance();
    sessionManager.removeAdditionalDirectory(sessionId, directory);
    return { success: true };
  });

  /**
   * Get additional directories for session
   */
  ipcMain.handle('session:getAdditionalDirectories', async (_event, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    return sessionManager.getAdditionalDirectories(sessionId);
  });

  /**
   * Clear all additional directories for session
   */
  ipcMain.handle('session:clearAdditionalDirectories', async (_event, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    sessionManager.clearAdditionalDirectories(sessionId);
    return { success: true };
  });

  /**
   * Get file tree for session directories (cwd + additionalDirectories)
   */
  ipcMain.handle('session:getFileTree', async (_event, sessionId: string) => {
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
  ipcMain.handle('workspace:selectDirectory', async () => {
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
  ipcMain.handle('workspace:list', async () => {
    return claudeAgentService.getWorkspaces();
  });

  /**
   * Add workspace
   */
  ipcMain.handle('workspace:add', async (_event, dir: string) => {
    return claudeAgentService.addWorkspace(dir);
  });

  /**
   * Remove workspace
   */
  ipcMain.handle('workspace:remove', async (_event, dir: string) => {
    return claudeAgentService.removeWorkspace(dir);
  });

  /**
   * Clear all workspaces
   */
  ipcMain.handle('workspace:clear', async () => {
    claudeAgentService.clearWorkspaces();
    return true;
  });

  /**
   * Update workspace configuration and recreate agent
   */
  ipcMain.handle('workspace:update', async (_event, sessionId: string) => {
    return await claudeAgentService.updateWorkspaces(sessionId);
  });

  /**
   * Get file tree for workspace directories
   */
  ipcMain.handle('workspace:getFileTree', async () => {
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
  ipcMain.handle('workspace:getFileTreeForDirectory', async (_event, directoryPath: string) => {
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
  ipcMain.handle('cache:stats', async () => {
    return claudeAgentService.getCacheStats();
  });

  /**
   * Template Management
   */

  /**
   * Get all templates
   */
  ipcMain.handle('template:list', async () => {
    return templateManager.getAllTemplates();
  });

  /**
   * Get template by ID
   */
  ipcMain.handle('template:get', async (_event, id: string) => {
    return templateManager.getTemplate(id);
  });

  /**
   * Create new template
   */
  ipcMain.handle('template:create', async (_event, { name, content }: { name: string; content: string }) => {
    return templateManager.createTemplate(name, content);
  });

  /**
   * Update template
   */
  ipcMain.handle(
    'template:update',
    async (_event, { id, updates }: { id: string; updates: { name?: string; content?: string } }) => {
      return templateManager.updateTemplate(id, updates);
    }
  );

  /**
   * Delete template
   */
  ipcMain.handle('template:delete', async (_event, id: string) => {
    return templateManager.deleteTemplate(id);
  });

  /**
   * Model Management - Claude only now
   */

  /**
   * Get available Claude models from Anthropic API
   */
  ipcMain.handle('models:list', async (_event, options?: { forceRefresh?: boolean }) => {
    return modelListManager.fetchModels(options);
  });

  /**
   * Get default model
   */
  ipcMain.handle('models:getDefault', async () => {
    return modelListManager.getDefaultModel();
  });

  /**
   * Authentication Management
   */

  /**
   * Check if authenticated
   */
  ipcMain.handle('auth:isAuthenticated', async () => {
    return authManager.isAuthenticated();
  });

  /**
   * Start OAuth login flow
   */
  ipcMain.handle(
    'auth:loginWithOAuth',
    async (_event, options: OAuthLoginOptions) => {
      return await authManager.loginWithOAuth(options);
    }
  );

  /**
   * Logout - clear OAuth credentials
   */
  ipcMain.handle('auth:logout', async () => {
    authManager.logout();
    return { success: true };
  });

  /**
   * Get OAuth info for UI display
   */
  ipcMain.handle('auth:getOAuthInfo', async () => {
    return authManager.getOAuthInfo();
  });

  /**
   * Utility handlers
   */

  /**
   * Ping handler for testing
   */
  ipcMain.handle('ping', async () => {
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
  ipcMain.handle('skills:getData', async (_event, sessionId: string) => {
    const skillManager = getSkillManager();
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
  ipcMain.handle('skills:fetchMarketplace', async (_event, marketplaceId: string, sessionId: string) => {
    const skillManager = getSkillManager();

    // Get cwd from session to check which skills are installed
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);
    const cwd = session?.cwd;

    return await skillManager.fetchMarketplaceSkills(marketplaceId, cwd);
  });

  /**
   * Install a skill from a marketplace to session's cwd
   */
  ipcMain.handle('skills:install', async (_event, marketplaceId: string, skillPath: string, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);

    if (!session?.cwd) {
      throw new Error('Session not found or has no working directory');
    }

    const skillManager = getSkillManager();
    return await skillManager.installSkill(marketplaceId, skillPath, session.cwd);
  });

  /**
   * Uninstall a skill from session's cwd
   */
  ipcMain.handle('skills:uninstall', async (_event, skillName: string, sessionId: string) => {
    const sessionManager = SessionManager.getInstance();
    const session = sessionManager.loadSession(sessionId);

    if (!session?.cwd) {
      throw new Error('Session not found or has no working directory');
    }

    const skillManager = getSkillManager();
    await skillManager.uninstallSkill(session.cwd, skillName);
    return { success: true };
  });

  /**
   * Set global skills enabled/disabled
   */
  ipcMain.handle('skills:setGlobalEnabled', async (_event, enabled: boolean) => {
    const skillManager = getSkillManager();
    await skillManager.setGlobalEnabled(enabled);
    return { success: true };
  });
}
