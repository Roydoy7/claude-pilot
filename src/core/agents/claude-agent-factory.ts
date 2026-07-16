/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent Factory - creates ClaudeAgent instances from session information
 * Uses Claude Agent SDK instead of LangChain/DeepAgents
 */

import { ClaudeAgent, type ClaudeAgentConfig } from './claude-agent.js';
import { SessionManager, type Session } from '../sessions/session-manager.js';
import { authManager } from '../auth/auth-manager.js';
import { getAgentDefinition } from './agent-loader.js';
import { getSystemReminders } from '../context/system-reminders.js';
import { ClaudeModel, getThinkingConfig, getSupportedEffortLevels, type EffortLevel } from '../providers/model-list-manager.js';
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
 * Look up a cached agent by session ID without creating one. Used to cancel a
 * session that's still running in the background after `currentAgent` has
 * moved on to a different session (see ClaudeAgentService.cancelRequest).
 */
export function getAgentBySessionId(sessionId: string): ClaudeAgent | undefined {
  return getCachedAgent(sessionId);
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
 * Build combined system prompt for an agent
 * Includes the agent's system prompt, cwd info, and system reminders
 * Note: Skills are automatically discovered by Claude Agent SDK from {cwd}/.claude/skills/
 */
function buildSystemPrompt(agentSystemPrompt: string, cwd?: string): string {
  const cwdPrompt = cwd ? `\nYour current working directory is: ${cwd}\n` : '';
  const reminders = getSystemReminders();
  return [agentSystemPrompt, cwdPrompt, reminders].join('\n');
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

  // Install even on a cache hit, so agent-defs changes (new/edited subagents)
  // stay synced to {cwd}/.claude/agents without needing forceRecreate.
  await installAgentResources(session.agentId, session.cwd);

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
  const authStatus = await authManager.isAuthenticated();
  if (!authStatus.authenticated) {
    throw new Error(`Authentication failed: ${authStatus.error}`);
  }

  const agentDef = await getAgentDefinition(session.agentId);

  // Build system prompt with real paths
  const systemPrompt: string | { type: 'preset'; preset: 'claude_code'; append?: string } =
    buildSystemPrompt(agentDef.systemPrompt, session.cwd);

  // Build agent config (extends SDK Options)
  // Note: canUseTool is set dynamically in ClaudeAgent.run() when needed
  const agentConfig: ClaudeAgentConfig = {
    // Agent metadata
    agentId: agentDef.id,
    agentDisplayName: agentDef.displayName,
    modelName: session.modelName,

    // SDK Options
    systemPrompt,
    tools: [...agentDef.tools], // All tools the agent can use
    allowedTools: [...agentDef.safeTools], // Safe tools auto-approved (bypass canUseTool)
    autoApprovedMcpTools: [...agentDef.autoApprovedMcpTools], // MCP tools auto-approved
    mcpServers: agentDef.mcpServers, // Custom MCP servers for Python and other tools
    agents: agentDef.subagentDefs, // Programmatically registered subagents (reliable, order-independent)
    cwd: session.cwd,
    additionalDirectories: session.additionalDirectories,
    permissionMode: session.permissionMode ?? 'default',
    thinking: getThinkingConfig(session.modelName),
  };

  // effort works together with adaptive thinking - only set it for models
  // that support at least one effort level (e.g. Haiku 4.5 does not).
  if (session.effortLevel && getSupportedEffortLevels(session.modelName).includes(session.effortLevel)) {
    agentConfig.effort = session.effortLevel;
  }

  // Create and return agent
  return new ClaudeAgent(agentConfig, session.id, session.cwd, session.claudeSessionId);
}

/**
 * Install skills and project-scoped Claude subagents for a host agent into
 * {cwd}/.claude/. Copies are idempotent, so this is cheap to call on every
 * agent creation path (including cache hits) to keep them in sync with
 * agent-defs changes.
 */
async function installAgentResources(agentId: string, cwd: string): Promise<void> {
  const skillManager = SkillManager.getInstance();
  await skillManager.initialize();
  await skillManager.installSkillsForAgent(agentId, cwd);
  await skillManager.installSubagentsForAgent(agentId, cwd);
}

/**
 * Create new agent and session
 */
export async function createNewAgent(
  title: string,
  agentId: string,
  modelName: string = ClaudeModel.SONNET_4_6,
  cwd: string,
  effortLevel?: EffortLevel
): Promise<ClaudeAgent> {
  const sessionManager = SessionManager.getInstance();

  // Create new session (provider is always Claude now)
  const session = sessionManager.createSession(title, agentId, modelName, cwd, effortLevel);

  await installAgentResources(agentId, cwd);

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
