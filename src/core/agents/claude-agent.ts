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
  SDKFilesPersistedEvent,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
  SDKTaskUpdatedMessage,
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
import { parseTaskNotifications, type TaskNotification } from '../utils/task-notification.js';
import { writeAgentLifecycleLog } from '../utils/agent-lifecycle-log.js';

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
 * How long to wait after a `result` with no live tasks before closing the
 * streaming input. Long enough to absorb a task_started or injected
 * task-notification that trails the model-turn boundary, short enough that
 * the turn still ends promptly when nothing follows.
 */
const STREAM_CLOSE_GRACE_MS = 1500;

/**
 * Last-resort fallback while stdin is held open for live background tasks
 * (see `scheduleStreamClose`/`activeTasks`). If no task message (started/
 * progress/notification/updated) arrives for this long, something is stuck
 * with no visible cause (API retry storm, deadlocked approval, etc.) - force
 * the stream closed rather than hang forever.
 */
const TASK_STALL_TIMEOUT_MS = 15 * 60 * 1000;

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
  // The SDK is retrying a failed API request (e.g. 429 rate limit). Without
  // this the UI shows a silent stall while the retry backoff runs - which can
  // last minutes when quota is exhausted. Not attributable to a specific
  // subagent (the SDK message carries no parent_tool_use_id), so it is
  // surfaced globally. Cleared when normal stream activity resumes.
  apiRetry?: {
    attempt: number;
    maxRetries: number;
    retryDelayMs: number;
    errorStatus: number | null;
    errorType?: string;
    timestamp: number;
  };
  // A subagent (Agent/Task tool) is currently running - lets the UI show
  // what it's doing instead of a generic "AI is thinking"
  subagent?: {
    toolCallId: string;
    name: string;
    lastToolName?: string;
    elapsedSeconds?: number;
  };
  // All SDK-managed background tasks that are still alive. Unlike `subagent`,
  // this is keyed by task_id and therefore remains accurate when several
  // Agent calls run concurrently or before their nested assistant output starts.
  activeTasks?: Array<{
    taskId: string;
    toolUseId?: string;
    subagentType?: string;
    description: string;
    status: 'pending' | 'running' | 'paused';
    isBackgrounded: boolean;
    lastToolName?: string;
    totalTokens?: number;
    toolUses?: number;
    durationMs?: number;
  }>;
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
  | { type: 'thinking'; thinking: string; parentToolCallId?: string }
  | { type: 'thinking_tokens'; estimatedTokens: number }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown>; parentToolCallId?: string }
  | { type: 'tool_end'; toolName: string; toolCallId: string; output: string; error?: string; parentToolCallId?: string }
  | { type: 'tool_progress'; toolName: string; toolCallId?: string; progressType: string; message: string; timestamp: number; parentToolCallId?: string }
  | { type: 'subagent_text'; parentToolCallId: string; text: string }
  | { type: 'subagent_activity_delta'; parentToolCallId: string; activityId: string; kind: 'thinking' | 'text'; delta: string }
  | { type: 'subagent_skills'; parentToolCallId: string; skills: string[] }
  // Liveness signal for a running subagent whose content the CLI does not
  // stream (subagent partials are never emitted; complete blocks can be
  // minutes apart during long generations). Lets the UI show "still working"
  // instead of appearing frozen between blocks.
  | { type: 'subagent_heartbeat'; parentToolCallId: string; lastToolName?: string; totalTokens?: number; elapsedSeconds?: number; timestamp: number }
  // A failed API request is being retried after a backoff delay. This is the
  // only signal the SDK emits during a rate-limit (429) retry storm - without
  // it the whole session looks frozen with no console errors.
  | { type: 'api_retry'; attempt: number; maxRetries: number; retryDelayMs: number; errorStatus: number | null; errorType?: string; timestamp: number }
  | { type: 'interrupt'; interruptId: string; toolCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> }
  | { type: 'error'; error: string; details?: string }
  | { type: 'usage_limit'; message: string }
  | { type: 'cancelled'; reason: string }
  | { type: 'checkpoint' }
  | { type: 'slashCommands'; commands: string[] }
  | { type: 'message'; content: string; timestamp: number; isCompactSummary?: boolean }
  | { type: 'task_notification'; notification: TaskNotification; timestamp: number }
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
  taskNotification?: TaskNotification; // Parsed <task-notification> from a background subagent
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
  sessionId: string,
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
  // Pending tool approvals, keyed by toolUseId. Concurrent subagents can each
  // have their own tool awaiting approval at the same time - a single slot
  // would let a second request silently overwrite the first, permanently
  // losing its resolve() and deadlocking that subagent's canUseTool promise.
  private pendingToolApprovals = new Map<string, PendingToolApproval>();
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

    // bypassPermissions auto-approves everything, including any approvals already
    // waiting on the user - resolve them so their dialogs don't hang forever
    if (mode === 'bypassPermissions' && this.pendingToolApprovals.size > 0) {
      for (const pending of this.pendingToolApprovals.values()) {
        pending.resolve({ approved: true, updatedInput: pending.input });
      }
      this.pendingToolApprovals.clear();
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
    const logDecision = (decision: string, toolUseId: string, toolName: string, extra: Record<string, unknown> = {}): void => {
      const entry = {
        event: 'can_use_tool',
        sessionId: this.sessionId,
        toolUseId,
        toolName,
        decision,
        pendingApprovalCount: this.pendingToolApprovals.size,
        ...extra,
      };
      console.log('[claude-agent] task lifecycle', entry);
      writeAgentLifecycleLog(entry);
    };

    return async (
      toolName: string,
      toolInput: Record<string, unknown>,
      options: { signal: AbortSignal; toolUseID: string }
    ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string }> => {
      logDecision('entry', options.toolUseID, toolName);

      // Check if this MCP tool is auto-approved
      const autoApprovedMcpTools = this.config.autoApprovedMcpTools || [];
      if (autoApprovedMcpTools.includes(toolName)) {
        logDecision('auto-approved-mcp', options.toolUseID, toolName);
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      }

      // bypassPermissions: auto-allow every tool call
      if (this.permissionMode === 'bypassPermissions') {
        logDecision('auto-approved-bypass', options.toolUseID, toolName);
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      }

      // acceptEdits: auto-allow built-in file edit tools (Write/Edit)
      if (this.permissionMode === 'acceptEdits' && FILE_EDIT_TOOLS.includes(toolName)) {
        logDecision('auto-approved-accept-edits', options.toolUseID, toolName);
        return {
          behavior: 'allow',
          updatedInput: toolInput,
        };
      }

      // plan: no tool execution allowed - deny everything except ExitPlanMode,
      // which is the user's actual decision point and falls through to the UI prompt below
      if (this.permissionMode === 'plan' && toolName !== 'ExitPlanMode') {
        logDecision('denied-plan-mode', options.toolUseID, toolName);
        return {
          behavior: 'deny',
          message: 'Currently in plan mode: no tool execution is allowed. Call ExitPlanMode to present your plan.',
        };
      }

      // dontAsk: deny tools that aren't pre-approved, never prompt the user
      if (this.permissionMode === 'dontAsk') {
        logDecision('denied-dont-ask', options.toolUseID, toolName);
        return {
          behavior: 'deny',
          message: 'Tool not pre-approved under dontAsk permission mode',
        };
      }

      // Create a Promise that will be resolved when user approves/rejects.
      // Keyed by toolUseId so concurrent subagents each get their own slot -
      // see pendingToolApprovals field comment.
      const approvalPromise = new Promise<ToolApprovalResult>((resolve) => {
        this.pendingToolApprovals.set(options.toolUseID, {
          toolUseId: options.toolUseID,
          toolName,
          input: toolInput,
          resolve,
        });
      });

      // Notify UI about the pending approval via handler
      if (this.toolApprovalRequestHandler) {
        this.toolApprovalRequestHandler(this.sessionId, options.toolUseID, toolName, toolInput);
      }
      logDecision('awaiting-ui', options.toolUseID, toolName);

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
      this.pendingToolApprovals.delete(options.toolUseID);
      logDecision(result.approved ? 'resolved-approved' : 'resolved-denied', options.toolUseID, toolName, {
        message: result.message,
      });

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
    const pending = this.pendingToolApprovals.get(toolUseId);
    if (!pending) {
      console.warn(`No pending approval for tool ${toolUseId}`);
      return false;
    }

    pending.resolve({
      approved: true,
      updatedInput: updatedInput || pending.input,
    });
    return true;
  }

  /**
   * Reject a pending tool call
   * Called by IPC handler when user clicks reject in UI
   */
  rejectToolCall(toolUseId: string, message?: string): boolean {
    const pending = this.pendingToolApprovals.get(toolUseId);
    if (!pending) {
      console.warn(`No pending approval for tool ${toolUseId}`);
      return false;
    }

    pending.resolve({
      approved: false,
      message: message || 'Tool execution rejected by user, stop and waiting for next instruction.',
    });
    return true;
  }

  /**
   * Check if there's at least one pending tool approval
   */
  hasPendingToolApproval(): boolean {
    return this.pendingToolApprovals.size > 0;
  }

  /**
   * Get all pending tool approvals (concurrent subagents can each have one)
   */
  getPendingToolApprovals(): Array<{ toolUseId: string; toolName: string; input: Record<string, unknown> }> {
    return Array.from(this.pendingToolApprovals.values(), (pending) => ({
      toolUseId: pending.toolUseId,
      toolName: pending.toolName,
      input: pending.input,
    }));
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

    // Tracks in-flight subagents (Agent/Task tool calls) so nested SDK
    // messages (identified by parent_tool_use_id) can be attributed back to
    // the tool call that spawned them, for nested UI display.
    const subagentInfo = new Map<string, { name: string; lastToolName?: string; elapsedSeconds?: number }>();
    // A result message marks a model turn boundary, not necessarily the end of
    // the streaming-input session. Background agents keep using the same CLI
    // control channel after that result, so stdin must remain open until every
    // SDK task has settled and the session reports itself idle.
    type ActiveTask = NonNullable<AgentState['activeTasks']>[number];
    const activeTasks = new Map<string, ActiveTask>();
    const taskState = (): AgentState => ({
      thinking: true,
      activeTasks: Array.from(activeTasks.values()),
    });
    const logTaskLifecycle = (event: string, details: Record<string, unknown> = {}): void => {
      const entry = {
        event,
        sessionId: this.sessionId,
        activeTaskCount: activeTasks.size,
        ...details,
      };
      console.log('[claude-agent] task lifecycle', entry);
      writeAgentLifecycleLog(entry);
    };
    // `result` only marks a model-turn boundary: the CLI may follow it with a
    // trailing task_started or an injected task-notification that begins a new
    // model turn. Closing stdin right at the boundary races those and kills
    // live subagents - but waiting only for session_state_changed:idle
    // deadlocks on SDK builds that never emit it (turn never ends, UI stuck on
    // "thinking"). So a result with no live tasks arms a short grace timer;
    // any sign of continued activity cancels it, and the timer re-checks task
    // liveness when it fires.
    let streamCloseTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelScheduledStreamClose = (reason: string): void => {
      if (streamCloseTimer) {
        clearTimeout(streamCloseTimer);
        streamCloseTimer = null;
        logTaskLifecycle('stream_close_cancelled', { reason });
      }
    };
    const scheduleStreamClose = (): void => {
      if (!this.streamEndResolver) {
        return;
      }
      if (streamCloseTimer) {
        clearTimeout(streamCloseTimer);
      }
      streamCloseTimer = setTimeout(() => {
        streamCloseTimer = null;
        if (activeTasks.size === 0 && this.streamEndResolver) {
          logTaskLifecycle('stream_close', { trigger: 'result_grace_elapsed' });
          this.streamEndResolver();
          this.streamEndResolver = null;
        }
      }, STREAM_CLOSE_GRACE_MS);
    };
    // Deferring stream close for live background tasks can hang forever if
    // the SDK goes silent (429 retry storm, deadlocked tool approval, etc.)
    // with no task_* message to react to. Reset on every task message; if it
    // ever fires, force the stream closed and warn with the stuck task ids
    // rather than leave the UI spinning indefinitely.
    let taskStallTimer: ReturnType<typeof setTimeout> | null = null;
    const clearTaskStallTimer = (): void => {
      if (taskStallTimer) {
        clearTimeout(taskStallTimer);
        taskStallTimer = null;
      }
    };
    const resetTaskStallTimer = (): void => {
      clearTaskStallTimer();
      taskStallTimer = setTimeout(() => {
        taskStallTimer = null;
        const staleTaskIds = Array.from(activeTasks.keys());
        console.warn(
          `[claude-agent] no task activity for ${TASK_STALL_TIMEOUT_MS / 60000}min, forcing stream close`,
          staleTaskIds
        );
        logTaskLifecycle('task_stall_timeout', { staleTaskIds, timeoutMs: TASK_STALL_TIMEOUT_MS });
        activeTasks.clear();
        cancelScheduledStreamClose('task_stall_timeout');
        if (this.streamEndResolver) {
          this.streamEndResolver();
          this.streamEndResolver = null;
        }
      }, TASK_STALL_TIMEOUT_MS);
    };
    // Partial subagent blocks are streamed before their complete assistant
    // message. Keep stable IDs so the renderer can append deltas to one
    // timeline entry instead of creating an entry for every token.
    const partialSubagentBlocks = new Map<string, { activityId: string; kind: 'thinking' | 'text' }>();
    const subagentParentsWithPartialContent = new Set<string>();
    let partialSubagentActivitySequence = 0;

    try {
      for await (const chunk of queryInstance) {
        if (this.isCancelled()) {
          yield { type: 'cancelled', reason: 'Request cancelled by user' };
          break;
        }

        switch (chunk.type) {
          case 'stream_event': {
            cancelScheduledStreamClose('stream_event');
            const partialMessage = chunk as SDKPartialAssistantMessage;
            const event = partialMessage.event;
            const parentToolCallId = partialMessage.parent_tool_use_id ?? undefined;

            if (event.type === 'content_block_start') {
              const contentBlock = (event as { content_block?: { type?: string; id?: string; name?: string } }).content_block;
              const blockIndex = (event as { index?: number }).index;
              if (
                parentToolCallId &&
                typeof blockIndex === 'number' &&
                (contentBlock?.type === 'thinking' || contentBlock?.type === 'text')
              ) {
                const activityId = `subagent-stream-${parentToolCallId}-${++partialSubagentActivitySequence}`;
                partialSubagentBlocks.set(`${parentToolCallId}:${blockIndex}`, {
                  activityId,
                  kind: contentBlock.type,
                });
                subagentParentsWithPartialContent.add(parentToolCallId);
              }
              if (contentBlock?.type === 'tool_use' && contentBlock.name) {
                // Only update state - tool_start will be sent from assistant message with complete args
                yield {
                  type: 'state',
                  state: { thinking: true, tool: { type: 'executing', toolName: contentBlock.name } },
                };
              }
            } else if (event.type === 'content_block_delta' && parentToolCallId) {
              const deltaEvent = event as {
                index?: number;
                delta?: { type?: string; thinking?: string; text?: string };
              };
              const block = typeof deltaEvent.index === 'number'
                ? partialSubagentBlocks.get(`${parentToolCallId}:${deltaEvent.index}`)
                : undefined;
              const delta = deltaEvent.delta?.type === 'thinking_delta'
                ? deltaEvent.delta.thinking
                : deltaEvent.delta?.type === 'text_delta'
                  ? deltaEvent.delta.text
                  : undefined;
              if (block && delta) {
                yield {
                  type: 'subagent_activity_delta',
                  parentToolCallId,
                  activityId: block.activityId,
                  kind: block.kind,
                  delta,
                };
              }
            } else if (event.type === 'content_block_stop' && parentToolCallId) {
              const blockIndex = (event as { index?: number }).index;
              if (typeof blockIndex === 'number') {
                partialSubagentBlocks.delete(`${parentToolCallId}:${blockIndex}`);
              }
            }
            break;
          }

          case 'assistant': {
            cancelScheduledStreamClose('assistant_message');
            const assistantMessage = chunk as SDKAssistantMessage;
            const subagentParentId = assistantMessage.parent_tool_use_id ?? undefined;

            if (subagentParentId) {
              // Nested message from a running subagent (Agent/Task tool call).
              // Attribute its activity back to the parent tool call instead of
              // mixing it into the main thread's text/usage/checkpoint state.
              if (!subagentInfo.has(subagentParentId)) {
                subagentInfo.set(subagentParentId, { name: assistantMessage.subagent_type || 'agent' });
              }
              const info = subagentInfo.get(subagentParentId)!;
              // When partial messages were available, the corresponding
              // thinking/text has already reached the UI. The complete
              // assistant message is still used for tool calls, but must not
              // duplicate those activity blocks.
              const contentWasStreamed = subagentParentsWithPartialContent.delete(subagentParentId);

              const content = assistantMessage.message?.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  switch (block.type) {
                    case 'thinking': {
                      if (!contentWasStreamed && 'thinking' in block) {
                        const thinkingBlock = block as { type: 'thinking'; thinking: string };
                        yield { type: 'thinking', thinking: thinkingBlock.thinking, parentToolCallId: subagentParentId };
                      }
                      break;
                    }
                    case 'text': {
                      if (!contentWasStreamed && block.text) {
                        yield { type: 'subagent_text', parentToolCallId: subagentParentId, text: block.text };
                      }
                      break;
                    }
                    case 'tool_use': {
                      const toolUseBlock = block as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
                      info.lastToolName = toolUseBlock.name;
                      yield {
                        type: 'tool_start',
                        toolCallId: toolUseBlock.id,
                        toolName: toolUseBlock.name,
                        args: toolUseBlock.input,
                        parentToolCallId: subagentParentId,
                      };
                      break;
                    }
                    case 'server_tool_use': {
                      const serverToolBlock = block as { type: 'server_tool_use'; id: string; name: string; input: Record<string, unknown> };
                      info.lastToolName = serverToolBlock.name;
                      yield {
                        type: 'tool_start',
                        toolCallId: serverToolBlock.id,
                        toolName: `server:${serverToolBlock.name}`,
                        args: serverToolBlock.input,
                        parentToolCallId: subagentParentId,
                      };
                      break;
                    }
                    case 'web_search_tool_result': {
                      const webSearchBlock = block as { type: 'web_search_tool_result'; tool_use_id: string; content: unknown };
                      yield {
                        type: 'tool_end',
                        toolName: 'server:web_search',
                        toolCallId: webSearchBlock.tool_use_id,
                        output: JSON.stringify(webSearchBlock.content),
                        parentToolCallId: subagentParentId,
                      };
                      break;
                    }
                    // Unknown block types are silently ignored
                  }
                }
              }

              yield {
                type: 'state',
                state: {
                  thinking: true,
                  subagent: { toolCallId: subagentParentId, name: info.name, lastToolName: info.lastToolName, elapsedSeconds: info.elapsedSeconds },
                },
              };
              break;
            }

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
                      // Track Agent/Task tool calls so nested subagent messages (identified
                      // by parent_tool_use_id) and progress heartbeats can be attributed back.
                      if (toolUseBlock.name === 'Agent' || toolUseBlock.name === 'Task') {
                        subagentInfo.set(toolUseBlock.id, {
                          name: String(toolUseBlock.input?.subagent_type || toolUseBlock.name),
                        });
                      }
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
            cancelScheduledStreamClose('user_message');
            const userMessage = chunk as SDKUserMessage;
            const subagentParentId = userMessage.parent_tool_use_id ?? undefined;

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

            // Task-notification injections fire when a background subagent (Agent tool) stops.
            // Parse and yield structured events instead of displaying the raw XML.
            {
              const notificationTexts: string[] = [];
              if (typeof messageContent === 'string' && messageContent.includes('<task-notification>')) {
                notificationTexts.push(messageContent);
              } else if (Array.isArray(messageContent)) {
                for (const block of messageContent) {
                  if (block.type === 'text' && 'text' in block && typeof block.text === 'string' && block.text.includes('<task-notification>')) {
                    notificationTexts.push(block.text);
                  }
                }
              }

              if (notificationTexts.length > 0) {
                const notifications = notificationTexts.flatMap((text) => parseTaskNotifications(text));
                for (const notification of notifications) {
                  const timestamp = Date.now();
                  yield { type: 'task_notification', notification, timestamp };
                  this.conversationHistory.push({
                    role: 'user',
                    content: '',
                    timestamp,
                    taskNotification: notification,
                  });
                }
                break;
              }
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
                    parentToolCallId: subagentParentId,
                  };

                  // A top-level Agent/Task tool call just finished - stop tracking it.
                  if (!subagentParentId && subagentInfo.has(toolUseId)) {
                    subagentInfo.delete(toolUseId);
                  }
                }
              }

              const activeSubagent = subagentParentId ? subagentInfo.get(subagentParentId) : undefined;
              yield {
                type: 'state',
                state: activeSubagent
                  ? { thinking: true, subagent: { toolCallId: subagentParentId!, name: activeSubagent.name, lastToolName: activeSubagent.lastToolName, elapsedSeconds: activeSubagent.elapsedSeconds } }
                  : { thinking: true },
              };
            }
            break;
          }

          case 'tool_progress': {
            const progressMessage = chunk as SDKToolProgressMessage;
            const parentToolCallId = progressMessage.parent_tool_use_id ?? undefined;
            yield {
              type: 'tool_progress',
              toolName: progressMessage.tool_name,
              toolCallId: progressMessage.tool_use_id,
              progressType: 'progress',
              message: `Elapsed: ${progressMessage.elapsed_time_seconds}s`,
              timestamp: Date.now(),
              parentToolCallId,
            };

            // Heartbeat for a running Agent/Task tool call itself - refresh its
            // elapsed time so the status line can show "running for Xs".
            if (!parentToolCallId && subagentInfo.has(progressMessage.tool_use_id)) {
              const info = subagentInfo.get(progressMessage.tool_use_id)!;
              info.elapsedSeconds = progressMessage.elapsed_time_seconds;
              yield {
                type: 'subagent_heartbeat',
                parentToolCallId: progressMessage.tool_use_id,
                lastToolName: info.lastToolName,
                elapsedSeconds: progressMessage.elapsed_time_seconds,
                timestamp: Date.now(),
              };
              yield {
                type: 'state',
                state: {
                  thinking: true,
                  subagent: { toolCallId: progressMessage.tool_use_id, name: info.name, lastToolName: info.lastToolName, elapsedSeconds: info.elapsedSeconds },
                },
              };
            }
            break;
          }

          case 'result': {
            const resultMessage = chunk as SDKResultMessage;
            terminalReason = resultMessage.terminal_reason;
            // `result` is only a model-turn boundary. With live background
            // tasks stdin must stay open (closing would kill them); without
            // any, arm the grace-close timer rather than depending on a
            // session_state_changed:idle event the SDK does not always emit.
            logTaskLifecycle('result', {
              resultSubtype: resultMessage.subtype,
              terminalReason: resultMessage.terminal_reason,
            });
            if (activeTasks.size === 0) {
              clearTaskStallTimer();
              scheduleStreamClose();
            } else {
              logTaskLifecycle('stream_close_deferred', {
                activeTaskIds: Array.from(activeTasks.keys()),
              });
              resetTaskStallTimer();
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
                this.slashCommands = chunk.commands.map((command) => command.name);
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
                // A retryable API failure (429/5xx/timeout). During a quota
                // exhaustion storm this is the ONLY message emitted for
                // minutes - log it and surface it to the UI so the stall has
                // a visible cause.
                logTaskLifecycle('api_retry', {
                  attempt: chunk.attempt,
                  maxRetries: chunk.max_retries,
                  retryDelayMs: chunk.retry_delay_ms,
                  errorStatus: chunk.error_status,
                  errorType: chunk.error,
                  activeTaskIds: Array.from(activeTasks.keys()),
                });
                cancelScheduledStreamClose('api_retry');
                yield {
                  type: 'api_retry',
                  attempt: chunk.attempt,
                  maxRetries: chunk.max_retries,
                  retryDelayMs: chunk.retry_delay_ms,
                  errorStatus: chunk.error_status,
                  errorType: chunk.error,
                  timestamp: Date.now(),
                };
                break;
              }

              case 'hook_started':
              case 'hook_progress':
              case 'hook_response': {
                // Hook execution lifecycle is internal, no need to yield to frontend
                break;
              }

              case 'task_started': {
                const task = chunk as SDKTaskStartedMessage;
                activeTasks.set(task.task_id, {
                  taskId: task.task_id,
                  toolUseId: task.tool_use_id,
                  subagentType: task.subagent_type,
                  description: task.description,
                  status: 'running',
                  isBackgrounded: false,
                });
                logTaskLifecycle('task_started', {
                  taskId: task.task_id,
                  toolUseId: task.tool_use_id,
                  subagentType: task.subagent_type,
                });
                cancelScheduledStreamClose('task_started');
                resetTaskStallTimer();
                if (task.tool_use_id && !subagentInfo.has(task.tool_use_id)) {
                  subagentInfo.set(task.tool_use_id, {
                    name: task.subagent_type || task.description || 'agent',
                  });
                }
                if (task.tool_use_id && task.subagent_type) {
                  const skills = this.config.agents?.[task.subagent_type]?.skills;
                  if (skills?.length) {
                    yield {
                      type: 'subagent_skills',
                      parentToolCallId: task.tool_use_id,
                      skills: [...skills],
                    };
                  }
                }
                yield { type: 'state', state: taskState() };
                break;
              }

              case 'task_progress': {
                const task = chunk as SDKTaskProgressMessage;
                const current = activeTasks.get(task.task_id);
                activeTasks.set(task.task_id, {
                  taskId: task.task_id,
                  toolUseId: task.tool_use_id ?? current?.toolUseId,
                  subagentType: task.subagent_type ?? current?.subagentType,
                  description: task.description || current?.description || 'Background task',
                  status: current?.status ?? 'running',
                  isBackgrounded: current?.isBackgrounded ?? true,
                  lastToolName: task.last_tool_name,
                  totalTokens: task.usage.total_tokens,
                  toolUses: task.usage.tool_uses,
                  durationMs: task.usage.duration_ms,
                });
                logTaskLifecycle('task_progress', {
                  taskId: task.task_id,
                  lastToolName: task.last_tool_name,
                  totalTokens: task.usage.total_tokens,
                  durationMs: task.usage.duration_ms,
                });
                resetTaskStallTimer();
                if (task.tool_use_id) {
                  const info = subagentInfo.get(task.tool_use_id) ?? {
                    name: task.subagent_type || task.description || 'agent',
                  };
                  info.lastToolName = task.last_tool_name;
                  info.elapsedSeconds = Math.round(task.usage.duration_ms / 1000);
                  subagentInfo.set(task.tool_use_id, info);
                  yield {
                    type: 'subagent_heartbeat',
                    parentToolCallId: task.tool_use_id,
                    lastToolName: task.last_tool_name,
                    totalTokens: task.usage.total_tokens,
                    elapsedSeconds: info.elapsedSeconds,
                    timestamp: Date.now(),
                  };
                }
                yield { type: 'state', state: taskState() };
                break;
              }

              case 'task_notification': {
                const task = chunk as SDKTaskNotificationMessage;
                activeTasks.delete(task.task_id);
                logTaskLifecycle('task_notification', {
                  taskId: task.task_id,
                  toolUseId: task.tool_use_id,
                  status: task.status,
                  totalTokens: task.usage?.total_tokens,
                  durationMs: task.usage?.duration_ms,
                });
                if (task.tool_use_id) {
                  subagentInfo.delete(task.tool_use_id);
                }
                if (activeTasks.size === 0) {
                  clearTaskStallTimer();
                } else {
                  resetTaskStallTimer();
                }
                // The injected user <task-notification> contains the richer
                // display payload and is handled above; this system message is
                // used only for lifecycle tracking.
                // Do not close stdin here: Claude Code still has to inject the
                // task result and let the parent agent consume/summarize it.
                yield { type: 'state', state: taskState() };
                break;
              }

              case 'task_updated': {
                const task = chunk as SDKTaskUpdatedMessage;
                if (task.patch.status && ['completed', 'failed', 'killed'].includes(task.patch.status)) {
                  activeTasks.delete(task.task_id);
                } else {
                  const current = activeTasks.get(task.task_id);
                  if (current) {
                    activeTasks.set(task.task_id, {
                      ...current,
                      description: task.patch.description ?? current.description,
                      status: task.patch.status === 'paused'
                        ? 'paused'
                        : task.patch.status === 'pending'
                          ? 'pending'
                          : 'running',
                      isBackgrounded: task.patch.is_backgrounded ?? current.isBackgrounded,
                    });
                  }
                }
                logTaskLifecycle('task_updated', {
                  taskId: task.task_id,
                  status: task.patch.status,
                  isBackgrounded: task.patch.is_backgrounded,
                  error: task.patch.error,
                });
                if (activeTasks.size === 0) {
                  clearTaskStallTimer();
                } else {
                  resetTaskStallTimer();
                }
                yield { type: 'state', state: taskState() };
                break;
              }

              case 'thinking_tokens': {
                // Approximate live thinking-token estimate for spinners - not authoritative usage
                yield { type: 'thinking_tokens', estimatedTokens: chunk.estimated_tokens };
                break;
              }

              case 'session_state_changed': {
                // A result can be intermediate while background tasks run.
                // Idle with no live tasks is the safe point to close stdin and
                // let the SDK subprocess finish normally.
                logTaskLifecycle('session_state_changed', { state: chunk.state });
                if (chunk.state === 'idle' && activeTasks.size === 0 && this.streamEndResolver) {
                  cancelScheduledStreamClose('idle_close');
                  logTaskLifecycle('stream_close', { trigger: 'session_idle' });
                  this.streamEndResolver();
                  this.streamEndResolver = null;
                }
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
                // Keep this visible in packaged-process logs. This is the key
                // diagnostic when a Claude Code host exits with live tasks.
                logTaskLifecycle('worker_shutting_down', {
                  reason: chunk.reason,
                  activeTaskIds: Array.from(activeTasks.keys()),
                });
                break;
              }

              case 'informational': {
                // Host-rendered system notice (info/notice/suggestion/warning) - no UI surface yet
                break;
              }

              default: {
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
      if (streamCloseTimer) {
        clearTimeout(streamCloseTimer);
        streamCloseTimer = null;
      }
      clearTaskStallTimer();
      // Also release on abnormal SDK termination so the input generator cannot
      // retain an unresolved promise after its consumer has gone away.
      if (this.streamEndResolver) {
        this.streamEndResolver();
        this.streamEndResolver = null;
      }
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
    // Normal completion is signalled by session_state_changed:idle or, on SDK
    // builds that don't emit it, by the grace timer armed when a result
    // arrives with no live background tasks (see scheduleStreamClose).
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
        // Forward subagent (Agent/Task tool) text/thinking blocks with parent_tool_use_id set,
        // so the UI can render a nested activity timeline instead of a generic "AI is thinking".
        forwardSubagentText: true,
        // Required for token-level thinking/text updates. Without this the
        // SDK only forwards the complete assistant block after a subagent
        // turn, producing long silent gaps in the activity timeline.
        includePartialMessages: true,
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
