/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SessionAgent - Per-session communication layer with backend agent
 * Manages event filtering, history updates, and streaming for a single session
 */

import type { MessageListItem, MessageContent } from '../../preload/preload-types';
import type { AgentState, StreamEvent, HistoryMessage } from '../../../core/agents/claude-agent.js';
import { SequentialEventQueue } from './session-agent/event-queue.js';
import {
  createStreamingTextState,
  applyTextDelta,
  createThinkingItem,
  type StreamingTextState,
} from './session-agent/streaming.js';
import { markToolNeedsApproval, applyToolApprovals, applyToolRejections } from './session-agent/approvals.js';
import {
  updateStatusItem,
  addItemKeepingStatusAtEnd,
  upsertStreamingMessage,
  applyToolStart,
  applyToolEnd,
  applyToolProgress,
  applyMessageEvent,
  applyTaskNotificationEvent,
  applyErrorEvent,
  applyCancelledEvent,
  clearPendingToolApprovals,
  applyUsageLimitEvent,
  applyDone,
  buildDisplayItemsFromHistory,
  updateThinkingTokens,
} from './session-agent/display-items.js';

interface SessionAgentCallbacks {
  // Single notification callback - WPF INotifyPropertyChanged/ICollectionChanged pattern
  onDisplayItemsChange?: (items: MessageListItem[]) => void; // Complete display items (history + streaming)
  onPendingApprovalsChange?: (pendingApprovals: Map<string, string>) => void;
  onRejectedToolsChange?: (rejectedTools: Set<string>) => void;
  onStateChange?: (state: AgentState) => void;
}

/**
 * SessionAgent manages communication with backend for a specific session
 * Features:
 * - Event filtering by sessionId (multi-session isolation)
 * - History-based updates (single source of truth)
 * - Tool approval handling via canUseTool callback
 * - Per-session pending approvals and rejected tools state
 *
 * Event handling itself is implemented as pure reducer functions in
 * ./session-agent/* - this class is a thin orchestration layer that owns
 * the mutable state and wires events to those reducers.
 */
export class SessionAgent {
  private sessionId: string;
  private callbacks: SessionAgentCallbacks;
  private isActive: boolean = true;
  private hasLoadedHistory: boolean = false; // Track if history has been loaded (to skip on new sessions)

  // Single source of truth: displayItems contains both history and streaming items
  private displayItems: MessageListItem[] = [];

  private pendingApprovals: Map<string, string> = new Map(); // toolCallId -> toolUseId
  private rejectedTools: Set<string> = new Set(); // Set of rejected toolCallIds

  // Streaming text buffer (for real-time text display)
  private streamingState: StreamingTextState = createStreamingTextState();

  // Sequential event queue - preserves event order even if new events
  // arrive while a previous one is still being handled.
  private eventQueue: SequentialEventQueue<StreamEvent>;

  constructor(sessionId: string, callbacks: SessionAgentCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.eventQueue = new SequentialEventQueue<StreamEvent>((event) => this.processStreamEvent(event));
    this.setupListeners();
  }

  /**
   * Setup event listeners with sessionId filtering
   * Uses unified onStreamEvent listener for all streaming events
   */
  private setupListeners() {
    // Listen for unified streaming events
    window.electronAPI.agent.onStreamEvent((data) => {
      // Filter by sessionId
      if (!this.isActive || data.sessionId !== this.sessionId) {
        return;
      }

      this.eventQueue.enqueue(data.event);
    });

    // Listen for tool approval requests (from canUseTool callback)
    window.electronAPI.agent.onToolApprovalRequest((data) => {
      // Filter by sessionId
      if (!this.isActive || data.sessionId !== this.sessionId) {
        return;
      }

      const next = markToolNeedsApproval(this.displayItems, data.toolUseId);
      this.pendingApprovals.set(data.toolUseId, data.toolUseId);

      if (next !== this.displayItems) {
        this.displayItems = next;
        this.notifyDisplayItemsChanged();
      } else {
        // Tool call item not found yet - approval request arrived before tool_start event
        console.warn('[SessionAgent] Tool approval request for unknown tool:', data.toolUseId);
      }

      this.callbacks.onPendingApprovalsChange?.(new Map(this.pendingApprovals));
    });
  }

