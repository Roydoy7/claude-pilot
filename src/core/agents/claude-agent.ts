/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent - wraps Claude Agent SDK query() function
 * Provides streaming execution with tool support via MCP
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKToolProgressMessage,
  SDKAuthStatusMessage,
  SDKCommandsChangedMessage,
  SDKFilesPersistedEvent,
  Options,
  PermissionMode,
  CanUseTool,
  SettingSource,
  TerminalReason,
  EffortLevel,
} from '@anthropic-ai/claude-agent-sdk';
import { SessionManager } from '../sessions/session-manager.js';
import { readTranscript } from '../sessions/transcript-manager.js';
import { buildBaseQueryOptions } from './sdk-query.js';
import type { ContentBlock, MessageContent } from '../types/message-types.js';
import { getErrorMessage } from '../errors.js';

/**
 * Re-export message types for backward compatibility
 */
export type { ContentBlock, MessageContent };

/**
 * Re-export PermissionMode and SettingSource types from SDK
 */
export type { PermissionMode, SettingSource };

/**
 * All available setting sources
 */
export const ALL_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];

/**
 * Built-in file edit tools auto-approved under permissionMode 'acceptEdits'
 */
const FILE_EDIT_TOOLS = ['Write', 'Edit'];

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
 * Token usage metadata - matches SDK's usage structure
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
  /** Total cost in USD (if available) */
  total_cost_usd?: number;
  /** Service tier (standard, max, etc.) */
  service_tier?: string | null;
  /** Wall-clock duration of the turn in milliseconds (from result message) */
  duration_ms?: number;
  /** Number of agent turns in this exchange (from result message) */
  num_turns?: number;
  /** Model(s) used for this turn (from result message's modelUsage keys) */
  model?: string;
}

/**
 * Tool call for approval
 */
export interface ToolCallForApproval {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

/**
 * Agent execution state
 */
export interface AgentState {
  thinking: boolean;
  // Live estimate of thinking tokens consumed during the current thinking phase
  thinkingTokens?: number;
  tool?: {
    type: 'executing' | 'waiting_approval';
    toolName?: string;
  };
  // Slash command execution state
  command?: {
    name: string; // e.g., 'compact', 'help', 'clear'
    status: 'running' | 'completed';
  };
  // Message is queued (another request is being processed)
  queued?: boolean;
}

/**
 * Todo item structure
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

/**
 * Stream event types - yielded during agent execution
 */
export type StreamEvent =
  | { type: 'state'; state: AgentState }
  | { type: 'text_delta'; text: string; usage?: UsageMetadata }
  | { type: 'thinking'; thinking: string }
  | { type: 'thinking_tokens'; estimatedTokens: number }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; toolCallId: string; output: string; error?: string }
  | { type: 'tool_progress'; toolName: string; toolCallId?: string; progressType: string; message: string; timestamp: number }
  | { type: 'interrupt'; interruptId: string; toolCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> }
  | { type: 'error'; error: string; details?: string }
  | { type: 'usage_limit'; message: string }
  | { type: 'cancelled'; reason: string }
  | { type: 'checkpoint' }
  | { type: 'slashCommands'; commands: string[] }
  | { type: 'message'; content: string; timestamp: number; isCompactSummary?: boolean }
  | { type: 'done'; usage?: UsageMetadata; terminalReason?: TerminalReason };

/** Claude's rate-limit payload uses Unix seconds, while Date expects milliseconds. */
export function normalizeEpochMilliseconds(value: number): number {
  return Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
}

function isUsageLimitText(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes('limit reached') ||
    text.includes('session limit') ||
    text.includes('rate limit') ||
    text.includes('usage limit')
  );
}

/**
 * History message for conversation
 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: MessageContent;
  timestamp?: number;
  usage?: UsageMetadata;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  tool_responses?: Array<{ tool_call_id: string; output: string; error?: string }>;
  isCompactSummary?: boolean; // Flag for compact summary messages (from /compact command)
  isUsageLimitError?: boolean; // Flag for usage limit error messages (rate_limit)
}

/**
 * Agent configuration interface
 * Extends SDK Options with agent-specific metadata
 */
export interface ClaudeAgentConfig extends Options {
  // Agent metadata (not part of SDK Options)
  agentId: string;
  agentDisplayName: string;

  // Override model to make it required via modelName alias
  model?: string;
  modelName: string;

  // Auto-approved MCP tools (bypass canUseTool callback)
  autoApprovedMcpTools?: string[];
}

/**
 * Claude Agent instance
 * Wraps Claude Agent SDK with session context
 */
/**
 * Tool approval result - allow or deny tool execution
 */
interface ToolApprovalResult {
  approved: boolean;
  updatedInput?: Record<string, unknown>;
  message?: string;
}

/**
 * Pending tool approval - stores the resolve function for async approval
 */
