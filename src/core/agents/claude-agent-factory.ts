/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent Factory - creates ClaudeAgent instances from session information
 * Uses Claude Agent SDK instead of LangChain/DeepAgents
 */

import { ClaudeAgent, type ClaudeAgentConfig } from './claude-agent.js';
import { SessionManager, type Session } from '../sessions/session-manager.js';
import { authManager } from '../auth/auth-manager.js';
import { getRoleSystemPrompt } from '../roles/role-system-prompts.js';
import { getSystemReminders } from '../context/system-reminders.js';
import { getAvailableTools, getAutoApprovedTools, getAutoApprovedMcpTools, getMcpServers } from '../roles/role-tool-sets.js';
import { RoleType } from '../roles/role-enum.js';
import { ClaudeModel, getThinkingConfig } from '../providers/model-list-manager.js';
import { SkillManager } from '../skills/skill-manager.js';

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
 * Includes role-specific prompt, cwd info, and system reminders
 * Note: Skills are automatically discovered by Claude Agent SDK from {cwd}/.claude/skills/
 */
function buildSystemPrompt(role: RoleType, cwd?: string): string {
  const rolePrompt = getRoleSystemPrompt(role);
  const cwdPrompt = cwd ? `\nYour current working directory is: ${cwd}\n` : '';
  const reminders = getSystemReminders();
  return [rolePrompt, cwdPrompt, reminders].join('\n');
}

/**
 * Create agent from existing session (with caching)
 */
export async function createAgentFromSession(
  sessionId: string,
  forceRecreate: boolean = false
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

  const agent = await createAgentFromSessionData(session);
  cacheAgent(sessionId, agent);

  return agent;
}

/**
 * Create agent from session data
 * Note: Tool approval is handled at runtime via ClaudeAgent.run() callback
 */
export async function createAgentFromSessionData(
  session: Session
): Promise<ClaudeAgent> {

  // Validate API key
  const authStatus = authManager.isAuthenticated();
  if (!authStatus.authenticated) {
    throw new Error(`Authentication failed: ${authStatus.error}`);
  }

  // Build system prompt with real paths
  // For CLAUDE_CODE role, use preset; for others, use custom system prompt
  const systemPrompt: string | { type: 'preset'; preset: 'claude_code'; append?: string } =
    session.role === RoleType.CLAUDE_CODE
      ? { type: 'preset', preset: 'claude_code' }
      : buildSystemPrompt(session.role, session.cwd);

  // Get tools for this role:
  // - availableTools: All tools the agent CAN use (passed as 'tools')
  // - autoApprovedTools: Safe tools that bypass canUseTool callback (passed as 'allowedTools')
  // - autoApprovedMcpTools: MCP tools that bypass canUseTool callback
  // - mcpServers: Custom MCP servers for additional tools (e.g., Python execution)
  const availableTools = getAvailableTools(session.role);
  const autoApprovedTools = getAutoApprovedTools(session.role);
  const autoApprovedMcpTools = getAutoApprovedMcpTools(session.role);
  const mcpServers = getMcpServers(session.role);

  // Build agent config (extends SDK Options)
  // Note: canUseTool is set dynamically in ClaudeAgent.run() when needed
  const agentConfig: ClaudeAgentConfig = {
    // Agent metadata
    role: session.role,
    modelName: session.modelName,

    // SDK Options
    systemPrompt,
    tools: [...availableTools], // All tools the agent can use
    allowedTools: [...autoApprovedTools], // Safe tools auto-approved (bypass canUseTool)
    autoApprovedMcpTools: [...autoApprovedMcpTools], // MCP tools auto-approved
    mcpServers, // Custom MCP servers for Python and other tools
    cwd: session.cwd,
    additionalDirectories: session.additionalDirectories,
    permissionMode: 'default',
    thinking: getThinkingConfig(session.modelName),
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
  modelName: string = ClaudeModel.SONNET_4_6,
  cwd: string
): Promise<ClaudeAgent> {
  const sessionManager = SessionManager.getInstance();

  // Create new session (provider is always Claude now)
  const session = sessionManager.createSession(title, role, modelName, cwd);

  // Install default skills for this role
  const skillManager = SkillManager.getInstance();
  await skillManager.initialize();
  await skillManager.installDefaultSkillsForRole(role, cwd);

  // Create agent from session
  const agent = await createAgentFromSessionData(session);

  // Cache the new agent
  cacheAgent(session.id, agent);

  return agent;
}

/**
 * Switch to existing session and create agent
 */
export async function switchToSession(
  sessionId: string,
  forceRecreate: boolean = false
): Promise<ClaudeAgent> {
  const sessionManager = SessionManager.getInstance();

  // Switch session
  sessionManager.switchSession(sessionId);

  // Create agent for this session
  return await createAgentFromSession(sessionId, forceRecreate);
}
