/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Pure reducer functions that transform the display item list in response
 * to stream events and history loads. Each function takes the current
 * MessageListItem[] (plus event-specific data) and returns the next array -
 * no mutation, no side effects.
 */

import type { MessageListItem, MessageContent, UsageMetadata, ToolProgressEntry, SubagentActivityEntry } from '../../../preload/preload-types';
import type { AgentState } from '../../../../core/agents/claude-agent.js';
import type { TaskNotification } from '../../../../core/utils/task-notification.js';

/** Cap on how many nested activity entries a subagent card keeps, to avoid unbounded growth on long-running agents. */
const MAX_SUBAGENT_ACTIVITY_ENTRIES = 200;

/**
 * Append a nested activity entry to the Agent/Task tool_call item identified
 * by `parentToolCallId`. Returns the unchanged array if no such parent exists
 * yet (defensive: caller should fall back to flat rendering in that case).
 */
function appendSubagentActivity(
  items: MessageListItem[],
  parentToolCallId: string,
  entry: SubagentActivityEntry,
): MessageListItem[] | null {
  const parentIndex = items.findIndex((item) => item.type === 'tool_call' && item.toolCall?.id === parentToolCallId);
  if (parentIndex === -1) {
    return null;
  }

  const parent = items[parentIndex];
  const nextActivity = [...(parent.subagentActivity ?? []), entry].slice(-MAX_SUBAGENT_ACTIVITY_ENTRIES);

  const next = [...items];
  next[parentIndex] = { ...parent, subagentActivity: nextActivity };
  return next;
}

/**
 * Update (or remove) the status indicator item. The status item is always
 * kept at the end of the list; an idle state removes it entirely.
 */
export function updateStatusItem(items: MessageListItem[], state: AgentState): MessageListItem[] {
  const itemsWithoutStatus = items.filter((item) => item.type !== 'status');
  const isIdle = !state.thinking && !state.tool && !state.command && !state.queued && !state.activeTasks?.length;

  if (isIdle) {
    return itemsWithoutStatus;
  }

  const statusItem: MessageListItem = {
    type: 'status',
    id: `status-${Date.now()}`,
    timestamp: Date.now(),
    agentState: state,
  };
  return [...itemsWithoutStatus, statusItem];
}

/**
 * Update the live thinking-token estimate on the current status item, if any.
 * No-op if there is no status item (e.g. thinking already ended).
 */
export function updateThinkingTokens(items: MessageListItem[], estimatedTokens: number): MessageListItem[] {
  const statusIndex = items.findIndex((item) => item.type === 'status');
  if (statusIndex === -1) {
    return items;
  }

  const statusItem = items[statusIndex];
  if (statusItem.type !== 'status' || !statusItem.agentState) {
    return items;
  }

  const next = [...items];
  next[statusIndex] = {
    ...statusItem,
    agentState: { ...statusItem.agentState, thinkingTokens: estimatedTokens },
  };
  return next;
}

/**
 * Insert an item, keeping any existing status item at the end of the list.
 */
export function addItemKeepingStatusAtEnd(items: MessageListItem[], item: MessageListItem): MessageListItem[] {
  const statusIndex = items.findIndex((i) => i.type === 'status');
  if (statusIndex === -1) {
    return [...items, item];
  }
  const next = [...items];
  next.splice(statusIndex, 0, item);
  return next;
}

/**
 * Create or update the in-progress streaming assistant message.
 */
export function upsertStreamingMessage(items: MessageListItem[], message: MessageListItem, isNew: boolean): MessageListItem[] {
  if (isNew) {
    return addItemKeepingStatusAtEnd(items, message);
  }

  const index = items.findIndex((i) => i.id === message.id);
  if (index === -1) {
    return addItemKeepingStatusAtEnd(items, message);
  }

  const next = [...items];
  next[index] = {
    ...next[index],
    content: message.content,
    usage: message.usage ?? next[index].usage,
  };
  return next;
}

