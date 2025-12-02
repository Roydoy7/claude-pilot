/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent Service - Electron IPC service layer for agent management
 * Provides interface between Electron main process and Claude Agent SDK
 */

import {
  ClaudeAgent,
  type UsageMetadata,
  type AgentState,
  type StreamEvent,
  type MessageContent,
  type HistoryMessage,
} from '../agents/claude-agent.js';
import {
  createNewAgent,
  switchToSession,
  createAgentFromSession,
  clearAgentCache,
  getAgentCacheStats,
} from '../agents/claude-agent-factory.js';
import { SessionManager, type Session } from '../sessions/session-manager.js';
import { workspaceManager } from '../config/workspace-manager.js';
import { RoleType } from '../roles/role-enum.js';
import { ClaudeModel } from '../providers/model-list-manager.js';
import { authManager, type AuthStatus } from '../auth/auth-manager.js';
import { templateManager, type PromptTemplate } from '../templates/template-manager.js';
import { permissionManager, type PermissionMode } from './permission-manager.js';

/**
 * Extract text content from MessageContent for use as session title
 */
function extractTextFromMessage(message: MessageContent): string {
  if (typeof message === 'string') {
    return message;
  }

  for (const block of message) {
    if (block.type === 'text' && block.text) {
      return block.text;
    }
  }

  return 'New conversation';
}

/**
 * Agent initialization configuration
 */
export interface AgentInitConfig {
  sessionId?: string;
  title?: string;
  role?: RoleType;
  modelName?: string;
}

/**
 * Stream event callback type
 */
export type StreamEventCallback = (sessionId: string, event: StreamEvent) => void;

/**
 * Tool approval callback type
 */
