/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SessionAgent - Per-session communication layer with backend agent
 * Manages event filtering, history updates, and streaming for a single session
 */

import type { MessageListItem, UsageMetadata, MessageContent } from '../../preload/preload-types';
import type { AgentState, StreamEvent } from '../../../core/agents/claude-agent.js';

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

  // Streaming message buffer (for real-time text display)
  private streamingText: string = '';
  private streamingMessageId: string | null = null;
  private streamingItemIndex: number = -1; // Index of streaming item in displayItems (-1 if none)
  private streamingUsage: UsageMetadata | undefined = undefined; // Store usage from first delta

  // Streaming tool calls buffer (for tracking in-progress tool calls)
  private streamingToolCalls: Map<string, MessageListItem> = new Map(); // toolCallId -> MessageListItem

  // Event queue for sequential processing - ALL events to preserve order during debugging
  private eventQueue: Array<{
    type: 'streamEvent' | 'historyUpdate';
    streamEvent?: StreamEvent;
  }> = [];
  private isProcessingQueue: boolean = false;

  constructor(sessionId: string, callbacks: SessionAgentCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
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

      const { event } = data;

      // Add ALL events to queue to preserve order during debugging
      // When debugging with breakpoints, events can accumulate and arrive out of order
      this.enqueueEvent({ type: 'streamEvent', streamEvent: event });
    });

    // Listen for tool approval requests (from canUseTool callback)
    window.electronAPI.agent.onToolApprovalRequest((data) => {
      // Filter by sessionId
      if (!this.isActive || data.sessionId !== this.sessionId) {
        return;
      }

      // Find the tool call item and mark it as needing approval
      const toolItemIndex = this.displayItems.findIndex(
        (item) => item.type === 'tool_call' && item.toolCall?.id === data.toolUseId
      );

      if (toolItemIndex !== -1) {
        // Update existing tool item
        const existingItem = this.displayItems[toolItemIndex];
        this.displayItems[toolItemIndex] = {
          ...existingItem,
          needsApproval: true,
        };

        // Add to pending approvals
        this.pendingApprovals.set(data.toolUseId, data.toolUseId);

        // Notify callbacks
        this.notifyDisplayItemsChanged();
        if (this.callbacks.onPendingApprovalsChange) {
          this.callbacks.onPendingApprovalsChange(new Map(this.pendingApprovals));
        }
      } else {
        // Tool call item not found yet - store for later matching
        // This can happen if approval request arrives before tool_start event
        console.warn('[SessionAgent] Tool approval request for unknown tool:', data.toolUseId);
        this.pendingApprovals.set(data.toolUseId, data.toolUseId);
        if (this.callbacks.onPendingApprovalsChange) {
          this.callbacks.onPendingApprovalsChange(new Map(this.pendingApprovals));
        }
      }
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
   * Update status indicator item in displayItems
   * Two-layer state system: thinking + tool state can coexist
   * Status item is always placed at the end of displayItems
   */
  private updateStatusItem(state: AgentState) {
    // Remove any existing status item (filter it out from any position)
    const itemsWithoutStatus = this.displayItems.filter(item => item.type !== 'status');

    // Add new status item if not idle (thinking or tool state active)
    const isIdle = !state.thinking && !state.tool;

    if (!isIdle) {
      const statusItem: MessageListItem = {
        type: 'status',
        id: `status-${Date.now()}`,
        timestamp: Date.now(),
        agentState: state,
      };
      // Always append status item at the end
      this.displayItems = [...itemsWithoutStatus, statusItem];
    } else {
      // Just remove status item (idle state)
      this.displayItems = itemsWithoutStatus;
    }

    // Notify UI
    this.notifyDisplayItemsChanged();
  }

  /**
   * Process a single stream event
   * Called sequentially from event queue to guarantee order
   */
  private processStreamEvent(event: StreamEvent) {
    // Process different event types
    switch (event.type) {
      case 'state':
        // State change - update status item in displayItems
        this.updateStatusItem(event.state);

        // Also notify callback for backward compatibility
        if (this.callbacks.onStateChange) {
          this.callbacks.onStateChange(event.state);
        }
        break;

      case 'text_delta':
        // Real-time text streaming - accumulate text and update displayItems
        if (!this.streamingMessageId) {
          // Start new streaming message
          this.streamingMessageId = `streaming-${this.sessionId}-${Date.now()}`;
          this.streamingText = '';
          this.streamingItemIndex = -1; // Will be set when we actually add the item
          this.streamingUsage = undefined; // Reset usage storage
        }

        // Accumulate text
        this.streamingText += event.text;

        // Claude sends usage in first text_delta (with empty text), then text in subsequent deltas
        // Store the usage until we have text to display
        if (event.usage) {
          this.streamingUsage = event.usage;
        }

        // Create/update streaming item if we have text
        const hasText = this.streamingText.trim().length > 0;

        if (hasText) {
          if (this.streamingItemIndex === -1) {
            // First time we have actual text - create the item with stored usage
            const newStreamingItem: MessageListItem = {
              type: 'message',
              id: this.streamingMessageId,
              timestamp: Date.now(),
              role: 'assistant',
              content: this.streamingText,
              usage: this.streamingUsage, // Use stored usage from first delta
            };

            this.displayItems.push(newStreamingItem);
            this.streamingItemIndex = this.displayItems.length - 1;
          } else {
            // Update existing streaming item with latest text and usage
            const existingItem = this.displayItems[this.streamingItemIndex];
            this.displayItems[this.streamingItemIndex] = {
              ...existingItem,
              content: this.streamingText,
              usage: this.streamingUsage ?? existingItem.usage,
            };
          }

          // Notify UI
          this.notifyDisplayItemsChanged();
        }
        break;

      case 'thinking': {
        // Extended thinking content - create a thinking item
        const thinkingItem: MessageListItem = {
          type: 'thinking',
          id: `thinking-${this.sessionId}-${Date.now()}`,
          timestamp: Date.now(),
          thinking: event.thinking,
        };

        this.displayItems.push(thinkingItem);
        this.notifyDisplayItemsChanged();
        break;
      }

      case 'tool_start': {
        // Tool execution started - create tool call item and add to displayItems
        // Args should already be parsed as object by backend (agent.ts)
        // But handle edge cases for robustness
        let parsedArgs: Record<string, any>;
        const argsValue = event.args;

        if (argsValue && typeof argsValue === 'object') {
          // Normal case - args is already an object
          parsedArgs = argsValue as Record<string, any>;
        } else if (typeof argsValue === 'string') {
          // Fallback: Try to parse if it's somehow still a string
          const stringArgs: string = argsValue;
          try {
            parsedArgs = JSON.parse(stringArgs);
          } catch {
            parsedArgs = { _error: 'Invalid arguments format', _raw: stringArgs.substring(0, 100) };
          }
        } else {
          // Unexpected: args is neither object nor string
          parsedArgs = { _error: 'Invalid argument type' };
        }

        // Check if this tool already has a pending approval request
        // (toolApprovalRequest may arrive before tool_start)
        const hasPendingApproval = this.pendingApprovals.has(event.toolCallId);

        const toolStartItem: MessageListItem = {
          type: 'tool_call',
          id: `tool-${event.toolCallId}`,
          timestamp: Date.now(),
          toolCall: {
            id: event.toolCallId,
            name: event.toolName,
            args: parsedArgs,
          },
          needsApproval: hasPendingApproval, // Set if approval request already received
        };

        // Add to displayItems immediately (so it's displayed)
        this.displayItems.push(toolStartItem);

        // Store in streaming tool calls buffer
        this.streamingToolCalls.set(event.toolCallId, toolStartItem);

        // Notify UI
        this.notifyDisplayItemsChanged();
      }
      break;

      case 'tool_end':
        // Tool execution completed - update displayItems with response
        // Find the tool item in displayItems by tool call ID
        const toolItemIndex = this.displayItems.findIndex(
          (item: MessageListItem) => item.type === 'tool_call' && item.toolCall?.id === event.toolCallId
        );

        if (toolItemIndex !== -1) {
          const existingToolItem = this.displayItems[toolItemIndex];

          // Remove from pending approvals (tool execution completed)
          if (this.pendingApprovals.has(event.toolCallId)) {
            this.pendingApprovals.delete(event.toolCallId);

            // Notify callback
            if (this.callbacks.onPendingApprovalsChange) {
              this.callbacks.onPendingApprovalsChange(new Map(this.pendingApprovals));
            }
          }

          // Update with response and clear needsApproval flag
          const updatedToolItem: MessageListItem = {
            ...existingToolItem,
            toolResponse: {
              tool_call_id: event.toolCallId,
              output: event.output,
              error: event.error,
            },
            needsApproval: false, // No longer needs approval (already executed)
          };

          // Update displayItems entry
          this.displayItems[toolItemIndex] = updatedToolItem;

          // Also update streamingToolCalls buffer
          this.streamingToolCalls.set(event.toolCallId, updatedToolItem);

          // Notify UI
          this.notifyDisplayItemsChanged();
        }
        break;

      case 'tool_progress': {
        // Tool execution progress update - add to progress array
        // Find the most recent tool call item matching the tool name (toolCallId may not be available)
        let progressToolIndex = -1;

        if (event.toolCallId) {
          // If toolCallId is available, find by exact ID
          progressToolIndex = this.displayItems.findIndex(
            (item: MessageListItem) => item.type === 'tool_call' && item.toolCall?.id === event.toolCallId
          );
        }

        // If not found by ID, find the most recent tool call with matching name that doesn't have a response yet
        if (progressToolIndex === -1) {
          for (let i = this.displayItems.length - 1; i >= 0; i--) {
            const item = this.displayItems[i];
            if (item.type === 'tool_call' &&
                item.toolCall?.name === event.toolName &&
                !item.toolResponse) {
              progressToolIndex = i;
              break;
            }
          }
        }

        if (progressToolIndex !== -1) {
          const existingItem = this.displayItems[progressToolIndex];

          // Add progress entry
          const progressEntry = {
            type: event.progressType as 'stdout' | 'stderr' | 'start' | 'end' | 'error',
            message: event.message,
            timestamp: event.timestamp,
          };

          // Update with new progress
          const updatedItem: MessageListItem = {
            ...existingItem,
            progress: [...(existingItem.progress || []), progressEntry],
          };

          this.displayItems[progressToolIndex] = updatedItem;

          // Notify UI
          this.notifyDisplayItemsChanged();
        }
        break;
      }      

      case 'checkpoint':
        // Checkpoint: current streaming item is complete, finalize it
        // Streaming item is already in displayItems, just clear buffers
        // Clear text streaming buffers (ready for next item)
        this.streamingText = '';
        this.streamingMessageId = null;
        this.streamingItemIndex = -1;
        this.streamingUsage = undefined;

        // No need to notify UI - item is already in displayItems
        break;

      case 'message': {
        // Complete message event (e.g., compact summary)
        // Create a new message item and add to displayItems
        const messageItem: MessageListItem = {
          type: 'message',
          id: `message-${this.sessionId}-${event.timestamp}`,
          timestamp: event.timestamp,
          role: 'assistant',
          content: event.content,
          isCompactSummary: event.isCompactSummary,
        };

        this.displayItems.push(messageItem);

        // Notify UI
        this.notifyDisplayItemsChanged();
        break;
      }

      case 'error':
        // Error occurred during execution - add error message to displayItems
        const errorMessageItem: MessageListItem = {
          type: 'message',
          id: `error-${Date.now()}`,
          timestamp: Date.now(),
          role: 'assistant',
          content: `❌ Error: ${event.error}${event.details ? '\n\nDetails: ' + event.details : ''}`,
        };

        this.displayItems.push(errorMessageItem);

        // Clear status item (set to idle)
        this.updateStatusItem({ thinking: false });

        // Notify UI
        this.notifyDisplayItemsChanged();
        break;

      case 'cancelled':
        // User cancelled the request - show as inline status (not message bubble)
        const cancelledItem: MessageListItem = {
          type: 'cancelled',
          id: `cancelled-${Date.now()}`,
          timestamp: Date.now(),
        };

        this.displayItems.push(cancelledItem);

        // Clear status item (set to idle)
        this.updateStatusItem({ thinking: false });

        // Notify UI
        this.notifyDisplayItemsChanged();
        break;

      case 'usage_limit': {
        // Usage limit reached - show as inline usage limit indicator
        const usageLimitItem: MessageListItem = {
          type: 'usage_limit',
          id: `usage-limit-${Date.now()}`,
          timestamp: Date.now(),
          usageLimitMessage: event.message,
        };

        this.displayItems.push(usageLimitItem);

        // Clear status item (set to idle)
        this.updateStatusItem({ thinking: false });

        // Notify UI
        this.notifyDisplayItemsChanged();
        break;
      }

      case 'done': {
        // Stream completed - clear streaming state
        // Remove empty assistant messages (messages with no content or only whitespace)
        // These often appear when LLM decides to call tools without text
        this.displayItems = this.displayItems.filter(item => {
          if (item.type === 'message' && item.role === 'assistant') {
            // Handle both string and ContentBlock[] content formats
            if (typeof item.content === 'string') {
              return item.content.trim().length > 0;
            }
            // For ContentBlock[], check if any text block has content
            if (Array.isArray(item.content)) {
              return item.content.some(block =>
                block.type === 'text' && 'text' in block && (block.text as string)?.trim().length > 0
              );
            }
            // Keep message if content exists in unknown format
            return !!item.content;
          }
          // Keep all non-assistant messages and tool calls
          return true;
        });

        // Update the last assistant message with final usage if available
        if (event.usage) {
          for (let i = this.displayItems.length - 1; i >= 0; i--) {
            const item = this.displayItems[i];
            if (item.type === 'message' && item.role === 'assistant') {
              this.displayItems[i] = { ...item, usage: event.usage };
              break;
            }
          }
        }

        this.streamingText = '';
        this.streamingMessageId = null;
        this.streamingItemIndex = -1;
        this.streamingUsage = undefined;
        this.streamingToolCalls.clear();

        // Notify UI of the filtered items
        this.notifyDisplayItemsChanged();

        // Don't manually set idle here - backend already sends idle state event before done
        // Status will be cleared by the idle state event from backend
        break;
      }
    }
  }

  /**
   * Add event to queue and start processing
   */
  private enqueueEvent(event: { type: 'streamEvent' | 'historyUpdate'; streamEvent?: StreamEvent }) {
    this.eventQueue.push(event);
    this.processEventQueue();
  }

  /**
   * Process event queue sequentially
   */
  private async processEventQueue() {
    // Prevent concurrent processing
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        if (!event) continue;

        if (event.type === 'streamEvent') {
          // Process stream event synchronously (no await needed)
          this.processStreamEvent(event.streamEvent!);
        } else if (event.type === 'historyUpdate') {
          await this.fetchAndUpdateHistory();
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Fetch complete history from backend and update cache
   * Called from event queue, so no need for additional locking
   */
  private async fetchAndUpdateHistory() {
    try {
      // Fetch complete history from backend (single source of truth)
      const history = await window.electronAPI.session.getHistory(this.sessionId);

      // Use loadCompleteHistory to process and update cache
      this.loadCompleteHistory(history);
    } catch (error) {
      console.error('[SessionAgent] Failed to fetch and update history:', error);
    }
  }

  /**
   * Load complete history (used on activation)
   * Splits messages and tool calls into separate MessageListItems
   * @param history - Complete message history from backend
   */
  private loadCompleteHistory(history: Array<{
    role: string;
    content: MessageContent;
    timestamp?: number;
    usage?: UsageMetadata;
    tool_calls?: Array<{ id: string; name: string; args: Record<string, any> }>;
    tool_responses?: Array<{ tool_call_id: string; output: string; error?: string }>;
    isCompactSummary?: boolean;
    isUsageLimitError?: boolean;
  }>) {
    try {
      const items: MessageListItem[] = [];
      let itemIndex = 0;

      // Process each message from history
      history.forEach((msg, msgIndex) => {
        // Process content: preserve MessageContent type (string | Array<ContentBlock>)
        // For messages with tool_calls, extract text only if content is JSON string
        let displayContent: MessageContent = msg.content;
        let thinkingContent: string | undefined;

        // Handle array content (ContentBlock[]) - extract thinking and filter content
        if (Array.isArray(msg.content)) {
          const blocks = msg.content as Array<{ type: string; text?: string; thinking?: string }>;

          // Extract thinking content
          const thinkingBlocks = blocks.filter(block => block.type === 'thinking');
          if (thinkingBlocks.length > 0) {
            thinkingContent = thinkingBlocks.map(b => b.thinking || '').join('\n');
          }

          // Filter to text and image blocks for display content (exclude thinking blocks)
          const displayBlocks = blocks.filter(block => block.type === 'text' || block.type === 'image');
          if (displayBlocks.length > 0) {
            displayContent = displayBlocks as MessageContent;
          } else {
            displayContent = [];
          }
        } else if (msg.tool_calls && msg.tool_calls.length > 0 && typeof msg.content === 'string') {
          try {
            const parsed = JSON.parse(msg.content);
            if (Array.isArray(parsed)) {
              // Only extract pure text parts, ignore functionCall
              const textParts = parsed
                .filter((item: {type?: string; text?: string}) => item.type === 'text')
                .map((item: {text?: string}) => item.text || '');
              displayContent = textParts.join('');
            }
          } catch {
            // If not valid JSON or parsing fails, keep original content
          }
        }

        // Create thinking item FIRST (before message) if thinking content exists
        if (thinkingContent && thinkingContent.trim()) {
          const thinkingItem: MessageListItem = {
            type: 'thinking',
            id: `${this.sessionId}-thinking-${msgIndex}`,
            timestamp: msg.timestamp || Date.now(),
            thinking: thinkingContent,
          };
          items.push(thinkingItem);
          itemIndex++;
        }

        // Check if content is empty (for both string and array types)
        let isEmpty = false;
        if (typeof displayContent === 'string') {
          const trimmed = displayContent.trim();
          isEmpty = trimmed === '[]' || trimmed === '{}' || trimmed === '';
        } else if (Array.isArray(displayContent)) {
          // Check if array has any text or image content
          const hasContent = displayContent.some(
            (block: { type: string; text?: string }) =>
              (block.type === 'text' && block.text?.trim()) || block.type === 'image'
          );
          isEmpty = !hasContent;
        }

        // Create message item only if content is not empty (skip empty assistant messages)
        if (!isEmpty) {
          // Check if this is a usage limit error message
          if (msg.isUsageLimitError) {
            // Extract text from content (can be string or ContentBlock[])
            let limitMessage: string | undefined;
            if (typeof displayContent === 'string') {
              limitMessage = displayContent;
            } else if (Array.isArray(displayContent)) {
              // Extract text from ContentBlock array
              const textParts: string[] = [];
              for (const block of displayContent) {
                if (block.type === 'text' && 'text' in block) {
                  textParts.push(block.text);
                }
              }
              limitMessage = textParts.join('');
            }

            const usageLimitItem: MessageListItem = {
              type: 'usage_limit',
              id: `${this.sessionId}-usage-limit-${msgIndex}`,
              timestamp: msg.timestamp || Date.now(),
              usageLimitMessage: limitMessage,
            };
            items.push(usageLimitItem);
            itemIndex++;
          } else {
            const messageItem: MessageListItem = {
              type: 'message',
              id: `${this.sessionId}-msg-${msgIndex}`,
              timestamp: msg.timestamp || Date.now(),
              role: msg.role as 'user' | 'assistant',
              content: displayContent,
              usage: msg.usage,
              isCompactSummary: msg.isCompactSummary,
            };

            items.push(messageItem);
            itemIndex++;
          }
        }

        // Create separate tool call items if present
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Build tool response map for quick lookup
          const responseMap = new Map(
            (msg.tool_responses || []).map(r => [r.tool_call_id, r])
          );

          msg.tool_calls.forEach((toolCall, toolIndex) => {
            const response = responseMap.get(toolCall.id);
            const needsApproval = this.pendingApprovals.has(toolCall.id);
            const wasRejected = this.rejectedTools.has(toolCall.id);

            const toolItem: MessageListItem = {
              type: 'tool_call',
              id: `${this.sessionId}-tool-${msgIndex}-${toolIndex}`,
              timestamp: msg.timestamp || Date.now(),
              toolCall,
              toolResponse: response,
              needsApproval,
              wasRejected,
            };

            items.push(toolItem);
            itemIndex++;
          });
        }
      });

      // Update displayItems
      this.displayItems = items;

      // Notify UI
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
    toolCallIds.forEach(id => this.pendingApprovals.delete(id));

    // Notify callback
    if (this.callbacks.onPendingApprovalsChange) {
      this.callbacks.onPendingApprovalsChange(new Map(this.pendingApprovals));
    }

    // Immediately update displayItems to reflect approval - UI should respond instantly
    this.displayItems = this.displayItems.map(item => {
      if (item.type === 'tool_call' && item.toolCall && toolCallIds.includes(item.toolCall.id)) {
        return {
          ...item,
          needsApproval: false, // Clear approval flag
        };
      }
      return item;
    });

    // Notify UI to re-render with updated displayItems
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
    toolCallIds.forEach(id => {
      this.pendingApprovals.delete(id);
      this.rejectedTools.add(id);
    });

    // Notify callbacks
    if (this.callbacks.onPendingApprovalsChange) {
      this.callbacks.onPendingApprovalsChange(new Map(this.pendingApprovals));
    }
    if (this.callbacks.onRejectedToolsChange) {
      this.callbacks.onRejectedToolsChange(new Set(this.rejectedTools));
    }

    // Immediately update displayItems to reflect rejection - UI should respond instantly
    this.displayItems = this.displayItems.map(item => {
      if (item.type === 'tool_call' && item.toolCall && toolCallIds.includes(item.toolCall.id)) {
        return {
          ...item,
          needsApproval: false, // Clear approval flag
          wasRejected: true,    // Set rejection flag
        };
      }
      return item;
    });

    // Notify UI to re-render with updated displayItems
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
    if (this.callbacks.onPendingApprovalsChange) {
      this.callbacks.onPendingApprovalsChange(new Map(this.pendingApprovals));
    }
    if (this.callbacks.onRejectedToolsChange) {
      this.callbacks.onRejectedToolsChange(new Set(this.rejectedTools));
    }
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
      const statusItem: MessageListItem = {
        type: 'status',
        id: `status-${Date.now()}`,
        timestamp: Date.now(),
        agentState: {
          thinking: false,
          command: {
            name: commandName,
            status: 'running',
          },
        },
      };

      this.displayItems.push(statusItem);
    } else {
      // Regular message: show user message + thinking status
      this.displayItems.push(userMessage);

      // Create status item manually to avoid array recreation issue
      const statusItem: MessageListItem = {
        type: 'status',
        id: `status-${Date.now()}`,
        timestamp: Date.now(),
        agentState: { thinking: true },
      };

      this.displayItems.push(statusItem);
    }

    // Notify UI
    this.notifyDisplayItemsChanged();
  }

  /**
   * Deactivate this session agent (when switching away)
   * Agent is cached but stops processing events
   */
  deactivate() {
    this.isActive = false;

    // Clear streaming state when deactivating
    this.streamingText = '';
    this.streamingMessageId = null;
    this.streamingItemIndex = -1;
    this.streamingUsage = undefined;
    this.streamingToolCalls.clear();

    // Clear status item
    this.updateStatusItem({ thinking: false });

    // Also notify callback for backward compatibility
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange({ thinking: false });
    }
  }

  /**
   * Destroy this session agent (cleanup)
   */
  destroy() {
    this.isActive = false;
    this.pendingApprovals.clear();
    this.rejectedTools.clear();

    // Clear streaming state
    this.streamingText = '';
    this.streamingMessageId = null;
    this.streamingItemIndex = -1;
    this.streamingUsage = undefined;
    this.streamingToolCalls.clear();

    // Clear status item
    this.updateStatusItem({ thinking: false });

    // Also notify callback for backward compatibility
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange({ thinking: false });
    }

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