/**
 * Handle a tool_start event: parse args and add a new tool_call item.
 */
/** Short one-line summary of a nested tool call's args, for the subagent activity timeline. */
function summarizeToolArgs(args: Record<string, unknown>): string | undefined {
  const candidate = args.file_path ?? args.path ?? args.command ?? args.pattern ?? args.url ?? args.description;
  if (typeof candidate === 'string') {
    return candidate.length > 80 ? `${candidate.slice(0, 80)}...` : candidate;
  }
  return undefined;
}

export function applyToolStart(
  items: MessageListItem[],
  event: { toolCallId: string; toolName: string; args: Record<string, unknown>; parentToolCallId?: string },
  pendingApprovals: Map<string, string>,
): MessageListItem[] {
  const argsValue: unknown = event.args;
  let parsedArgs: Record<string, unknown>;

  if (argsValue && typeof argsValue === 'object') {
    parsedArgs = argsValue as Record<string, unknown>;
  } else if (typeof argsValue === 'string') {
    try {
      parsedArgs = JSON.parse(argsValue);
    } catch {
      parsedArgs = { _error: 'Invalid arguments format', _raw: argsValue.substring(0, 100) };
    }
  } else {
    parsedArgs = { _error: 'Invalid argument type' };
  }

  if (event.parentToolCallId) {
    const nested = appendSubagentActivity(items, event.parentToolCallId, {
      id: `subagent-activity-${event.toolCallId}`,
      kind: 'tool',
      timestamp: Date.now(),
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      toolArgsSummary: summarizeToolArgs(parsedArgs),
    });
    if (nested) {
      return nested;
    }
    // Parent card not found (e.g. arrived out of order) - fall back to flat rendering below.
  }

  const toolStartItem: MessageListItem = {
    type: 'tool_call',
    id: `tool-${event.toolCallId}`,
    timestamp: Date.now(),
    toolCall: {
      id: event.toolCallId,
      name: event.toolName,
      args: parsedArgs,
    },
    needsApproval: pendingApprovals.has(event.toolCallId),
    parentToolCallId: event.parentToolCallId,
  };

  return addItemKeepingStatusAtEnd(items, toolStartItem);
}

/**
 * Handle a tool_end event: attach the response and clear needsApproval.
 * Returns the unchanged array if no matching tool_call item is found.
 */
export function applyToolEnd(
  items: MessageListItem[],
  event: { toolCallId: string; output: string; error?: string; parentToolCallId?: string },
): MessageListItem[] {
  if (event.parentToolCallId) {
    const parentIndex = items.findIndex((item) => item.type === 'tool_call' && item.toolCall?.id === event.parentToolCallId);
    if (parentIndex !== -1) {
      const parent = items[parentIndex];
      const activityIndex = (parent.subagentActivity ?? []).findIndex((entry) => entry.toolCallId === event.toolCallId);
      if (activityIndex === -1) {
        return items;
      }
      const nextActivity = [...parent.subagentActivity!];
      nextActivity[activityIndex] = {
        ...nextActivity[activityIndex],
        isError: !!event.error,
        completedAt: Date.now(),
      };
      const next = [...items];
      next[parentIndex] = { ...parent, subagentActivity: nextActivity };
      return next;
    }
    // Parent card not found - fall through to flat lookup as a defensive fallback.
  }

  const index = items.findIndex((item) => item.type === 'tool_call' && item.toolCall?.id === event.toolCallId);
  if (index === -1) {
    return items;
  }

  const next = [...items];
  next[index] = {
    ...next[index],
    toolResponse: {
      tool_call_id: event.toolCallId,
      output: event.output,
      error: event.error,
    },
    needsApproval: false,
  };
  return next;
}

/**
 * Handle a tool_progress event: append a progress entry to the matching
 * tool_call item (by id, or the most recent unresolved item with the same
 * tool name if no id is available).
 */
