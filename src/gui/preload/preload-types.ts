/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Preload types - Type definitions for Electron IPC API
 * Updated for Claude-only architecture (no multi-provider support)
 */

import type { RoleType } from '../../core/roles/role-enum.js';
import type { Session } from '../../core/sessions/session-manager.js';
import type { PromptTemplate } from '../../core/templates/template-manager.js';
import type { AuthStatus, OAuthLoginOptions, OAuthResult } from '../../core/types/auth-types.js';
import type { AgentState, StreamEvent, PermissionMode, SettingSource } from '../../core/agents/claude-agent.js';
import type { MessageContent } from '../../core/types/message-types.js';
import type { ModelInfo } from '../../core/providers/model-list-manager.js';

/**
 * Re-export PermissionMode and SettingSource for frontend use
 */
export type { PermissionMode, SettingSource };

/**
 * Re-export types for consistency
 */
export type { MessageContent, OAuthResult };

/**
 * Service initialization request (no longer needs apiKey)
 */
export interface ServiceInitRequest {
  // Empty for now - kept for backwards compatibility
}

/**
 * Service initialization response
 */
export interface ServiceInitResponse {
  success: boolean;
  sessions: Session[];
  currentSession?: Session;
  templates: PromptTemplate[];
  error?: string;
}

/**
 * Cache creation breakdown by TTL
 */
export interface CacheCreationBreakdown {
  /** Tokens written to 5-minute ephemeral cache (default) */
  ephemeral_5m_input_tokens?: number;
  /** Tokens written to 1-hour extended cache (requires Max subscription) */
  ephemeral_1h_input_tokens?: number;
}

/**
 * Token usage metadata
 * Matches SDK's usage structure for accurate context usage calculation
 */
export interface UsageMetadata {
  /** Input tokens (excluding cache reads) */
  input_tokens: number;
  /** Output tokens generated */
  output_tokens: number;
  /** Total tokens (input + output) */
  total_tokens: number;
  /** Tokens read from cache (90% cost savings) */
  cache_read_input_tokens?: number;
  /** Total tokens written to cache (25% cost increase) */
  cache_creation_input_tokens?: number;
  /** Breakdown of cache creation by TTL */
  cache_creation?: CacheCreationBreakdown;
  /** Service tier (standard, max, etc.) */
  service_tier?: string | null;
}

/**
 * Chat request
 */
export interface ChatRequest {
  message: MessageContent;
  sessionId?: string;
}

/**
 * Chat response
 */
export interface ChatResponse {
  success: boolean;
  data?: string;
  error?: string;
  sessionId?: string;
  usage?: UsageMetadata;
}

/**
 * Stream chunk
 */
export interface StreamChunk {
  sessionId?: string;
  chunk: string;
}

/**
 * Tool call information
 */
export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool response/result
 */
export interface ToolResponse {
  tool_call_id: string;
  output: string;
  error?: string;
}

/**
 * Tool execution progress entry
 */
export interface ToolProgressEntry {
  type: 'stdout' | 'stderr' | 'start' | 'end' | 'error';
  message: string;
  timestamp: number;
}

/**
 * File tree node for workspace browser
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

/**
 * Message list item - unified type for messages, tool calls, status indicators, thinking, cancelled, and usage_limit
 */
export interface MessageListItem {
  type: 'message' | 'tool_call' | 'status' | 'thinking' | 'cancelled' | 'usage_limit';
  id: string;
  timestamp: number;

  // Message type fields
  role?: 'user' | 'assistant';
  content?: MessageContent;
  usage?: UsageMetadata;

  // Tool call type fields
  toolCall?: ToolCallInfo;
  toolResponse?: ToolResponse;
  needsApproval?: boolean;
  wasRejected?: boolean;
  progress?: ToolProgressEntry[];

  // Status type fields
  agentState?: AgentState;

  // Thinking type fields (extended thinking)
  thinking?: string;

  // Compact summary flag (from /compact command)
  isCompactSummary?: boolean;

  // Usage limit type fields
  usageLimitMessage?: string;
}

/**
 * Tool approval request event (canUseTool callback based)
 */
export interface ToolApprovalRequestEvent {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/**
 * History update event
 */
export interface HistoryUpdateEvent {
  sessionId: string;
}

/**
 * Agent state change event
 */
export interface AgentStateChangeEvent {
  sessionId: string;
  state: AgentState;
}

/**
 * Stream event data - unified streaming event from backend
 */
export interface StreamEventData {
  sessionId: string;
  event: StreamEvent;
}

/**
 * Agent initialization request
 */
export interface AgentInitRequest {
  sessionId?: string;
  role?: RoleType;
  modelName?: string;
  apiKey?: string;
}

/**
 * Current agent information
 */
export interface CurrentAgentInfo {
  sessionId: string;
  role: RoleType;
  modelName: string;
}

/**
 * Session create request
 */
export interface SessionCreateRequest {
  title: string;
  role: RoleType;
  modelName: string;
  cwd: string;
}

/**
 * Session switch request
 */
export interface SessionSwitchRequest {
  sessionId: string;
}

/**
 * Cache stats
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  sessionIds: string[];
}

/**
 * Template create request
 */
export interface TemplateCreateRequest {
  name: string;
  content: string;
}

/**
 * Template update request
 */
export interface TemplateUpdateRequest {
  id: string;
  updates: {
    name?: string;
    content?: string;
  };
}

/**
 * Electron API exposed to renderer process
 */
export interface ElectronAPI {
  // Generic invoke for extensibility (skills, etc.)
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;

