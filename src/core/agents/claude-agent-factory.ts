/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent Factory - creates ClaudeAgent instances from session information
 * Uses Claude Agent SDK instead of LangChain/DeepAgents
 */

import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeAgent, type ClaudeAgentConfig } from './claude-agent.js';
import { SessionManager, type Session } from '../sessions/session-manager.js';
import { authManager } from '../auth/auth-manager.js';
import { getRoleSystemPrompt } from '../roles/role-system-prompts.js';
import { getSystemReminders } from '../context/system-reminders.js';
import { getAllowedTools } from '../roles/role-tool-sets.js';
import { RoleType } from '../roles/role-enum.js';
import { ClaudeModel, supportsExtendedThinking } from '../providers/model-list-manager.js';
import { permissionManager } from '../services/permission-manager.js';

/**
 * Agent cache - stores created agents by session ID
 */
const agentCache = new Map<string, ClaudeAgent>();

/**
 * Maximum number of cached agents
 */
const MAX_CACHE_SIZE = 10;

/**
 * Get cached agent for a session (LRU: moves to end)
 */
function getCachedAgent(sessionId: string): ClaudeAgent | undefined {
  const agent = agentCache.get(sessionId);

  if (agent) {
    agentCache.delete(sessionId);
    agentCache.set(sessionId, agent);
  }

  return agent;
}

/**
 * Cache an agent for a session (LRU: evicts least recently used)
 */
function cacheAgent(sessionId: string, agent: ClaudeAgent): void {
  if (agentCache.has(sessionId)) {
    agentCache.delete(sessionId);
  }

  if (agentCache.size >= MAX_CACHE_SIZE) {
    const firstKey = agentCache.keys().next().value;
    if (firstKey) {
      console.log(`Agent cache full, evicting least recently used: ${firstKey}`);
      agentCache.delete(firstKey);
    }
  }

  agentCache.set(sessionId, agent);
}

/**
 * Clear cached agent for a session
 */
export function clearAgentCache(sessionId?: string): void {
  if (sessionId) {
    agentCache.delete(sessionId);
  } else {
    agentCache.clear();
  }
}

/**
 * Get cache statistics
 */
export function getAgentCacheStats(): {
  size: number;
  maxSize: number;
  sessionIds: string[];
} {
  return {
    size: agentCache.size,
    maxSize: MAX_CACHE_SIZE,
    sessionIds: Array.from(agentCache.keys()),
  };
}

/**
 * Build combined system prompt for a role
 */
function buildSystemPrompt(
  role: RoleType
): string {
  const rolePrompt = getRoleSystemPrompt(role);
  const reminders = getSystemReminders();
  return `${rolePrompt}
${reminders}`;
}

/**
 * Permission result for allowing tool execution
 */
interface AllowPermission {
  behavior: 'allow';
  updatedInput: Record<string, unknown>;
}

/**
 * Permission result for denying tool execution
 */
interface DenyPermission {
  behavior: 'deny';
  message: string;
  interrupt?: boolean;
}

type PermissionResult = AllowPermission | DenyPermission;

/**
 * Create canUseTool callback for tool approval
 * Uses PermissionManager for risk-based permission control
 */
function createCanUseToolCallback(
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
): CanUseTool | undefined {
  if (!onToolApproval) {
    return undefined;
  }

  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
    _options: { signal: AbortSignal; toolUseID: string }
  ): Promise<PermissionResult> => {
    // Check if tool is explicitly denied
    if (permissionManager.isToolDenied(toolName)) {
      return {
        behavior: 'deny',
        message: `Tool '${toolName}' is explicitly denied`,
        interrupt: true,
      };
    }

    // Check if tool requires approval based on current permission mode
    if (permissionManager.requiresApproval(toolName)) {
      const approved = await onToolApproval(toolName, toolInput);
      if (!approved) {
        return {
          behavior: 'deny',
          message: 'Tool execution was rejected by user',
          interrupt: false,
        };
      }
    }

    // Tool is approved (either explicitly or by permission mode)
    return {
      behavior: 'allow',
      updatedInput: toolInput,
    };
  };
}

/**
 * Create agent from existing session (with caching)
 */
export async function createAgentFromSession(
  sessionId: string,
  forceRecreate: boolean = false,
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
): Promise<ClaudeAgent> {
  const sessionManager = SessionManager.getInstance();
  const session = sessionManager.loadSession(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (!forceRecreate) {
    const cachedAgent = getCachedAgent(sessionId);
    if (cachedAgent) {
      console.log(`Using cached agent for session ${sessionId}`);
      return cachedAgent;
    }
  }

  const agent = await createAgentFromSessionData(session, onToolApproval);
  cacheAgent(sessionId, agent);

  return agent;
}

/**
 * Create agent from session data
 */
export async function createAgentFromSessionData(
  session: Session,
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
): Promise<ClaudeAgent> {

  // Validate API key
  const authStatus = authManager.isAuthenticated();
  if (!authStatus.authenticated) {
    throw new Error(`Authentication failed: ${authStatus.error}`);
  }

  // Build system prompt with real paths
  const systemPrompt = buildSystemPrompt(session.role);

  // Create canUseTool callback for tool approval
  const canUseTool = createCanUseToolCallback(onToolApproval);

  // Get allowed tools for this role
  const allowedTools = getAllowedTools(session.role);

  // Build agent config (extends SDK Options)
  const agentConfig: ClaudeAgentConfig = {
    // Agent metadata
    role: session.role,
    modelName: session.modelName,

    // SDK Options
    systemPrompt,
    allowedTools: [...allowedTools],
    canUseTool,
    cwd: session.cwd,
    additionalDirectories: session.additionalDirectories,
    permissionMode: permissionManager.getPermissionMode(),
    // Enable extended thinking only for supported models
    maxThinkingTokens: supportsExtendedThinking(session.modelName) ? 10000 : undefined,
  };

  // Create and return agent
  return new ClaudeAgent(agentConfig, session.id, session.cwd, session.claudeSessionId);
}

/**
 * Create new agent and session
 */
export async function createNewAgent(
  title: string,
  role: RoleType,
  modelName: string = ClaudeModel.SONNET_4,
  cwd: string,
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
): Promise<ClaudeAgent> {
  const sessionManager = SessionManager.getInstance();

  // Create new session (provider is always Claude now)
  const session = sessionManager.createSession(title, role, modelName, cwd);

  // Create agent from session
  const agent = await createAgentFromSessionData(session, onToolApproval);

  // Cache the new agent
  cacheAgent(session.id, agent);

  return agent;
}

/**
 * Switch to existing session and create agent
 */
export async function switchToSession(
  sessionId: string,
  forceRecreate: boolean = false,
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
): Promise<ClaudeAgent> {
  const sessionManager = SessionManager.getInstance();

  // Switch session
  sessionManager.switchSession(sessionId);

  // Create agent for this session
  return await createAgentFromSession(sessionId, forceRecreate, onToolApproval);
}