export function applyToolProgress(
  items: MessageListItem[],
  event: { toolCallId?: string; toolName: string; progressType: string; message: string; timestamp: number },
): MessageListItem[] {
  let index = -1;

  if (event.toolCallId) {
    index = items.findIndex((item) => item.type === 'tool_call' && item.toolCall?.id === event.toolCallId);
  }

  if (index === -1) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.type === 'tool_call' && item.toolCall?.name === event.toolName && !item.toolResponse) {
        index = i;
        break;
      }
    }
  }

  if (index === -1) {
    return items;
  }

  const existingItem = items[index];
  const progressEntry: ToolProgressEntry = {
    type: event.progressType as ToolProgressEntry['type'],
    message: event.message,
    timestamp: event.timestamp,
  };

  const next = [...items];
  next[index] = {
    ...existingItem,
    progress: [...(existingItem.progress ?? []), progressEntry],
  };
  return next;
}

/**
 * Handle a 'subagent_text' event: a running subagent produced a text block.
 * Nests it into the parent Agent/Task card's activity timeline; dropped
 * entirely if the parent card can't be found (no flat fallback - subagent
 * text was never meant to appear in the main message stream).
 */
export function applySubagentText(
  items: MessageListItem[],
  event: { parentToolCallId: string; text: string },
): MessageListItem[] {
  const nested = appendSubagentActivity(items, event.parentToolCallId, {
    id: `subagent-activity-text-${event.parentToolCallId}-${Date.now()}`,
    kind: 'text',
    timestamp: Date.now(),
    text: event.text,
  });
  return nested ?? items;
}

/**
 * Handle a nested 'thinking' event (parentToolCallId set): a running subagent's
 * extended thinking block. Nests into the parent card like applySubagentText.
 */
export function applySubagentThinking(
  items: MessageListItem[],
  event: { parentToolCallId: string; thinking: string },
): MessageListItem[] {
  const nested = appendSubagentActivity(items, event.parentToolCallId, {
    id: `subagent-activity-thinking-${event.parentToolCallId}-${Date.now()}`,
    kind: 'thinking',
    timestamp: Date.now(),
    text: event.thinking,
  });
  return nested ?? items;
}

/** Append a streaming delta to a stable subagent activity entry. */
export function applySubagentActivityDelta(
  items: MessageListItem[],
  event: { parentToolCallId: string; activityId: string; kind: 'thinking' | 'text'; delta: string },
): MessageListItem[] {
  const parentIndex = items.findIndex((item) => item.type === 'tool_call' && item.toolCall?.id === event.parentToolCallId);
  if (parentIndex === -1) return items;

  const parent = items[parentIndex];
  const activity = parent.subagentActivity ?? [];
  const entryIndex = activity.findIndex((entry) => entry.id === event.activityId);
  let nextActivity: SubagentActivityEntry[];
  if (entryIndex === -1) {
    nextActivity = [...activity, {
      id: event.activityId,
      kind: event.kind,
      timestamp: Date.now(),
      text: event.delta,
    }].slice(-MAX_SUBAGENT_ACTIVITY_ENTRIES);
  } else {
    nextActivity = [...activity];
    nextActivity[entryIndex] = {
      ...nextActivity[entryIndex],
      text: `${nextActivity[entryIndex].text ?? ''}${event.delta}`,
    };
  }

  const next = [...items];
  next[parentIndex] = { ...parent, subagentActivity: nextActivity };
  return next;
}

/** Show skills injected into a subagent's context as preload metadata. */
export function applySubagentSkills(
  items: MessageListItem[],
  event: { parentToolCallId: string; skills: string[] },
): MessageListItem[] {
  const nested = appendSubagentActivity(items, event.parentToolCallId, {
    id: `subagent-skills-${event.parentToolCallId}`,
    kind: 'skill',
    timestamp: Date.now(),
    text: `Preloaded: ${event.skills.join(', ')}`,
  });
  return nested ?? items;
}

/**
 * Handle a 'message' event (e.g. a compact summary).
 */