  /**
   * Notify UI that displayItems changed (WPF-style notification pattern)
   */
  private notifyDisplayItemsChanged() {
    if (this.callbacks.onDisplayItemsChange) {
      // Return a shallow copy to prevent external modifications
      this.callbacks.onDisplayItemsChange([...this.displayItems]);
    }
  }

  /**
   * Process a single stream event
   * Called sequentially from event queue to guarantee order
   */
  private processStreamEvent(event: StreamEvent) {
    switch (event.type) {
      case 'state':
        this.displayItems = updateStatusItem(this.displayItems, event.state);
        this.notifyDisplayItemsChanged();

        // Also notify callback for backward compatibility
        if (this.callbacks.onStateChange) {
          this.callbacks.onStateChange(event.state);
        }
        break;

      case 'text_delta': {
        const result = applyTextDelta(this.streamingState, event, this.sessionId);
        this.streamingState = result.state;

        if (result.message) {
          this.displayItems = upsertStreamingMessage(this.displayItems, result.message, result.isNew);
          this.notifyDisplayItemsChanged();
        }
        break;
      }

      case 'thinking': {
        const thinkingItem = createThinkingItem(this.sessionId, event.thinking);
        this.displayItems = addItemKeepingStatusAtEnd(this.displayItems, thinkingItem);
        this.notifyDisplayItemsChanged();
        break;
      }

      case 'thinking_tokens': {
        const next = updateThinkingTokens(this.displayItems, event.estimatedTokens);
        if (next !== this.displayItems) {
          this.displayItems = next;
          this.notifyDisplayItemsChanged();
        }
        break;
      }

      case 'tool_start':
        this.displayItems = applyToolStart(this.displayItems, event, this.pendingApprovals);
        this.notifyDisplayItemsChanged();
        break;

      case 'tool_end': {
        const hadPendingApproval = this.pendingApprovals.has(event.toolCallId);
        const next = applyToolEnd(this.displayItems, event);

        if (next !== this.displayItems) {
          this.displayItems = next;

          if (hadPendingApproval) {
            this.pendingApprovals.delete(event.toolCallId);
            this.callbacks.onPendingApprovalsChange?.(new Map(this.pendingApprovals));
          }

          this.notifyDisplayItemsChanged();
        }
        break;
      }

      case 'tool_progress': {
        const next = applyToolProgress(this.displayItems, event);
        if (next !== this.displayItems) {
          this.displayItems = next;
          this.notifyDisplayItemsChanged();
        }
        break;
      }

      case 'checkpoint':
        // Checkpoint: current streaming item is complete, reset the buffer
        // for the next one. Item is already in displayItems - no notify needed.
        this.streamingState = createStreamingTextState();
        break;

      case 'message':
        this.displayItems = applyMessageEvent(this.displayItems, event, this.sessionId);
        this.notifyDisplayItemsChanged();
        break;

      case 'task_notification':
        this.displayItems = applyTaskNotificationEvent(this.displayItems, event, this.sessionId);
        this.notifyDisplayItemsChanged();
        break;

      case 'error':
        this.displayItems = applyErrorEvent(this.displayItems, event);
        this.displayItems = updateStatusItem(this.displayItems, { thinking: false });
        this.notifyDisplayItemsChanged();
        break;

      case 'cancelled':
        this.displayItems = applyCancelledEvent(this.displayItems);
        this.displayItems = clearPendingToolApprovals(this.displayItems);
        this.displayItems = updateStatusItem(this.displayItems, { thinking: false });
        if (this.pendingApprovals.size > 0) {
          this.pendingApprovals.clear();
          this.callbacks.onPendingApprovalsChange?.(new Map(this.pendingApprovals));
        }
        this.notifyDisplayItemsChanged();
        break;

      case 'usage_limit':
        this.displayItems = applyUsageLimitEvent(this.displayItems, event);
        this.displayItems = updateStatusItem(this.displayItems, { thinking: false });
        this.notifyDisplayItemsChanged();
        break;

      case 'done':
        this.displayItems = applyDone(this.displayItems, event.usage);
        this.streamingState = createStreamingTextState();

        // Notify UI of the filtered items
        this.notifyDisplayItemsChanged();

        // Don't manually set idle here - backend already sends idle state event before done
        // Status will be cleared by the idle state event from backend
        break;
    }
  }

