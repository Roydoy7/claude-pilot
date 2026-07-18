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
  type ToolApprovalRequestHandler,
  type SettingSource,
  ALL_SETTING_SOURCES,
} from '../agents/claude-agent.js';
import {
  createNewAgent,
  switchToSession,
  createAgentFromSession,
  clearAgentCache,
  getAgentCacheStats,
  getAgentBySessionId,
} from '../agents/claude-agent-factory.js';
import { SessionManager, type Session } from '../sessions/session-manager.js';
import { workspaceManager } from '../config/workspace-manager.js';
import { getAgentDefinitions } from '../agents/agent-loader.js';
import { settingsManager } from '../settings/settings-manager.js';
import { ClaudeModel, type EffortLevel } from '../providers/model-list-manager.js';
import { authManager, type AuthStatus } from '../auth/auth-manager.js';
import { templateManager, type PromptTemplate } from '../templates/template-manager.js';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { deleteTranscript } from '../sessions/transcript-manager.js';
import { SkillManager } from '../skills/skill-manager.js';
import { AgentQueryError, SessionPersistenceError, getErrorMessage } from '../errors.js';

/**
 * Resolve the default agent id from settings, falling back to the first
 * available agent definition if unset or no longer valid.
 */
async function getDefaultAgentId(): Promise<string> {
  const definitions = await getAgentDefinitions();
  if (definitions.length === 0) {
    throw new Error('No agent definitions available');
  }

  const { defaultAgentId } = settingsManager.getSettings();
  if (defaultAgentId && definitions.some((def) => def.id === defaultAgentId)) {
    return defaultAgentId;
  }

  return definitions[0].id;
}

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
  agentId?: string;
  modelName?: string;
}

/**
 * Stream event callback type
 */
export type StreamEventCallback = (sessionId: string, event: StreamEvent) => void;

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
 * Pending chat request in the queue
 */