export function applyMessageEvent(
  items: MessageListItem[],
  event: { content: string; timestamp: number; isCompactSummary?: boolean },
  sessionId: string,
): MessageListItem[] {
  const messageItem: MessageListItem = {
    type: 'message',
    id: `message-${sessionId}-${event.timestamp}`,
    timestamp: event.timestamp,
    role: 'assistant',
    content: event.content,
    isCompactSummary: event.isCompactSummary,
  };
  return addItemKeepingStatusAtEnd(items, messageItem);
}

/**
 * Handle a 'task_notification' event: a background subagent (Agent tool) finished.
 */
export function applyTaskNotificationEvent(
  items: MessageListItem[],
  event: { notification: TaskNotification; timestamp: number },
  sessionId: string,
): MessageListItem[] {
  // A background Agent/Task call does not always emit the ordinary tool_end
  // event when it settles. Correlate the notification back to its originating
  // tool card so the activity timeline and global subagent status stop showing
  // "running" immediately.
  const toolUseId = event.notification.toolUseId;
  const completedItems = toolUseId
    ? items.map((item) => {
        if (item.type === 'tool_call' && item.toolCall?.id === toolUseId && !item.toolResponse) {
          const succeeded = event.notification.status === 'completed';
          return {
            ...item,
            subagentCompletedAt: event.timestamp,
            toolResponse: {
              tool_call_id: toolUseId,
              output: event.notification.result || event.notification.summary,
              error: succeeded ? undefined : event.notification.summary,
            },
          };
        }
        if (item.type === 'status' && item.agentState?.subagent?.toolCallId === toolUseId) {
          return {
            ...item,
            agentState: { ...item.agentState, subagent: undefined },
          };
        }
        return item;
      })
    : items;

  const notificationItem: MessageListItem = {
    type: 'task_notification',
    id: `${sessionId}-task-notification-${event.timestamp}-${event.notification.taskId}`,
    timestamp: event.timestamp,
    taskNotification: event.notification,
  };
  return addItemKeepingStatusAtEnd(completedItems, notificationItem);
}

/**
 * Handle an 'error' event: append a visible error message.
 */
export function applyErrorEvent(items: MessageListItem[], event: { error: string; details?: string }): MessageListItem[] {
  const errorText = event.error.toLowerCase();
  const isLimitError =
    errorText.includes('limit reached') ||
    errorText.includes('session limit') ||
    errorText.includes('rate limit') ||
    errorText.includes('usage limit');
  if (isLimitError && items.some((item) => item.type === 'usage_limit')) {
    return items;
  }
  const errorMessageItem: MessageListItem = {
    type: 'message',
    id: `error-${Date.now()}`,
    timestamp: Date.now(),
    role: 'assistant',
    content: `❌ Error: ${event.error}${event.details ? '\n\nDetails: ' + event.details : ''}`,
  };
  return addItemKeepingStatusAtEnd(items, errorMessageItem);
}

const INTERRUPTED_MARKER = '[Request interrupted by user]';

function stripInterruptedMarker(content: MessageContent): MessageContent | null {
  if (typeof content === 'string') {
    const stripped = content.replace(INTERRUPTED_MARKER, '').trim();
    return stripped.length > 0 ? stripped : null;
  }
  if (Array.isArray(content)) {
    const cleaned = content.map((block) => {
      if (block.type === 'text' && 'text' in block) {
        return { ...block, text: block.text.replace(INTERRUPTED_MARKER, '').trim() };
      }
      return block;
    });
    const hasContent = cleaned.some((b) => b.type !== 'text' || ('text' in b && b.text.length > 0));
    return hasContent ? (cleaned as MessageContent) : null;
  }
  return content;
}

/**
 * Handle a 'cancelled' event: strip the API interruption marker from assistant
 * messages, mark unresolved tool_calls as cancelled, and append an inline indicator.
 */