interface PendingToolApproval {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: ToolApprovalResult) => void;
}

/**
 * Handler for tool approval requests - notifies UI to show approval dialog
 */
export type ToolApprovalRequestHandler = (
  toolUseId: string,
  toolName: string,
  toolInput: Record<string, unknown>
) => void;

export class ClaudeAgent {
  public readonly config: ClaudeAgentConfig;
  public readonly sessionId: string; //This is our local UUID session ID, created by frontend

  private abortController: AbortController | null = null;
  private turnCancelled: boolean = false;
  private conversationHistory: HistoryMessage[] = [];
  private claudeSessionId: string | undefined; // Claude SDK's session ID for resuming (from system init message)
  private cwd: string; // Session's working directory for transcript file lookup
  private currentQuery: Query | null = null; // Current query instance for runtime control
  private permissionMode: PermissionMode; // Current permission mode, persists across turns
  private settingSources: SettingSource[]; // Current setting sources, persists across turns
  private slashCommands: string[] = []; // Available slash commands from SDK
  private pendingToolApproval: PendingToolApproval | null = null; // Current pending tool approval
  private toolApprovalRequestHandler: ToolApprovalRequestHandler | null = null; // Handler for notifying UI
  private streamEndResolver: (() => void) | null = null; // Resolver to signal end of input stream
  private turnFinishedResolvers: Array<() => void> = []; // Resolved when run()'s finally block runs (turn truly ended)

  constructor(
    config: ClaudeAgentConfig,
    sessionId: string,
    cwd: string,
    claudeSessionId?: string
  ) {
    this.config = config;
    this.sessionId = sessionId;
    this.cwd = cwd;
    this.claudeSessionId = claudeSessionId;
    this.permissionMode = config.permissionMode || 'default';
    this.settingSources = config.settingSources || [...ALL_SETTING_SOURCES]; // Default to all sources

    // Load conversation history from transcript file if claudeSessionId exists
    if (claudeSessionId) {
      this.conversationHistory = readTranscript(claudeSessionId, cwd);
    }
  }