  /**
   * Load complete history (used on activation)
   * Splits messages and tool calls into separate MessageListItems
   * @param history - Complete message history from backend
   */
  private loadCompleteHistory(history: HistoryMessage[]) {
    try {
      this.displayItems = buildDisplayItemsFromHistory(history, this.sessionId, this.pendingApprovals, this.rejectedTools);
      this.notifyDisplayItemsChanged();
    } catch (error) {
      console.error('[SessionAgent] Failed to load complete history:', error);
    }
  }

  /**
   * Approve tool calls
   * Uses new canUseTool callback-based API (single tool per call)
   */
  async approveTools(toolCallIds: string[]): Promise<void> {
    // Remove from pending approvals
    toolCallIds.forEach((id) => this.pendingApprovals.delete(id));
    this.callbacks.onPendingApprovalsChange?.(new Map(this.pendingApprovals));

    // Immediately update displayItems to reflect approval - UI should respond instantly
    this.displayItems = applyToolApprovals(this.displayItems, toolCallIds);
    this.notifyDisplayItemsChanged();

    // Call backend for each tool (new canUseTool callback-based API)
    for (const toolCallId of toolCallIds) {
      try {
        await window.electronAPI.agent.approveTool(toolCallId);
      } catch (error) {
        console.error('[SessionAgent] Failed to approve tool:', toolCallId, error);
      }
    }
  }

  /**
   * Reject tool calls
   * Uses new canUseTool callback-based API (single tool per call)
   * @param toolCallIds - Array of tool call IDs to reject
   * @param feedback - Optional message explaining why the tools were rejected (sent to LLM)
   */
  async rejectTools(toolCallIds: string[], feedback?: string): Promise<void> {
    // Remove from pending approvals and add to rejected
    toolCallIds.forEach((id) => {
      this.pendingApprovals.delete(id);
      this.rejectedTools.add(id);
    });
    this.callbacks.onPendingApprovalsChange?.(new Map(this.pendingApprovals));
    this.callbacks.onRejectedToolsChange?.(new Set(this.rejectedTools));

    // Immediately update displayItems to reflect rejection - UI should respond instantly
    this.displayItems = applyToolRejections(this.displayItems, toolCallIds);
    this.notifyDisplayItemsChanged();

    // Call backend for each tool (new canUseTool callback-based API)
    for (const toolCallId of toolCallIds) {
      try {
        await window.electronAPI.agent.rejectTool(toolCallId, feedback);
      } catch (error) {
        console.error('[SessionAgent] Failed to reject tool:', toolCallId, error);
      }
    }
  }

  /**
   * Get current pending approvals
   */
  getPendingApprovals(): Map<string, string> {
    return new Map(this.pendingApprovals);
  }

  /**
   * Get current rejected tools
   */
  getRejectedTools(): Set<string> {
    return new Set(this.rejectedTools);
  }

  /**
   * Activate this session agent (when switching to this session)
   */
  activate() {
    this.isActive = true;

    // CRITICAL: Immediately notify current displayItems to UI
    // This ensures UI shows the cached content immediately, not waiting for async history fetch
    this.notifyDisplayItemsChanged();

    // Only fetch history if we haven't loaded it yet
    // For new sessions created in this session, displayItems will already have user message
    // and we don't want to overwrite it with empty history
    if (!this.hasLoadedHistory) {
      window.electronAPI.session.getHistory(this.sessionId).then((history) => {
        // Only load if history is not empty (existing session being resumed)
        // For new sessions, history will be empty and we skip to avoid clearing displayItems
        if (history.length > 0) {
          this.loadCompleteHistory(history);
        }
        this.hasLoadedHistory = true;
      }).catch((error) => {
        console.error('[SessionAgent] Failed to fetch history on activation:', error);
        this.hasLoadedHistory = true; // Mark as attempted even on error
      });
    }

    // Notify callbacks of current state
    this.callbacks.onPendingApprovalsChange?.(new Map(this.pendingApprovals));
    this.callbacks.onRejectedToolsChange?.(new Set(this.rejectedTools));
  }