  // Service initialization
  service: {
    initialize: (request?: ServiceInitRequest) => Promise<ServiceInitResponse>;
    isInitialized: () => Promise<boolean>;
  };

  // Agent operations
  agent: {
    chat: (request: ChatRequest) => Promise<ChatResponse>;
    getCurrentInfo: () => Promise<{ success: boolean; data?: CurrentAgentInfo }>;
    onStreamEvent: (callback: (data: StreamEventData) => void) => void;
    cancelRequest: (sessionId?: string) => Promise<{ success: boolean; error?: string }>;
    // Tool approval via canUseTool callback
    onToolApprovalRequest: (callback: (data: ToolApprovalRequestEvent) => void) => void;
    approveTool: (toolUseId: string, updatedInput?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
    rejectTool: (toolUseId: string, message?: string) => Promise<{ success: boolean; error?: string }>;
    getPermissionMode: () => Promise<{ success: boolean; mode: PermissionMode }>;
    setPermissionMode: (mode: PermissionMode) => Promise<{ success: boolean; error?: string }>;
    getSettingSources: () => Promise<{ success: boolean; sources: SettingSource[] }>;
    setSettingSources: (sources: SettingSource[]) => Promise<{ success: boolean; error?: string }>;
  };

  // Session management
  session: {
    list: () => Promise<Session[]>;
    getHistory: (sessionId: string) => Promise<Array<{
      role: string;
      content: MessageContent;
      usage?: UsageMetadata;
      tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
      tool_responses?: Array<{ tool_call_id: string; output: string; error?: string }>;
      isUsageLimitError?: boolean;
    }>>;
    create: (request: SessionCreateRequest) => Promise<{ success: boolean; session?: Session; error?: string }>;
    switch: (request: SessionSwitchRequest) => Promise<{ success: boolean; error?: string }>;
    delete: (sessionId: string) => Promise<{ success: boolean; sessionId: string }>;
    updateTitle: (sessionId: string, newTitle: string) => Promise<{ success: boolean; session: Session }>;
    getLastCwd: () => Promise<string>;
    addAdditionalDirectory: (sessionId: string, directory: string) => Promise<{ success: boolean }>;
    removeAdditionalDirectory: (sessionId: string, directory: string) => Promise<{ success: boolean }>;
    getAdditionalDirectories: (sessionId: string) => Promise<string[]>;
    clearAdditionalDirectories: (sessionId: string) => Promise<{ success: boolean }>;
    getFileTree: (sessionId: string) => Promise<Array<{
      directoryType: 'cwd' | 'additional';
      directoryPath: string;
      directoryLabel: string;
      tree: FileTreeNode | null;
    }>>;
  };

  // Workspace management
  workspace: {
    selectDirectory: () => Promise<string | null>;
    list: () => Promise<string[]>;
    add: (dir: string) => Promise<boolean>;
    remove: (dir: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
    update: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    getFileTree: () => Promise<Array<{
      workspaceIndex: number;
      workspacePath: string;
      tree: FileTreeNode | null;
    }>>;
  };

  // Cache management
  cache: {
    getStats: () => Promise<CacheStats>;
  };

  // Template management
  templates: {
    list: () => Promise<{ success: boolean; templates?: PromptTemplate[] }>;
    get: (id: string) => Promise<{ success: boolean; template?: PromptTemplate }>;
    create: (request: TemplateCreateRequest) => Promise<{ success: boolean; template?: PromptTemplate }>;
    update: (id: string, updates: { name?: string; content?: string }) => Promise<{ success: boolean }>;
    delete: (id: string) => Promise<{ success: boolean }>;
  };

  // Model management - Claude only
  models: {
    list: (options?: { forceRefresh?: boolean }) => Promise<ModelInfo[]>;
    getDefault: () => Promise<string>;
  };

  // Authentication - Claude only
  auth: {
    isAuthenticated: () => Promise<AuthStatus>;
    loginWithOAuth: (options: OAuthLoginOptions) => Promise<OAuthResult>;
    logout: () => Promise<{ success: boolean }>;
    getOAuthInfo: () => Promise<{
      authenticated: boolean;
      subscriptionType?: string | null;
      expiresAt?: number;
      scopes?: string[];
    }>;
  };

  // Utility
  ping: () => Promise<string>;
}

// Extend Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