  /**
   * Cancel the ongoing request.
   *
   * Tries `query.interrupt()` first - the SDK's graceful stop (equivalent to
   * pressing Esc in Claude Code), which lets in-flight tools/hooks clean up
   * and keeps the CLI subprocess alive for the next turn. `interrupt()`
   * resolving only means the request was accepted, not that the turn
   * actually stopped (e.g. a tool ignoring the interrupt), so we wait for
   * `run()`'s finally block to confirm the turn really ended. If that
   * doesn't happen within ~2s, falls back to a hard `AbortController.abort()`.
   */
  async cancel(): Promise<void> {
    this.turnCancelled = true;
    // Release the stream generator if it's waiting
    if (this.streamEndResolver) {
      this.streamEndResolver();
      this.streamEndResolver = null;
    }

    const query = this.currentQuery;
    let turnEnded = !query;
    if (query) {
      query.interrupt().catch(() => {});
      turnEnded = await this.waitForTurnFinished(2000);
    }

    if (!turnEnded && this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  /**
   * Resolves true once `run()`'s finally block runs (the turn is fully over),
   * or false if timeoutMs elapses first.
   */
  private waitForTurnFinished(timeoutMs: number): Promise<boolean> {
    if (!this.currentQuery) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.turnFinishedResolvers.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /**
   * Check if current request is cancelled
   */
  isCancelled(): boolean {
    return this.turnCancelled || this.abortController?.signal.aborted || false;
  }

  /**
   * Get current permission mode
   */
  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  /**
   * Set permission mode for current and future queries
   * If a query is running, updates it immediately
   * Also saves the mode for next query initialization
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.permissionMode = mode;
    if (this.currentQuery) {
      await this.currentQuery.setPermissionMode(mode);
    }
  }

  /**
   * Get current setting sources
   */
  getSettingSources(): SettingSource[] {
    return [...this.settingSources];
  }

  /**
   * Set setting sources for future queries
   * Note: settingSources cannot be changed during a running query,
   * changes will take effect on the next query
   */
  setSettingSources(sources: SettingSource[]): void {
    this.settingSources = [...sources];
  }

  /**
   * Set model for current and future queries
   * If a query is running, updates it immediately
   * Also saves the model for next query initialization
   */
  async setModel(model?: string): Promise<void> {
    if (model) {
      this.config.modelName = model;
    }
    if (this.currentQuery) {
      await this.currentQuery.setModel(model);
    }
  }

  /**
   * Get current thinking effort level (undefined for models that don't support it)
   */
  getEffortLevel(): EffortLevel | undefined {
    return this.config.effort;
  }

  /**
   * Set thinking effort level for current and future queries
   * If a query is running, updates it immediately via applyFlagSettings
   * (the SDK's flag-settings layer doesn't support 'max', which only takes
   * effect on the next query). Also saves the level for next query initialization.
   */
  async setEffortLevel(level: EffortLevel): Promise<void> {
    this.config.effort = level;
    if (this.currentQuery && level !== 'max') {
      await this.currentQuery.applyFlagSettings({ effortLevel: level });
    }
  }

  /**
   * Set handler for tool approval requests
   * This handler is called when SDK needs user approval for a tool
   */
  setToolApprovalRequestHandler(handler: ToolApprovalRequestHandler | null): void {
    this.toolApprovalRequestHandler = handler;
  }

  /**
   * Create canUseTool callback for SDK
   * This callback is called by SDK when a tool needs permission
   * Returns a Promise that resolves when user approves/rejects via UI
   */
  private createCanUseToolCallback(): CanUseTool {
    return async (
      toolName: string,
      toolInput: Record<string, unknown>,
      options: { signal: AbortSignal; toolUseID: string }
    ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string }> => {
      // Check if this MCP tool is auto-approved
      const autoApprovedMcpTools = this.config.autoApprovedMcpTools || [];
      if (autoApprovedMcpTools.includes(toolName)) {
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      }

      // bypassPermissions: auto-allow every tool call
      if (this.permissionMode === 'bypassPermissions') {
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      }

      // acceptEdits: auto-allow built-in file edit tools (Write/Edit)
      if (this.permissionMode === 'acceptEdits' && FILE_EDIT_TOOLS.includes(toolName)) {
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      }

      // plan: no tool execution allowed - deny everything except ExitPlanMode,
      // which is the user's actual decision point and falls through to the UI prompt below
      if (this.permissionMode === 'plan' && toolName !== 'ExitPlanMode') {
        return {
          behavior: 'deny',
          message: 'Currently in plan mode: no tool execution is allowed. Call ExitPlanMode to present your plan.',
        };
      }

      // dontAsk: deny tools that aren't pre-approved, never prompt the user
      if (this.permissionMode === 'dontAsk') {
        return {
          behavior: 'deny',
          message: 'Tool not pre-approved under dontAsk permission mode',
        };
      }

      // Create a Promise that will be resolved when user approves/rejects
      const approvalPromise = new Promise<ToolApprovalResult>((resolve) => {
        this.pendingToolApproval = {
          toolUseId: options.toolUseID,
          toolName,
          input: toolInput,
          resolve,
        };
      });

      // Notify UI about the pending approval via handler
      if (this.toolApprovalRequestHandler) {
        this.toolApprovalRequestHandler(options.toolUseID, toolName, toolInput);
      }

      // Wait for user decision or abort signal
      const result = await Promise.race([
        approvalPromise,
        new Promise<ToolApprovalResult>((resolve) => {
          // If the signal is already aborted, the 'abort' event will never fire -
          // resolve immediately instead of hanging the approval forever.
          if (options.signal.aborted) {
            resolve({ approved: false, message: 'Request aborted' });
            return;
          }
          options.signal.addEventListener('abort', () => {
            resolve({ approved: false, message: 'Request aborted' });
          }, { once: true });
        }),
      ]);

      // Clear pending approval
      this.pendingToolApproval = null;

      if (result.approved) {
        return {
          behavior: 'allow',
          updatedInput: result.updatedInput || toolInput,
        };
      } else {
        return {
          behavior: 'deny',
          message: result.message || 'Tool execution denied by user',
        };
      }
    };
  }

  /**
   * Approve a pending tool call
   * Called by IPC handler when user clicks approve in UI
   */
  approveToolCall(toolUseId: string, updatedInput?: Record<string, unknown>): boolean {
    if (!this.pendingToolApproval || this.pendingToolApproval.toolUseId !== toolUseId) {
      console.warn(`No pending approval for tool ${toolUseId}`);
      return false;
    }

    this.pendingToolApproval.resolve({
      approved: true,
      updatedInput: updatedInput || this.pendingToolApproval.input,
    });
    return true;
  }

  /**
   * Reject a pending tool call
   * Called by IPC handler when user clicks reject in UI
   */
  rejectToolCall(toolUseId: string, message?: string): boolean {
    if (!this.pendingToolApproval || this.pendingToolApproval.toolUseId !== toolUseId) {
      console.warn(`No pending approval for tool ${toolUseId}`);
      return false;
    }

    this.pendingToolApproval.resolve({
      approved: false,
      message: message || 'Tool execution rejected by user, stop and waiting for next instruction.',
    });
    return true;
  }

  /**
   * Check if there's a pending tool approval
   */
  hasPendingToolApproval(): boolean {
    return this.pendingToolApproval !== null;
  }

  /**
   * Get pending tool approval info
   */
  getPendingToolApproval(): { toolUseId: string; toolName: string; input: Record<string, unknown> } | null {
    if (!this.pendingToolApproval) {
      return null;
    }
    return {
      toolUseId: this.pendingToolApproval.toolUseId,
      toolName: this.pendingToolApproval.toolName,
      input: this.pendingToolApproval.input,
    };
  }

  /**
   * Process SDK messages and yield StreamEvents
   */
  private async *processQueryMessages(
    queryInstance: Query
  ): AsyncGenerator<StreamEvent, void, unknown> {
    yield { type: 'state', state: { thinking: true } };

    let accumulatedText = '';
    let finalUsage: UsageMetadata | undefined;
    let terminalReason: TerminalReason | undefined;
    let isCompacting = false;
    let usageLimitReported = false;

    try {
      for await (const chunk of queryInstance) {
        if (this.isCancelled()) {
          yield { type: 'cancelled', reason: 'Request cancelled by user' };
          break;
        }

        switch (chunk.type) {
          case 'stream_event': {
            const partialMessage = chunk as SDKPartialAssistantMessage;
            const event = partialMessage.event;

            // Note: Don't yield text_delta or tool_start here - wait for complete assistant message
            // stream_event is for partial updates, assistant message has the complete content
            // Only update state here to show tool is being used

            if (event.type === 'content_block_start') {
              const contentBlock = (event as { content_block?: { type?: string; id?: string; name?: string } }).content_block;
              if (contentBlock?.type === 'tool_use' && contentBlock.name) {
                // Only update state - tool_start will be sent from assistant message with complete args
                yield {
                  type: 'state',
                  state: { thinking: true, tool: { type: 'executing', toolName: contentBlock.name } },
                };
              }
            }
            break;
          }

          case 'assistant': {
            const assistantMessage = chunk as SDKAssistantMessage;
            yield { type: 'checkpoint' };

            // Update session checkpoint metadata
            if (assistantMessage.session_id) {
              const sessionManager = SessionManager.getInstance();
              sessionManager.updateSessionCheckpoint(this.sessionId, assistantMessage.session_id);
            }

            // Extract usage from assistant message - this is the real-time per-message usage
            // NOTE: result.usage is cumulative (sum of all API calls in turn), but message.usage
            // is the actual usage for this specific API call, which is what we want to display
            const msgUsage = assistantMessage.message?.usage;
            let currentUsage: UsageMetadata | undefined;
            if (msgUsage) {
              currentUsage = {
                input_tokens: msgUsage.input_tokens || 0,
                output_tokens: msgUsage.output_tokens || 0,
                total_tokens: (msgUsage.input_tokens || 0) + (msgUsage.output_tokens || 0),
                cache_read_input_tokens: msgUsage.cache_read_input_tokens ?? undefined,
                cache_creation_input_tokens: msgUsage.cache_creation_input_tokens ?? undefined,
                cache_creation: msgUsage.cache_creation ?? undefined,
                service_tier: msgUsage.service_tier,
              };
              finalUsage = currentUsage;
            }

            // Extract and yield message content from assistant message
            if (assistantMessage.message?.content) {
              const content = assistantMessage.message.content;

              if (Array.isArray(content)) {
                for (const block of content) {
                  switch (block.type) {
                    case 'thinking': {
                      // Extended thinking content
                      if ('thinking' in block) {
                        const thinkingBlock = block as { type: 'thinking'; thinking: string };
                        yield { type: 'thinking', thinking: thinkingBlock.thinking };
                      }
                      break;
                    }

                    case 'redacted_thinking': {
                      // Redacted thinking - inform user that thinking was redacted
                      yield { type: 'thinking', thinking: '[Thinking content redacted]' };
                      break;
                    }

                    case 'text': {
                      // Text content
                      if (block.text) {
                        // Check for API error in response
                        if (block.text.startsWith('API Error:')) {
                          yield { type: 'error', error: block.text };
                          yield { type: 'state', state: { thinking: false } };
                          yield { type: 'done' };
                          return;
                        }
                        accumulatedText += block.text;
                        yield { type: 'text_delta', text: block.text, usage: currentUsage };
                      }
                      break;
                    }

                    case 'tool_use': {
                      // Tool use block - contains complete tool call with args
                      // Note: tool_start was already sent from stream_event with empty args
                      // Here we have the complete args, so update the tool call
                      const toolUseBlock = block as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
                      // Yield tool_start with complete args (overwrites the earlier empty-args version)
                      yield {
                        type: 'tool_start',
                        toolCallId: toolUseBlock.id,
                        toolName: toolUseBlock.name,
                        args: toolUseBlock.input,
                      };
                      break;
                    }

                    case 'server_tool_use': {
                      // Server-managed tools (e.g., web_search)
                      const serverToolBlock = block as { type: 'server_tool_use'; id: string; name: string; input: Record<string, unknown> };
                      yield {
                        type: 'tool_start',
                        toolCallId: serverToolBlock.id,
                        toolName: `server:${serverToolBlock.name}`,
                        args: serverToolBlock.input,
                      };
                      break;
                    }

                    case 'web_search_tool_result': {
                      // Web search results - treat as tool end
                      const webSearchBlock = block as { type: 'web_search_tool_result'; tool_use_id: string; content: unknown };
                      yield {
                        type: 'tool_end',
                        toolName: 'server:web_search',
                        toolCallId: webSearchBlock.tool_use_id,
                        output: JSON.stringify(webSearchBlock.content),
                      };
                      break;
                    }

                    // Unknown block types are silently ignored
                  }
                }
              }
            }

            // Refusal: safety classifier declined the request (HTTP 200, stop_reason: 'refusal').
            // A pre-output refusal carries empty content; a mid-stream refusal bills the
            // already-streamed partial output, which we keep and mark as refused.
            if (assistantMessage.message?.stop_reason === 'refusal') {
              const stopDetails = assistantMessage.message.stop_details;
              const detail = [stopDetails?.category, stopDetails?.explanation].filter(Boolean).join(': ');
              yield {
                type: 'error',
                error: detail ? `Response refused (${detail})` : 'Response refused by safety classifier',
              };
            }
            break;
          }

          case 'user': {
            const userMessage = chunk as SDKUserMessage;

            // Check if this is a compact summary message
            // SDK may include isCompactSummary flag, or the content may start with the compact summary prefix
            const COMPACT_SUMMARY_PREFIX = 'This session is being continued from a previous conversation';
            const messageContent = userMessage.message?.content;
            const isCompactSummaryFlag = (userMessage as SDKUserMessage & { isCompactSummary?: boolean }).isCompactSummary;
            const contentStartsWithSummary = typeof messageContent === 'string' && messageContent.startsWith(COMPACT_SUMMARY_PREFIX);
            const isCompactSummary = isCompactSummaryFlag || contentStartsWithSummary;

            if (isCompactSummary) {
              // Extract summary text from message content
              if (typeof messageContent === 'string') {
                // Yield the compact summary as an assistant message for display
                yield {
                  type: 'message',
                  content: messageContent,
                  timestamp: Date.now(),
                  isCompactSummary: true,
                };
                // Also store in conversation history
                this.conversationHistory.push({
                  role: 'assistant',
                  content: messageContent,
                  timestamp: Date.now(),
                  isCompactSummary: true,
                });
              }
              break;
            }

            // Process tool_result blocks from message content
            // Each tool_result has its own tool_use_id, allowing parallel tool results
            if (Array.isArray(messageContent)) {
              for (const block of messageContent) {
                if (block.type === 'tool_result' && 'tool_use_id' in block) {
                  const toolResultBlock = block as {
                    type: 'tool_result';
                    tool_use_id: string;
                    content?: unknown;
                    is_error?: boolean;
                  };

                  const toolUseId = toolResultBlock.tool_use_id;
                  const isError = !!toolResultBlock.is_error;
                  const blockContent = toolResultBlock.content;

                  // Get output from tool_use_result if available, otherwise from block content
                  let output: string;
                  if (userMessage.tool_use_result !== undefined) {
                    output = typeof userMessage.tool_use_result === 'string'
                      ? userMessage.tool_use_result
                      : JSON.stringify(userMessage.tool_use_result);
                  } else {
                    output = typeof blockContent === 'string'
                      ? blockContent
                      : JSON.stringify(blockContent || '');
                  }

                  const errorContent = isError
                    ? (typeof blockContent === 'string' ? blockContent : JSON.stringify(blockContent || 'Tool execution failed'))
                    : undefined;

                  yield {
                    type: 'tool_end',
                    toolName: 'unknown',
                    toolCallId: toolUseId,
                    output: isError ? '' : output,
                    error: errorContent,
                  };
                }
              }
              yield { type: 'state', state: { thinking: true } };
            }
            break;
          }

          case 'tool_progress': {
            const progressMessage = chunk as SDKToolProgressMessage;
            yield {
              type: 'tool_progress',
              toolName: progressMessage.tool_name,
              toolCallId: progressMessage.tool_use_id,
              progressType: 'progress',
              message: `Elapsed: ${progressMessage.elapsed_time_seconds}s`,
              timestamp: Date.now(),
            };
            break;
          }

          case 'result': {
            const resultMessage = chunk as SDKResultMessage;
            terminalReason = resultMessage.terminal_reason;

            // Signal the input stream generator to end
            // This allows SDK to properly close stdin after conversation ends
            if (this.streamEndResolver) {
              this.streamEndResolver();
              this.streamEndResolver = null;
            }

            // Update session checkpoint metadata on result
            if (resultMessage.session_id) {
              const sessionManager = SessionManager.getInstance();
              sessionManager.updateSessionCheckpoint(this.sessionId, resultMessage.session_id);
            }

            // NOTE: result.usage is cumulative (sum of all API calls in this turn)
            // We use finalUsage from the last assistant message instead, which has
            // the actual per-message usage that matches what's stored in transcripts.
            // Turn-level stats (cost, duration, turn count, model) are only available
            // on the result message, so merge them into finalUsage here.
            if (resultMessage.subtype === 'success') {
              if (finalUsage) {
                finalUsage = {
                  ...finalUsage,
                  total_cost_usd: resultMessage.total_cost_usd,
                  duration_ms: resultMessage.duration_ms,
                  num_turns: resultMessage.num_turns,
                  model: Object.keys(resultMessage.modelUsage)[0],
                };
              }
              if (accumulatedText) {
                this.conversationHistory.push({
                  role: 'assistant',
                  content: accumulatedText,
                  timestamp: Date.now(),
                  usage: finalUsage, // Use usage from last assistant message
                });
              }
            } else {
              const errors = 'errors' in resultMessage ? resultMessage.errors : [];
              const errorText = errors.join(', ');
              if (!usageLimitReported && isUsageLimitText(errorText)) {
                usageLimitReported = true;
                yield { type: 'usage_limit', message: errorText || 'Usage limit reached' };
              } else if (!usageLimitReported) {
                yield {
                  type: 'error',
                  error: `Execution ${resultMessage.subtype}: ${errorText}`,
                };
              }
            }
            break;
          }

          case 'system': {
            switch (chunk.subtype) {
              case 'init': {
                // System initialization - store session_id for resume
                this.claudeSessionId = chunk.session_id;

                // Save Claude session ID to SessionManager for persistence
                if (chunk.session_id) {
                  const sessionManager = SessionManager.getInstance();
                  sessionManager.updateClaudeSessionId(this.sessionId, chunk.session_id);
                }

                // Capture available slash commands
                if (chunk.slash_commands) {
                  this.slashCommands = chunk.slash_commands;
                  yield { type: 'slashCommands', commands: this.slashCommands };
                }
                break;
              }

              case 'compact_boundary': {
                // Conversation compaction boundary - checkpoint event
                yield { type: 'checkpoint' };
                break;
              }

              case 'status': {
                if (chunk.status === 'compacting') {
                  isCompacting = true;
                  // Compacting started - show command running state
                  yield {
                    type: 'state',
                    state: {
                      thinking: true,
                      command: { name: 'compact', status: 'running' },
                    },
                  };
                } else if (chunk.status === null && isCompacting) {
                  // Compacting finished - clear command state.
                  // Other status:null messages (e.g. permission mode change
                  // notifications, 'requesting' cleared) must NOT clear the
                  // thinking state - the turn is still running.
                  isCompacting = false;
                  yield {
                    type: 'state',
                    state: {
                      thinking: false,
                      command: { name: 'compact', status: 'completed' },
                    },
                  };
                  if (chunk.compact_result === 'failed') {
                    yield { type: 'error', error: chunk.compact_error ?? 'Compaction failed' };
                  }
                }
                // 'requesting' status is a transient sub-state of the existing 'thinking' state - no separate UI
                break;
              }

              case 'commands_changed': {
                // Mid-session slash command list change - replace cached list (per SDK docs)
                // Explicit type: sdk.d.ts ships with unresolved names in the
                // SDKMessage union (upstream packaging bug), collapsing it to
                // `any`, so chunk carries no inferred type here.
                this.slashCommands = (chunk as SDKCommandsChangedMessage).commands.map((command) => command.name);
                yield { type: 'slashCommands', commands: this.slashCommands };
                break;
              }

              case 'local_command_output': {
                // Output from a local slash command (e.g. /usage) - display as assistant text
                yield { type: 'message', content: chunk.content, timestamp: Date.now() };
                break;
              }

              case 'plugin_install': {
                if (chunk.status === 'failed') {
                  yield {
                    type: 'error',
                    error: `Plugin install failed${chunk.name ? ` (${chunk.name})` : ''}: ${chunk.error ?? 'unknown error'}`,
                  };
                }
                // started/installed/completed: progress only, no UI surface
                break;
              }

              case 'permission_denied': {
                // Tool call auto-denied without an interactive prompt (e.g. dontAsk/auto mode rule)
                yield {
                  type: 'tool_end',
                  toolName: chunk.tool_name,
                  toolCallId: chunk.tool_use_id,
                  output: '',
                  error: chunk.message,
                };
                break;
              }

              case 'files_persisted': {
                const persistedEvent = chunk as SDKFilesPersistedEvent;
                if (persistedEvent.failed.length > 0) {
                  yield {
                    type: 'error',
                    error: `Failed to persist files: ${persistedEvent.failed.map((file) => `${file.filename} (${file.error})`).join(', ')}`,
                  };
                }
                break;
              }

              case 'mirror_error': {
                // Transcript-mirror batch dropped after retries - surface data-loss risk
                yield { type: 'error', error: `Session transcript mirror failed: ${chunk.error}` };
                break;
              }

              case 'model_refusal_fallback': {
                // The original refusal is already surfaced from the 'assistant' case;
                // the SDK automatically retries and emits a fresh 'assistant' message
                // with the fallback model's content, handled normally.
                break;
              }

              case 'api_retry': {
                // Automatic retry of a failed API request - 'thinking' state already covers this
                break;
              }

              case 'hook_started':
              case 'hook_progress':
              case 'hook_response': {
                // Hook execution lifecycle is internal, no need to yield to frontend
                break;
              }

              case 'task_notification':
              case 'task_started':
              case 'task_updated':
              case 'task_progress': {
                // Task tool UI rendering is handled separately (TodoWrite -> Task migration)
                break;
              }

              case 'thinking_tokens': {
                // Approximate live thinking-token estimate for spinners - not authoritative usage
                yield { type: 'thinking_tokens', estimatedTokens: chunk.estimated_tokens };
                break;
              }

              case 'session_state_changed': {
                // Authoritative turn-over signal; thinking state is currently derived from the message stream
                break;
              }

              case 'notification': {
                // Loop-side REPL notification queue mirror - no SDK host UI surface yet
                break;
              }

              case 'memory_recall': {
                // "Recalled from memory" inline display - no UI surface yet
                break;
              }

              case 'elicitation_complete': {
                // MCP server confirms a URL-mode elicitation finished - informational only
                break;
              }

              case 'worker_shutting_down': {
                // Opt-in graceful worker teardown notice (e.g. host_exit, remote_control_disabled) - no UI surface yet
                break;
              }

              case 'informational': {
                // Host-rendered system notice (info/notice/suggestion/warning) - no UI surface yet
                break;
              }

              default: {
                // Exhaustiveness check disabled: SDKMessage collapses to `any`
                // due to unresolved names in the shipped sdk.d.ts (upstream
                // packaging bug). Restore `= chunk` once fixed upstream.
                const _exhaustive: never = chunk as never;
                break;
              }
            }
            break;
          }

          case 'auth_status': {
            // Authentication status message
            const authMessage = chunk as SDKAuthStatusMessage;
            if (authMessage.error) {
              yield {
                type: 'error',
                error: `Authentication error: ${authMessage.error}`,
              };
            }
            break;
          }

          case 'rate_limit_event': {
            if (chunk.rate_limit_info.status === 'rejected') {
              const resetsAt = chunk.rate_limit_info.resetsAt;
              usageLimitReported = true;
              yield {
                type: 'usage_limit',
                message: resetsAt
                  ? `Usage limit reached. Resets at ${new Date(normalizeEpochMilliseconds(resetsAt)).toLocaleString()}`
                  : 'Usage limit reached',
              };
            }
            break;
          }

          case 'prompt_suggestion': {
            // Predicted next-prompt suggestions - no UI surface yet
            break;
          }

          case 'tool_use_summary': {
            // Summary of tool uses for compacted transcripts - no UI surface yet
            break;
          }

          // user message replay is same structure as user, handled by 'user' case
          // The SDK sends it with type: 'user' and isReplay: true flag

          default: {
            // Exhaustiveness check disabled: SDKMessage collapses to `any`
            // due to unresolved names in the shipped sdk.d.ts (upstream
            // packaging bug). Restore `= chunk` once fixed upstream.
            const _exhaustive: never = chunk as never;
            break;
          }
        }
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      // Check if this is a user-initiated cancellation (from SDK abort)
      const isUserCancellation =
        errorMessage.toLowerCase().includes('aborted by user') ||
        errorMessage.toLowerCase().includes('cancelled by user') ||
        errorMessage.toLowerCase().includes('canceled by user') ||
        this.isCancelled();

      // Check if this is a usage limit error
      const isUsageLimitError = isUsageLimitText(errorMessage) || errorMessage.toLowerCase().includes('resets');

      if (isUserCancellation) {
        yield { type: 'cancelled', reason: errorMessage };
      } else if (isUsageLimitError) {
        yield { type: 'usage_limit', message: errorMessage };
      } else {
        yield {
          type: 'error',
          error: errorMessage,
          details: error instanceof Error ? error.stack : undefined,
        };
      }
    } finally {
      yield { type: 'state', state: { thinking: false } };
      yield { type: 'done', usage: finalUsage, terminalReason };
    }
  }

  /**
   * Create message generator for streaming input mode
   * Returns AsyncIterable<SDKUserMessage> as required by SDK
   */
  private async *generateMessages(content: MessageContent): AsyncIterable<SDKUserMessage> {
    // Convert MessageContent to SDK's expected format
    let messageContent: string | Array<{ type: string; text?: string; source?: unknown }>;

    if (typeof content === 'string') {
      messageContent = content;
    } else {
      // Convert content blocks to SDK format
      messageContent = content.map(block => {
        if (block.type === 'image') {
          return {
            type: 'image',
            source: block.source,
          };
        } else if (block.type === 'text') {
          return {
            type: 'text',
            text: block.text || '',
          };
        } else {
          // For other types (tool_use, tool_result, thinking), convert to text representation
          return {
            type: 'text',
            text: JSON.stringify(block),
          };
        }
      });
    }

    // Yield SDK-compatible user message
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: messageContent,
      },
      parent_tool_use_id: null,
    } as SDKUserMessage;

    // Keep the generator alive until the conversation ends
    // This prevents SDK from closing stdin prematurely (which breaks tool approval requests)
    // The streamEndResolver is called when we receive a 'result' message
    await new Promise<void>((resolve) => {
      this.streamEndResolver = resolve;
    });
  }

  /**
   * Run agent with user input (using streaming input mode)
   * @param input User message content
   */
  async *run(input: MessageContent): AsyncGenerator<StreamEvent, void, unknown> {
    this.abortController = new AbortController();
    this.turnCancelled = false;

    this.conversationHistory.push({
      role: 'user',
      content: input,
      timestamp: Date.now(),
    });

    try {
      // Get session to access cwd and additionalDirectories
      const sessionManager = SessionManager.getInstance();
      const session = sessionManager.loadSession(this.sessionId);

      // Build Options from config, excluding agent-specific metadata
      const { agentId, agentDisplayName, modelName, ...sdkOptions } = this.config;

      const canUseToolCallback = this.toolApprovalRequestHandler
        ? this.createCanUseToolCallback()
        : undefined;

      const options: Options = {
        ...sdkOptions,
        ...buildBaseQueryOptions(this.cwd, this.abortController),
        model: modelName,
        additionalDirectories: session?.additionalDirectories, // Set additional directories from session
        // No maxTurns limit - allow unlimited turns like Claude Code interactive mode
        resume: this.claudeSessionId,
        permissionMode: this.permissionMode, // Use instance variable (may be updated via setPermissionMode)
        // Required by the SDK for permissionMode 'bypassPermissions' to take effect; actual bypass
        // decisions are still gated by our own canUseTool callback based on the active permissionMode
        allowDangerouslySkipPermissions: true,
        settingSources: this.settingSources, // Use instance variable (may be updated via setSettingSources)
        canUseTool: canUseToolCallback,
        hooks: {
          // PreToolUse: Auto-inject workingDirectory for all tools
          PreToolUse: [{
            hooks: [async (input) => {
              if (input.hook_event_name === 'PreToolUse') {
                const toolInput = input.tool_input as Record<string, unknown> | undefined;

                // Auto-inject workingDirectory for all tools if not specified
                if (toolInput && !toolInput.workingDirectory) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse' as const,
                      updatedInput: {
                        ...toolInput,
                        workingDirectory: input.cwd,
                      },
                    },
                  };
                }
              }
              return {};
            }],
          }],
        },
        stderr: (message: string) => {
          console.error('[Claude SDK stderr]', message);
        },
      };

      // Use streaming input mode with async generator
      this.currentQuery = query({
        prompt: this.generateMessages(input),
        options,
      });

      yield* this.processQueryMessages(this.currentQuery);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      yield { type: 'error', error: errorMessage };
      yield { type: 'state', state: { thinking: false } };
      yield { type: 'done' };
    } finally {
      this.abortController = null;
      this.turnCancelled = false;
      this.currentQuery = null;

      const resolvers = this.turnFinishedResolvers;
      this.turnFinishedResolvers = [];
      resolvers.forEach((resolve) => resolve());
    }
  }

  /**
   * Resume execution - not needed with canUseTool callback
   */
  async *resume(
    _decisions: Array<{ decision: 'approve' | 'reject' | 'edit'; args?: Record<string, unknown>; feedback?: string }>
  ): AsyncGenerator<StreamEvent, void, unknown> {
    yield { type: 'error', error: 'Resume not needed - use canUseTool callback for approvals' };
    yield { type: 'done' };
  }

  /**
   * Get conversation history from SDK transcript file
   * SDK stores conversation history in transcript files, we read them directly for UI display
   */
  async getHistory(): Promise<HistoryMessage[]> {
    return this.conversationHistory;
  }

  /**
   * Get agent id
   */
  getAgentId(): string {
    return this.config.agentId;
  }

  /**
   * Get agent display name
   */
  getAgentDisplayName(): string {
    return this.config.agentDisplayName;
  }

  /**
   * Get model name
   */
  getModelName(): string {
    return this.config.modelName;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.claudeSessionId = undefined;
  }
}
