/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Pure helpers for assembling streaming text and thinking content into
 * MessageListItems. Text deltas arrive incrementally; this module tracks
 * the in-progress buffer and produces the message item to upsert.
 */

import type { MessageListItem, UsageMetadata } from '../../../preload/preload-types';

export interface StreamingTextState {
  text: string;
  messageId: string | null;
  usage: UsageMetadata | undefined;
}

export function createStreamingTextState(): StreamingTextState {
  return { text: '', messageId: null, usage: undefined };
}

export interface TextDeltaResult {
  state: StreamingTextState;
  message: MessageListItem | null;
  isNew: boolean;
}

/**
 * Accumulate a text_delta event into the streaming buffer.
 *
 * Claude sends usage metadata on the first delta (often with empty text),
 * then text in subsequent deltas - the usage is stored until there is
 * visible text to attach it to. `isNew` is true on the delta where visible
 * text first appears, meaning a new display item should be created rather
 * than updating an existing one.
 */
export function applyTextDelta(
  state: StreamingTextState,
  event: { text: string; usage?: UsageMetadata },
  sessionId: string,
): TextDeltaResult {
  const messageId = state.messageId ?? `streaming-${sessionId}-${Date.now()}`;
  const previousText = state.messageId ? state.text : '';
  const previousUsage = state.messageId ? state.usage : undefined;

  const wasEmpty = previousText.trim().length === 0;
  const text = previousText + event.text;
  const usage = event.usage ?? previousUsage;
  const next: StreamingTextState = { text, messageId, usage };

  const hasText = text.trim().length > 0;
  if (!hasText) {
    return { state: next, message: null, isNew: false };
  }

  const message: MessageListItem = {
    type: 'message',
    id: messageId,
    timestamp: Date.now(),
    role: 'assistant',
    content: text,
    usage,
  };

  return { state: next, message, isNew: wasEmpty };
}

/**
 * Create a thinking item from an extended-thinking event.
 */
export function createThinkingItem(sessionId: string, thinking: string): MessageListItem {
  return {
    type: 'thinking',
    id: `thinking-${sessionId}-${Date.now()}`,
    timestamp: Date.now(),
    thinking,
  };
}