export function applyCancelledEvent(items: MessageListItem[]): MessageListItem[] {
  const cleaned = items.reduce<MessageListItem[]>((acc, item) => {
    if (item.type === 'tool_call' && !item.toolResponse && !item.wasRejected) {
      acc.push({ ...item, wasCancelled: true });
      return acc;
    }
    if (item.type === 'message' && item.role === 'assistant' && item.content) {
      const strippedContent = stripInterruptedMarker(item.content);
      if (strippedContent === null) {
        return acc; // drop the message entirely
      }
      if (strippedContent !== item.content) {
        acc.push({ ...item, content: strippedContent });
        return acc;
      }
    }
    acc.push(item);
    return acc;
  }, []);

  const cancelledItem: MessageListItem = {
    type: 'cancelled',
    id: `cancelled-${Date.now()}`,
    timestamp: Date.now(),
  };
  return addItemKeepingStatusAtEnd(cleaned, cancelledItem);
}

/**
 * Clear any dangling "needs approval" markers on cancel. Without this, a tool
 * approval dialog left open when the user hits Stop stays visually pending
 * forever - the backend already resolved/discarded it, but the UI never
 * finds out unless we clear it here too.
 */
export function clearPendingToolApprovals(items: MessageListItem[]): MessageListItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.type === 'tool_call' && item.needsApproval) {
      changed = true;
      return { ...item, needsApproval: false };
    }
    return item;
  });
  return changed ? next : items;
}

/**
 * Handle a 'usage_limit' event: append an inline usage-limit indicator.
 */
export function applyUsageLimitEvent(items: MessageListItem[], event: { message: string }): MessageListItem[] {
  const isLimitMessage = (item: MessageListItem): boolean => {
    if (item.type !== 'message' || item.role !== 'assistant' || typeof item.content !== 'string') return false;
    const text = item.content.toLowerCase();
    return (
      text.includes('limit reached') ||
      text.includes('session limit') ||
      text.includes('rate limit') ||
      text.includes('usage limit')
    );
  };
  const withoutDuplicates = items.filter((item) => item.type !== 'usage_limit' && !isLimitMessage(item));
  const usageLimitItem: MessageListItem = {
    type: 'usage_limit',
    id: `usage-limit-${Date.now()}`,
    timestamp: Date.now(),
    usageLimitMessage: event.message,
  };
  return addItemKeepingStatusAtEnd(withoutDuplicates, usageLimitItem);
}

/**
 * Handle a 'done' event: drop empty assistant messages (turns that only
 * called tools) and apply final usage to the last remaining assistant
 * message.
 */
export function applyDone(items: MessageListItem[], usage?: UsageMetadata): MessageListItem[] {
  const hasUsageLimit = items.some((item) => item.type === 'usage_limit');
  const filtered = items.filter((item) => {
    if (item.type === 'message' && item.role === 'assistant') {
      if (typeof item.content === 'string') {
        if (hasUsageLimit) {
          const text = item.content.toLowerCase();
          if (
            text.includes('limit reached') ||
            text.includes('session limit') ||
            text.includes('rate limit') ||
            text.includes('usage limit')
          ) return false;
        }
        return item.content.trim().length > 0;
      }
      if (Array.isArray(item.content)) {
        return item.content.some(
          (block) => block.type === 'text' && 'text' in block && block.text?.trim().length > 0,
        );
      }
      return !!item.content;
    }
    return true;
  });

  if (!usage) {
    return filtered;
  }

  const next = [...filtered];
  for (let i = next.length - 1; i >= 0; i--) {
    const item = next[i];
    if (item.type === 'message' && item.role === 'assistant') {
      next[i] = { ...item, usage };
      break;
    }
  }
  return next;
}

/**
 * A single message from session history, as returned by
 * `window.electronAPI.session.getHistory`.
 */
export interface HistoryEntry {
  role: string;
  content: MessageContent;
  timestamp?: number;
  usage?: UsageMetadata;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  tool_responses?: Array<{ tool_call_id: string; output: string; error?: string }>;
  isCompactSummary?: boolean;
  isUsageLimitError?: boolean;
  taskNotification?: TaskNotification;
}