  /**
   * Check if content is a slash command (starts with /)
   * Returns the command name if it is, null otherwise
   */
  private getSlashCommand(content: MessageContent): string | null {
    let textContent = '';
    if (typeof content === 'string') {
      textContent = content.trim();
    } else if (Array.isArray(content)) {
      // Extract text from content blocks
      const textBlocks = content.filter(
        (block): block is { type: 'text'; text: string } => block.type === 'text'
      );
      textContent = textBlocks.map(b => b.text).join('').trim();
    }

    // Check if starts with / and extract command name
    if (textContent.startsWith('/')) {
      const match = textContent.match(/^\/(\w+)/);
      return match ? match[1] : null;
    }
    return null;
  }

  /**
   * Add a user message to displayItems
   * Called when user sends a message, before backend processing
   * Slash commands are not displayed as user messages, only status is shown
   */
  addUserMessage(userMessage: MessageListItem) {
    // Check if this is a slash command
    const commandName = userMessage.content ? this.getSlashCommand(userMessage.content) : null;

    if (commandName) {
      // Slash command: don't show user message, only show command status
      this.displayItems = updateStatusItem(this.displayItems, {
        thinking: false,
        command: {
          name: commandName,
          status: 'running',
        },
      });
    } else {
      // Regular message: add user message before status, then update status to thinking
      this.displayItems = addItemKeepingStatusAtEnd(this.displayItems, userMessage);
      this.displayItems = updateStatusItem(this.displayItems, { thinking: true });
    }

    this.notifyDisplayItemsChanged();
  }

  /**
   * Deactivate this session agent (when switching away)
   * Agent is cached but stops processing events
   */
  deactivate() {
    this.isActive = false;

    // Clear streaming state when deactivating
    this.streamingState = createStreamingTextState();

    // Clear status item
    this.displayItems = updateStatusItem(this.displayItems, { thinking: false });
    this.notifyDisplayItemsChanged();

    // Also notify callback for backward compatibility
    this.callbacks.onStateChange?.({ thinking: false });
  }

  /**
   * Destroy this session agent (cleanup)
   */
  destroy() {
    this.isActive = false;
    this.pendingApprovals.clear();
    this.rejectedTools.clear();

    // Clear streaming state
    this.streamingState = createStreamingTextState();

    // Clear status item
    this.displayItems = updateStatusItem(this.displayItems, { thinking: false });
    this.notifyDisplayItemsChanged();

    // Also notify callback for backward compatibility
    this.callbacks.onStateChange?.({ thinking: false });

    // Event listeners will be cleaned up by removeAllListeners in preload.ts
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get current display items
   */
  getDisplayItems(): MessageListItem[] {
    return [...this.displayItems];
  }

  /**
   * Check if active
   */
  isActiveSession(): boolean {
    return this.isActive;
  }
}

/**
 * SessionAgent cache manager
 * Caches SessionAgent instances for quick session switching
 */
export class SessionAgentCache {
  private cache: Map<string, SessionAgent> = new Map();

  /**
   * Get or create SessionAgent for a session
   * Note: Does NOT activate the agent - caller should use switchTo() for activation
   */
  getOrCreate(sessionId: string, callbacks: SessionAgentCallbacks): SessionAgent {
    // Check cache first
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId)!;
    }

    // Create new agent
    const agent = new SessionAgent(sessionId, callbacks);
    this.cache.set(sessionId, agent);
    return agent;
  }

  /**
   * Deactivate all agents except the specified one
   */
  switchTo(sessionId: string) {
    for (const [id, agent] of this.cache.entries()) {
      if (id === sessionId) {
        agent.activate();
      } else {
        agent.deactivate();
      }
    }
  }

  /**
   * Remove a session from cache
   */
  remove(sessionId: string) {
    const agent = this.cache.get(sessionId);
    if (agent) {
      agent.destroy();
      this.cache.delete(sessionId);
    }
  }

  /**
   * Clear all cached agents
   */
  clear() {
    for (const agent of this.cache.values()) {
      agent.destroy();
    }
    this.cache.clear();
  }
}