export type ToolApprovalCallback = (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

/**
 * Chat request parameters
 */
export interface ChatRequest {
  message: MessageContent;
  sessionId?: string;
  streamEventCallback?: StreamEventCallback;
}

/**
 * Chat response
 */
export interface ChatResponse {
  success: boolean;
  data?: string;
  error?: string;
  sessionId?: string;
}

/**
 * Claude Agent Service - Singleton
 */
export class ClaudeAgentService {
  private static instance: ClaudeAgentService;
  private currentAgent: ClaudeAgent | null = null;
  private sessionManager: SessionManager;
  private initialized: boolean = false;
  private toolApprovalCallback: ToolApprovalCallback | null = null;

  private constructor() {
    this.sessionManager = SessionManager.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ClaudeAgentService {
    if (!ClaudeAgentService.instance) {
      ClaudeAgentService.instance = new ClaudeAgentService();
    }
    return ClaudeAgentService.instance;
  }

  /**
   * Set tool approval callback
   */
  setToolApprovalCallback(callback: ToolApprovalCallback | null): void {
    this.toolApprovalCallback = callback;
  }

  /**
   * Initialize service
   */
  async initialize(): Promise<{
    success: boolean;
    sessions: Session[];
    currentSession?: Session;
    templates: PromptTemplate[];
    error?: string;
  }> {
    try {
      const sessions = this.sessionManager.getAllSessions();
      const templates = templateManager.getAllTemplates();

      if (sessions.length === 0) {
        this.initialized = true;
        return {
          success: true,
          sessions: [],
          templates,
        };
      }

      const lastSession = sessions[0];

      try {
        this.currentAgent = await createAgentFromSession(
          lastSession.id,
          false,
          this.toolApprovalCallback || undefined
        );

        this.initialized = true;

        return {
          success: true,
          sessions,
          currentSession: lastSession,
          templates,
        };
      } catch (agentError) {
        console.warn('Failed to create agent for last session:', agentError);
        this.initialized = true;

        return {
          success: true,
          sessions,
          templates,
          error: agentError instanceof Error ? agentError.message : 'Failed to create agent',
        };
      }
    } catch (error) {
      console.error('Service initialization failed:', error);
      return {
        success: false,
        sessions: [],
        templates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize or switch agent
   */
  async initializeAgent(config: AgentInitConfig): Promise<ClaudeAgent> {
    const {
      sessionId,
      title,
      role = RoleType.OFFICE_ASSISTANT,
      modelName = ClaudeModel.SONNET_4,
    } = config;

    if (sessionId) {
      this.currentAgent = await switchToSession(
        sessionId,
        false,
        this.toolApprovalCallback || undefined
      );
    } else {
      const sessionTitle = title || `New ${role} session`;
      // Use last selected cwd or default to user home directory
      const cwd = this.sessionManager.getLastCwd();
      this.currentAgent = await createNewAgent(
        sessionTitle,
        role,
        modelName,
        cwd,
        this.toolApprovalCallback || undefined
      );
    }

    return this.currentAgent;
  }

  /**
   * Send message to agent
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const { message, sessionId, streamEventCallback } = request;

      if (!this.currentAgent || (sessionId && this.currentAgent.getSessionId() !== sessionId)) {
        if (!sessionId) {
          const textContent = extractTextFromMessage(message);
          const title = textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;

          await this.initializeAgent({
            sessionId: undefined,
            title,
          });
        } else {
          await this.initializeAgent({ sessionId });
        }
      }

      if (!this.currentAgent) {
        throw new Error('Agent not initialized');
      }

      const agentSessionId = this.currentAgent.getSessionId();

      const eventStream = this.currentAgent.run(message);

      for await (const event of eventStream) {
        if (streamEventCallback) {
          streamEventCallback(agentSessionId, event);
        }

        if (event.type === 'interrupt') {
          break;
        }
      }

      return {
        success: true,
        data: '',
        sessionId: agentSessionId,
      };
    } catch (error) {
      console.error('Chat error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cancel the ongoing request
   */
  cancelRequest(sessionId?: string): { success: boolean; error?: string } {
    try {
      if (!this.currentAgent) {
        return {
          success: false,
          error: 'No active agent to cancel',
        };
      }

      if (sessionId && this.currentAgent.getSessionId() !== sessionId) {
        return {
          success: false,
          error: `Session ${sessionId} is not the active session`,
        };
      }

      this.currentAgent.cancel();

      return {
        success: true,
      };
    } catch (error) {
      console.error('Cancel request error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current agent info
   */
  getCurrentAgentInfo(): {
    sessionId: string;
    role: RoleType;
    modelName: string;
  } | null {
    if (!this.currentAgent) {
      return null;
    }

    return {
      sessionId: this.currentAgent.getSessionId(),
      role: this.currentAgent.getRole(),
      modelName: this.currentAgent.getModelName(),
    };
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentAgent?.getSessionId() || null;
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(sessionId: string): Promise<HistoryMessage[]> {
    try {
      if (this.currentAgent && this.currentAgent.getSessionId() === sessionId) {
        return await this.currentAgent.getHistory();
      }

      const session = this.sessionManager.loadSession(sessionId);
      if (!session) {
        console.error(`Session ${sessionId} not found`);
        return [];
      }

      const tempAgent = await createAgentFromSession(sessionId);
      const history = await tempAgent.getHistory();

      return history;
    } catch (error) {
      console.error('Failed to get session history:', error);
      return [];
    }
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    return this.sessionManager.getAllSessions();
  }

  /**
   * Update session title
   */
  updateSessionTitle(sessionId: string, newTitle: string): { success: boolean; session: Session } {
    try {
      this.sessionManager.updateSessionTitle(sessionId, newTitle);
      const session = this.sessionManager.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found after update`);
      }
      return {
        success: true,
        session,
      };
    } catch (error) {
      console.error('Update session title error:', error);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string) {
    return this.sessionManager.getSessionStats(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): { success: boolean; sessionId: string } {
    try {
      clearAgentCache(sessionId);

      if (this.currentAgent && this.currentAgent.getSessionId() === sessionId) {
        this.currentAgent = null;
      }

      this.sessionManager.deleteSession(sessionId);

      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      console.error('Delete session error:', error);
      throw error;
    }
  }

  /**
   * Switch to a different session
   */
  async switchSession(sessionId: string): Promise<ChatResponse> {
    try {
      this.currentAgent = await switchToSession(
        sessionId,
        false,
        this.toolApprovalCallback || undefined
      );

      return {
        success: true,
        sessionId: this.currentAgent.getSessionId(),
      };
    } catch (error) {
      console.error('Switch session error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create new session
   */
  async createSession(
    title: string,
    role: RoleType,
    modelName: string,
    cwd: string
  ): Promise<{ success: boolean; session?: Session; error?: string }> {
    try {
      this.currentAgent = await createNewAgent(
        title,
        role,
        modelName,
        cwd,
        this.toolApprovalCallback || undefined
      );

      const session = this.sessionManager.loadSession(this.currentAgent.getSessionId());
      if (!session) {
        throw new Error('Failed to load created session');
      }

      return {
        success: true,
        session,
      };
    } catch (error) {
      console.error('Create session error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get agent cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    sessionIds: string[];
  } {
    return getAgentCacheStats();
  }

  /**
   * Workspace Management
   */

  addWorkspace(dir: string): boolean {
    return workspaceManager.addWorkspace(dir);
  }

  removeWorkspace(dir: string): boolean {
    return workspaceManager.removeWorkspace(dir);
  }

  getWorkspaces(): string[] {
    return workspaceManager.getWorkspaces();
  }

  clearWorkspaces(): void {
    workspaceManager.clearWorkspaces();
  }

  async updateWorkspaces(sessionId: string): Promise<ChatResponse> {
    try {
      clearAgentCache(sessionId);

      const session = this.sessionManager.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      this.currentAgent = await createAgentFromSession(
        sessionId,
        true,
        this.toolApprovalCallback || undefined
      );

      return {
        success: true,
        sessionId: this.currentAgent.getSessionId(),
      };
    } catch (error) {
      console.error('Update workspaces error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Template Management
   */

  getAllTemplates(): PromptTemplate[] {
    return templateManager.getAllTemplates();
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return templateManager.getTemplate(id);
  }

  createTemplate(name: string, content: string): PromptTemplate {
    return templateManager.createTemplate(name, content);
  }

  updateTemplate(id: string, updates: { name?: string; content?: string }): PromptTemplate {
    return templateManager.updateTemplate(id, updates);
  }

  deleteTemplate(id: string): boolean {
    return templateManager.deleteTemplate(id);
  }

  hasTemplate(id: string): boolean {
    return templateManager.hasTemplate(id);
  }

  getTemplateCount(): number {
    return templateManager.getTemplateCount();
  }

  /**
   * Authentication Management
   */

  isAuthenticated(): AuthStatus {
    return authManager.isAuthenticated();
  }

  /**
   * Permission Management
   */

  setPermissionMode(mode: PermissionMode): void {
    permissionManager.setPermissionMode(mode);
  }

  getPermissionMode(): PermissionMode {
    return permissionManager.getPermissionMode();
  }

  getPermissionConfig() {
    return permissionManager.getConfigSummary();
  }

  setAllowedTools(tools: string[]): void {
    permissionManager.setAllowedTools(tools);
  }

  setDeniedTools(tools: string[]): void {
    permissionManager.setDeniedTools(tools);
  }
}

/**
 * Get the singleton instance
 */
export const claudeAgentService = ClaudeAgentService.getInstance();