/**
 * Build the full display item list from session history. Splits each
 * message into separate thinking / message / usage_limit / tool_call items.
 */
export function buildDisplayItemsFromHistory(
  history: HistoryEntry[],
  sessionId: string,
  pendingApprovals: Map<string, string>,
  rejectedTools: Set<string>,
): MessageListItem[] {
  const items: MessageListItem[] = [];

  history.forEach((msg, msgIndex) => {
    if (msg.taskNotification) {
      items.push({
        type: 'task_notification',
        id: `${sessionId}-task-notification-${msgIndex}`,
        timestamp: msg.timestamp || Date.now(),
        taskNotification: msg.taskNotification,
      });
      return;
    }

    let displayContent: MessageContent = msg.content;
    let thinkingContent: string | undefined;

    if (Array.isArray(msg.content)) {
      const blocks = msg.content as Array<{ type: string; text?: string; thinking?: string }>;

      const thinkingBlocks = blocks.filter((block) => block.type === 'thinking');
      if (thinkingBlocks.length > 0) {
        thinkingContent = thinkingBlocks.map((b) => b.thinking || '').join('\n');
      }

      const displayBlocks = blocks.filter((block) => block.type === 'text' || block.type === 'image');
      displayContent = displayBlocks.length > 0 ? (displayBlocks as MessageContent) : [];
    } else if (msg.tool_calls && msg.tool_calls.length > 0 && typeof msg.content === 'string') {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          const textParts = parsed
            .filter((item: { type?: string; text?: string }) => item.type === 'text')
            .map((item: { text?: string }) => item.text || '');
          displayContent = textParts.join('');
        }
      } catch {
        // Not valid JSON - keep original content
      }
    }

    if (thinkingContent && thinkingContent.trim()) {
      items.push({
        type: 'thinking',
        id: `${sessionId}-thinking-${msgIndex}`,
        timestamp: msg.timestamp || Date.now(),
        thinking: thinkingContent,
      });
    }

    let isEmpty = false;
    if (typeof displayContent === 'string') {
      const trimmed = displayContent.trim();
      isEmpty = trimmed === '[]' || trimmed === '{}' || trimmed === '';
    } else if (Array.isArray(displayContent)) {
      const hasContent = displayContent.some(
        (block) => (block.type === 'text' && block.text?.trim()) || block.type === 'image',
      );
      isEmpty = !hasContent;
    }

    if (!isEmpty) {
      if (msg.isUsageLimitError) {
        let limitMessage: string | undefined;
        if (typeof displayContent === 'string') {
          limitMessage = displayContent;
        } else if (Array.isArray(displayContent)) {
          const textParts: string[] = [];
          for (const block of displayContent) {
            if (block.type === 'text' && 'text' in block) {
              textParts.push(block.text);
            }
          }
          limitMessage = textParts.join('');
        }

        items.push({
          type: 'usage_limit',
          id: `${sessionId}-usage-limit-${msgIndex}`,
          timestamp: msg.timestamp || Date.now(),
          usageLimitMessage: limitMessage,
        });
      } else {
        items.push({
          type: 'message',
          id: `${sessionId}-msg-${msgIndex}`,
          timestamp: msg.timestamp || Date.now(),
          role: msg.role as 'user' | 'assistant',
          content: displayContent,
          usage: msg.usage,
          isCompactSummary: msg.isCompactSummary,
        });
      }
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const responseMap = new Map((msg.tool_responses || []).map((r) => [r.tool_call_id, r]));

      msg.tool_calls.forEach((toolCall, toolIndex) => {
        items.push({
          type: 'tool_call',
          id: `${sessionId}-tool-${msgIndex}-${toolIndex}`,
          timestamp: msg.timestamp || Date.now(),
          toolCall,
          toolResponse: responseMap.get(toolCall.id),
          needsApproval: pendingApprovals.has(toolCall.id),
          wasRejected: rejectedTools.has(toolCall.id),
        });
      });
    }
  });

  return items;
}
