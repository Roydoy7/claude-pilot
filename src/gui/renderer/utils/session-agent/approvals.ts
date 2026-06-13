/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Pure helpers for tool-approval state transitions on the display item
 * list. Pending-approval/rejected-tool bookkeeping (Map/Set) is owned by
 * SessionAgent itself; this module only reduces the displayItems array.
 */

import type { MessageListItem } from '../../../preload/preload-types';

/**
 * Mark a tool_call item as needing approval (a canUseTool approval request
 * arrived for it - possibly before its tool_start event).
 */
export function markToolNeedsApproval(items: MessageListItem[], toolUseId: string): MessageListItem[] {
  const index = items.findIndex((item) => item.type === 'tool_call' && item.toolCall?.id === toolUseId);
  if (index === -1) {
    return items;
  }
  const next = [...items];
  next[index] = { ...next[index], needsApproval: true };
  return next;
}

/**
 * Clear the needsApproval flag for the given tool call ids (user approved).
 */
export function applyToolApprovals(items: MessageListItem[], toolCallIds: string[]): MessageListItem[] {
  return items.map((item) => {
    if (item.type === 'tool_call' && item.toolCall && toolCallIds.includes(item.toolCall.id)) {
      return { ...item, needsApproval: false };
    }
    return item;
  });
}

/**
 * Clear the needsApproval flag and mark the given tool call ids as rejected
 * (user rejected).
 */
export function applyToolRejections(items: MessageListItem[], toolCallIds: string[]): MessageListItem[] {
  return items.map((item) => {
    if (item.type === 'tool_call' && item.toolCall && toolCallIds.includes(item.toolCall.id)) {
      return { ...item, needsApproval: false, wasRejected: true };
    }
    return item;
  });
}