interface PendingChatRequest {
  request: ChatRequest;
  resolve: (value: ChatResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Claude Agent Service - Singleton
 */
export class ClaudeAgentService {
  private static instance: ClaudeAgentService;
  private currentAgent: ClaudeAgent | null = null;
  private sessionManager: SessionManager;
  private initialized: boolean = false;
  private toolApprovalRequestHandler: ToolApprovalRequestHandler | null = null;

  // Request queue for sequential message processing
  private requestQueue: Map<string, PendingChatRequest[]> = new Map(); // sessionId -> queue
  private processingSessions = new Set<string>();
  private runningAgents = new Map<string, ClaudeAgent>();

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
   * Set tool approval request handler
   * This handler is called when SDK needs user approval for a tool
   */
  setToolApprovalRequestHandler(handler: ToolApprovalRequestHandler | null): void {
    console.log('[ClaudeAgentService] setToolApprovalRequestHandler called, handler:', handler ? 'provided' : 'null');
    this.toolApprovalRequestHandler = handler;
    // Also set on current agent if exists
    if (this.currentAgent) {
      console.log('[ClaudeAgentService] Applying handler to current agent');
      this.currentAgent.setToolApprovalRequestHandler(handler);
    }
  }

  private getLiveAgent(sessionId: string): ClaudeAgent | undefined {
    if (this.currentAgent?.getSessionId() === sessionId) {
      return this.currentAgent;
    }
    return this.runningAgents.get(sessionId) ?? getAgentBySessionId(sessionId);
  }

  private async getAgentForSession(sessionId: string): Promise<ClaudeAgent> {
    const liveAgent = this.getLiveAgent(sessionId);
    if (liveAgent) {
      if (this.toolApprovalRequestHandler) {
        liveAgent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
      }
      return liveAgent;
    }

    const agent = await createAgentFromSession(sessionId);
    if (this.toolApprovalRequestHandler) {
      agent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
    }
    return agent;
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
      // Initialize skill manager first (needed for system prompt injection)
      const skillManager = SkillManager.getInstance();
      await skillManager.initialize();

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
        this.currentAgent = await createAgentFromSession(lastSession.id, false);

        // Apply tool approval handler
        if (this.toolApprovalRequestHandler) {
          this.currentAgent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
        }

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
        error: getErrorMessage(error),
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
      agentId,
      modelName = ClaudeModel.SONNET_4_6,
    } = config;

    if (sessionId) {
      this.currentAgent = await switchToSession(sessionId, false);
    } else {
      const resolvedAgentId = agentId ?? (await getDefaultAgentId());
      const sessionTitle = title || `New ${resolvedAgentId} session`;
      // Use last selected cwd or default to user home directory
      const cwd = this.sessionManager.getLastCwd();
      this.currentAgent = await createNewAgent(sessionTitle, resolvedAgentId, modelName, cwd);
    }

    // Apply tool approval handler to new agent
    console.log('[ClaudeAgentService.initializeAgent] toolApprovalRequestHandler:', this.toolApprovalRequestHandler ? 'set' : 'not set');
    if (this.toolApprovalRequestHandler) {
      this.currentAgent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
    }

    return this.currentAgent;
  }

  /**
   * Send message to agent
   * Messages are queued per-session to prevent concurrent processing
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { sessionId } = request;

    // Determine effective session ID
    let effectiveSessionId = sessionId;
    if (!effectiveSessionId && this.currentAgent) {
      effectiveSessionId = this.currentAgent.getSessionId();
    }

    // If this session is currently being processed, queue the request
    if (effectiveSessionId && this.processingSessions.has(effectiveSessionId)) {
      return this.enqueueRequest(effectiveSessionId, request);
    }

    if (effectiveSessionId) {
      this.processingSessions.add(effectiveSessionId);
    }

    // Execute immediately. The session is reserved synchronously above so a
    // second renderer request cannot race past the per-session queue.
    return this.executeChat(request, effectiveSessionId);
  }

  /**
   * Enqueue a chat request for later processing
   */
  private enqueueRequest(sessionId: string, request: ChatRequest): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      // Get or create queue for this session
      let queue = this.requestQueue.get(sessionId);
      if (!queue) {
        queue = [];
        this.requestQueue.set(sessionId, queue);
      }

      // Add to queue
      queue.push({ request, resolve, reject });

      // Notify frontend that message is queued
      const { streamEventCallback } = request;
      if (streamEventCallback) {
        streamEventCallback(sessionId, {
          type: 'state',
          state: { thinking: false, queued: true },
        });
      }

      console.log(`[ClaudeAgentService] Request queued for session ${sessionId}, queue size: ${queue.length}`);
    });
  }

  /**
   * Process the next request in the queue for a session
   */
  private async processQueue(sessionId: string): Promise<void> {
    const queue = this.requestQueue.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }

    const pending = queue.shift()!;
    console.log(`[ClaudeAgentService] Processing queued request for session ${sessionId}, remaining: ${queue.length}`);

    try {
      this.processingSessions.add(sessionId);
      const response = await this.executeChat(pending.request, sessionId);
      pending.resolve(response);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute a chat request (internal implementation)
   */
  private async executeChat(request: ChatRequest, reservedSessionId?: string): Promise<ChatResponse> {
    let agentSessionId = reservedSessionId;
    try {
      const { message, sessionId, streamEventCallback } = request;
      let agent: ClaudeAgent;

      if (sessionId) {
        agent = await this.getAgentForSession(sessionId);
      } else if (this.currentAgent) {
        agent = this.currentAgent;
      } else {
        const textContent = extractTextFromMessage(message);
        const title = textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;
        agent = await this.initializeAgent({ sessionId: undefined, title });
      }

      agentSessionId = agent.getSessionId();
      this.currentAgent = agent; // Legacy/current-info compatibility only.
      this.processingSessions.add(agentSessionId);
      this.runningAgents.set(agentSessionId, agent);

      try {
        const eventStream = agent.run(message);

        for await (const event of eventStream) {
          if (streamEventCallback) {
            streamEventCallback(agentSessionId, event);
          }

          if (event.type === 'interrupt') {
            break;
          }
        }

        // Update session timestamp to mark as recently used
        this.sessionManager.touchSession(agentSessionId);

        return {
          success: true,
          data: '',
          sessionId: agentSessionId,
        };
      } finally {
        if (this.runningAgents.get(agentSessionId) === agent) {
          this.runningAgents.delete(agentSessionId);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    } finally {
      if (agentSessionId) {
        this.processingSessions.delete(agentSessionId);
        void this.processQueue(agentSessionId);
      }
    }
  }

  /**
   * Cancel the ongoing request for a session (defaults to the current one).
   *
   * Also drains that session's request queue - without this, a message the
   * user sent while a turn was running would auto-start via `processQueue()`
   * right after cancel, making the agent look like it "cancelled itself back on".
   * Looks the target agent up via the session cache (not just `currentAgent`)
   * so a background session that's no longer active can still be cancelled
   * after the user has switched to another session.
   */
  async cancelRequest(sessionId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
      if (!targetSessionId) {
        return {
          success: false,
          error: 'No active agent to cancel',
        };
      }

      const queue = this.requestQueue.get(targetSessionId);
      if (queue && queue.length > 0) {
        this.requestQueue.set(targetSessionId, []);
        for (const pending of queue) {
          pending.request.streamEventCallback?.(targetSessionId, {
            type: 'cancelled',
            reason: 'Cancelled by user',
          });
          pending.resolve({ success: false, error: 'cancelled', sessionId: targetSessionId });
        }
      }

      const targetAgent = this.getLiveAgent(targetSessionId);

      if (!targetAgent) {
        return {
          success: false,
          error: `No active agent for session ${targetSessionId}`,
        };
      }

      await targetAgent.cancel();

      return {
        success: true,
      };
    } catch (error) {
      console.error('Cancel request error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Approve a pending tool call
   */
  approveToolCall(
    sessionId: string,
    toolUseId: string,
    updatedInput?: Record<string, unknown>
  ): { success: boolean; error?: string } {
    const targetAgent = this.getLiveAgent(sessionId);
    if (!targetAgent) {
      return { success: false, error: `No active agent for session ${sessionId}` };
    }

    const result = targetAgent.approveToolCall(toolUseId, updatedInput);
    return { success: result, error: result ? undefined : 'No pending approval for this tool' };
  }

  /**
   * Reject a pending tool call
   */
  rejectToolCall(
    sessionId: string,
    toolUseId: string,
    message?: string
  ): { success: boolean; error?: string } {
    const targetAgent = this.getLiveAgent(sessionId);
    if (!targetAgent) {
      return { success: false, error: `No active agent for session ${sessionId}` };
    }

    const result = targetAgent.rejectToolCall(toolUseId, message);
    return { success: result, error: result ? undefined : 'No pending approval for this tool' };
  }

  /**
   * Get current agent info
   */
  getCurrentAgentInfo(): {
    sessionId: string;
    agentId: string;
    modelName: string;
  } | null {
    if (!this.currentAgent) {
      return null;
    }

    return {
      sessionId: this.currentAgent.getSessionId(),
      agentId: this.currentAgent.getAgentId(),
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
      const liveAgent = this.getLiveAgent(sessionId);
      if (liveAgent) {
        return await liveAgent.getHistory();
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
        throw new SessionPersistenceError(`Session ${sessionId} not found after update`, 'SESSION_NOT_FOUND');
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
      // Get session info before deletion to access claudeSessionId and cwd
      const session = this.sessionManager.loadSession(sessionId);

      clearAgentCache(sessionId);

      if (this.currentAgent && this.currentAgent.getSessionId() === sessionId) {
        this.currentAgent = null;
      }

      // Delete SDK transcript file if session has claudeSessionId
      if (session?.claudeSessionId && session?.cwd) {
        deleteTranscript(session.claudeSessionId, session.cwd);
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
      this.currentAgent = await switchToSession(sessionId, false);

      // Apply tool approval handler
      if (this.toolApprovalRequestHandler) {
        this.currentAgent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
      }

      return {
        success: true,
        sessionId: this.currentAgent.getSessionId(),
      };
    } catch (error) {
      console.error('Switch session error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Create new session
   */
  async createSession(
    title: string,
    agentId: string,
    modelName: string,
    cwd: string,
    effortLevel?: EffortLevel
  ): Promise<{ success: boolean; session?: Session; error?: string }> {
    try {
      this.currentAgent = await createNewAgent(title, agentId, modelName, cwd, effortLevel);

      // Apply tool approval handler
      if (this.toolApprovalRequestHandler) {
        this.currentAgent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
      }

      const session = this.sessionManager.loadSession(this.currentAgent.getSessionId());
      if (!session) {
        throw new SessionPersistenceError('Failed to load created session', 'SESSION_LOAD_FAILED');
      }

      return {
        success: true,
        session,
      };
    } catch (error) {
      console.error('Create session error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
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
        throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
      }

      this.currentAgent = await createAgentFromSession(sessionId, true);

      // Apply tool approval handler
      if (this.toolApprovalRequestHandler) {
        this.currentAgent.setToolApprovalRequestHandler(this.toolApprovalRequestHandler);
      }

      return {
        success: true,
        sessionId: this.currentAgent.getSessionId(),
      };
    } catch (error) {
      console.error('Update workspaces error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
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

  async isAuthenticated(): Promise<AuthStatus> {
    return authManager.isAuthenticated();
  }

  /**
   * Permission Management
   * Permission mode is now managed per-agent via ClaudeAgent.setPermissionMode()
   */

  async setPermissionMode(mode: PermissionMode, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    if (!targetSessionId) {
      throw new AgentQueryError('No session to set permission mode on', 'NO_ACTIVE_SESSION');
    }

    // Persist first so any future agent recreation picks it up
    this.sessionManager.updateSessionPermissionMode(targetSessionId, mode);

    // Apply to the live agent if one exists for this session
    const targetAgent = this.getLiveAgent(targetSessionId);
    if (targetAgent) {
      await targetAgent.setPermissionMode(mode);
    }
  }

  getPermissionMode(sessionId?: string): PermissionMode {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    if (!targetSessionId) {
      return 'default';
    }
    const targetAgent = this.getLiveAgent(targetSessionId);
    if (targetAgent) {
      return targetAgent.getPermissionMode();
    }
    // No live agent - read from persisted session
    return this.sessionManager.loadSession(targetSessionId)?.permissionMode ?? 'default';
  }

  /**
   * Setting Sources Management
   * Setting sources are managed per-agent via ClaudeAgent.setSettingSources()
   */

  async setSettingSources(sources: SettingSource[], sessionId?: string): Promise<void> {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    if (!targetSessionId) {
      throw new AgentQueryError('No session to set setting sources on', 'NO_ACTIVE_SESSION');
    }
    this.sessionManager.updateSessionSettingSources(targetSessionId, sources);
    const targetAgent = this.getLiveAgent(targetSessionId);
    if (targetAgent) {
      targetAgent.setSettingSources(sources);
    }
  }

  getSettingSources(sessionId?: string): SettingSource[] {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    return (targetSessionId ? this.getLiveAgent(targetSessionId)?.getSettingSources() : undefined)
      ?? (targetSessionId ? this.sessionManager.loadSession(targetSessionId)?.settingSources : undefined)
      ?? [...ALL_SETTING_SOURCES];
  }

  /**
   * Model Management
   * Model is managed per-agent via ClaudeAgent.setModel(), and persisted
   * to the session record so switching sessions shows the correct model.
   */

  async setModel(model: string, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    if (!targetSessionId) {
      throw new AgentQueryError('No session to set model on', 'NO_ACTIVE_SESSION');
    }
    this.sessionManager.updateSessionModel(targetSessionId, model);
    const targetAgent = this.getLiveAgent(targetSessionId);
    if (targetAgent) {
      await targetAgent.setModel(model);
    }
  }

  getModelName(sessionId?: string): string {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    return (targetSessionId ? this.getLiveAgent(targetSessionId)?.getModelName()
      ?? this.sessionManager.loadSession(targetSessionId)?.modelName : undefined)
      ?? ClaudeModel.SONNET_4_6;
  }

  /**
   * Thinking Effort Management
   * Effort level is managed per-agent via ClaudeAgent.setEffortLevel(), and
   * persisted to the session record so switching sessions shows the correct level.
   */

  async setEffortLevel(level: EffortLevel, sessionId?: string): Promise<void> {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    if (!targetSessionId) {
      throw new AgentQueryError('No session to set effort level on', 'NO_ACTIVE_SESSION');
    }
    this.sessionManager.updateSessionEffortLevel(targetSessionId, level);
    const targetAgent = this.getLiveAgent(targetSessionId);
    if (targetAgent) {
      await targetAgent.setEffortLevel(level);
    }
  }

  getEffortLevel(sessionId?: string): EffortLevel | undefined {
    const targetSessionId = sessionId ?? this.currentAgent?.getSessionId();
    return targetSessionId
      ? this.getLiveAgent(targetSessionId)?.getEffortLevel()
        ?? this.sessionManager.loadSession(targetSessionId)?.effortLevel
      : undefined;
  }
}

/**
 * Get the singleton instance
 */
export const claudeAgentService = ClaudeAgentService.getInstance();
