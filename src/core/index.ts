/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Pilot Core - Main exports
 * Provides Claude Agent SDK based agent implementation
 */

// Agent exports
export {
  ClaudeAgent,
  type ClaudeAgentConfig,
  type UsageMetadata,
  type MessageContent,
  type ToolCallForApproval,
  type AgentState,
  type TodoItem,
  type StreamEvent,
  type HistoryMessage,
  type ToolApprovalRequestHandler,
} from './agents/claude-agent.js';

export {
  createAgentFromSession,
  createAgentFromSessionData,
  createNewAgent,
  switchToSession,
  clearAgentCache,
  getAgentCacheStats,
} from './agents/claude-agent-factory.js';

// Service exports
export {
  ClaudeAgentService,
  claudeAgentService,
  type AgentInitConfig,
  type StreamEventCallback,
  type ChatRequest,
  type ChatResponse,
} from './services/claude-agent-service.js';

// Session exports
export {
  SessionManager,
  type Session,
} from './sessions/session-manager.js';

// Role exports
export {
  RoleType,
  ROLE_DISPLAY_NAMES,
  getRoleDisplayName,
} from './roles/role-enum.js';

export {
  getRoleSystemPrompt,
  ROLE_SYSTEM_PROMPTS,
} from './roles/role-system-prompts.js';

export {
  ALL_SDK_TOOLS,
  ROLE_ALLOWED_TOOLS,
} from './roles/role-tool-sets.js';

// Model and Provider exports
export {
  ClaudeModel,
  DEFAULT_MODEL,
  MODEL_DISPLAY_NAMES,
  getModelDisplayName,
  getDefaultModel,
  supportsExtendedThinking,
  ProviderType,
  type ModelConfig,
  type ModelInfo,
} from './providers/model-list-manager.js';

export {
  modelListManager,
  ModelListManager,
} from './providers/model-list-manager.js';

// Auth exports
export {
  authManager,
  type AuthStatus,
} from './auth/auth-manager.js';

// Template exports
export {
  templateManager,
  type PromptTemplate,
} from './templates/template-manager.js';

// Workspace exports
export { workspaceManager } from './config/workspace-manager.js';

// Storage exports
export {
  getAppDataDir,
  getSessionsDir,
  getAgentWorkspaceDir,
  getConfigDir,
} from './storage/storage.js';

// Permission mode type re-exported from SDK
export type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
