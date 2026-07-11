/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MessageList Component - Natively scrolled list of messages and tool calls.
 *
 * Deliberately NOT JS-virtualized: dynamic-height virtualization needs
 * runtime measurement + scrollTop correction, which fights user scrolling
 * and causes jitter on long replies. Instead, offscreen rows are skipped
 * by the browser via CSS content-visibility (see .message-row), rows are
 * memoized so scrolling never re-renders markdown, and native CSS scroll
 * anchoring keeps the viewport stable.
 */

import type React from 'react';
import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { Message } from './Message';
import { ToolCallItem } from './ToolCallItem';
import { StatusItem } from './StatusItem';
import { ThinkingItem } from './ThinkingItem';
import { CancelledItem } from './CancelledItem';
import { UsageLimitItem } from './UsageLimitItem';
import { CompactSummaryItem } from './CompactSummaryItem';
import { useLanguage } from '../../i18n/LanguageContext';
import type { MessageListItem } from '../../../preload/preload-types';

interface MessageListProps {
  items: MessageListItem[];
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
}

const SCROLL_THRESHOLD = 150; // Distance from bottom to consider "at bottom"

/**
 * Check if an item should be rendered (not empty)
 */
function shouldRenderItem(item: MessageListItem): boolean {
  if (item.type === 'message') {
    // Skip empty assistant messages
    if (item.role === 'assistant' && (!item.content || (typeof item.content === 'string' && item.content.trim() === ''))) {
      return false;
    }
    return true;
  }
  return true;
}

/**
 * Renders a single item based on its type
 */
function renderItem(
  item: MessageListItem,
  onToolApprove?: (toolCallId: string) => void,
  onToolReject?: (toolCallId: string) => void,
): React.ReactNode {
  if (item.type === 'message') {
    if (item.isCompactSummary) {
      return <CompactSummaryItem item={item} />;
    }

    return (
      <Message
        message={{
          id: item.id,
          role: item.role!,
          content: item.content!,
          usage: item.usage,
          timestamp: item.timestamp,
        }}
      />
    );
  } else if (item.type === 'tool_call') {
    return <ToolCallItem item={item} onApprove={onToolApprove} onReject={onToolReject} />;
  } else if (item.type === 'status') {
    return <StatusItem item={item} />;
  } else if (item.type === 'thinking') {
    return <ThinkingItem item={item} />;
  } else if (item.type === 'cancelled') {
    return <CancelledItem item={item} />;
  } else if (item.type === 'usage_limit') {
    return <UsageLimitItem item={item} />;
  }
  return null;
}

/**
 * Memoized row: item objects keep their identity across re-renders, so a
 * shallow-compare memo means scrolling and streaming updates never re-parse
 * the markdown of unchanged messages.
 */
const MessageRow = memo(function MessageRow({
  item,
  onToolApprove,
  onToolReject,
}: {
  item: MessageListItem;
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
}) {
  return <>{renderItem(item, onToolApprove, onToolReject)}</>;
});

export function MessageList({
  items,
  onToolApprove,
  onToolReject,
}: MessageListProps) {
  const { t } = useLanguage();
  const parentRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const isAutoScrollEnabled = useRef(true);
  const lastItemCount = useRef(items.length);

  // Filter out empty items
  const filteredItems = useMemo(() => items.filter(shouldRenderItem), [items]);

  // Check if user is at bottom
  const checkIfAtBottom = useCallback(() => {
    if (!parentRef.current) return false;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom < SCROLL_THRESHOLD;
  }, []);

  // Scroll to bottom. Uses the bottom anchor element: with
  // content-visibility, scrollHeight is estimate-based for unrendered rows,
  // so scrollTo(scrollHeight) can land mid-list; scrollIntoView forces the
  // browser to render and position the real end of the list.
  const scrollToBottom = useCallback((smooth = false) => {
    bottomAnchorRef.current?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });

    // Re-enable auto-scroll and clear indicators
    isAutoScrollEnabled.current = true;
    setShowScrollButton(false);
    setHasNewMessages(false);
  }, []);

  // Keep re-asserting scroll-to-bottom until layout settles:
  // content-visibility rows near the end get their real size only after
  // the first positioning, and native scroll anchoring then pins the
  // viewport to the top of the last message instead of the true end.
  const settleRafId = useRef<number | null>(null);
  const settleToBottom = useCallback(() => {
    if (settleRafId.current !== null) {
      cancelAnimationFrame(settleRafId.current);
    }

    let framesLeft = 30;
    let stableFrames = 0;
    let lastScrollHeight = -1;

    const settle = () => {
      scrollToBottom(false);

      const scrollHeight = parentRef.current?.scrollHeight ?? 0;
      stableFrames = scrollHeight === lastScrollHeight ? stableFrames + 1 : 0;
      lastScrollHeight = scrollHeight;
      framesLeft--;

      settleRafId.current = stableFrames < 3 && framesLeft > 0
        ? requestAnimationFrame(settle)
        : null;
    };

    settleRafId.current = requestAnimationFrame(settle);
  }, [scrollToBottom]);

  // Cancel any in-flight settling on unmount
  useEffect(() => {
    return () => {
      if (settleRafId.current !== null) {
        cancelAnimationFrame(settleRafId.current);
      }
    };
  }, []);

  // Handle user scroll events
  const handleScroll = useCallback(() => {
    const isAtBottom = checkIfAtBottom();

    // Update auto-scroll state
    isAutoScrollEnabled.current = isAtBottom;

    // Show/hide scroll button
    setShowScrollButton(!isAtBottom);

    // Clear new message indicator if user scrolled to bottom
    if (isAtBottom) {
      setHasNewMessages(false);
    }
  }, [checkIfAtBottom]);

  // Auto-scroll on new items
  useEffect(() => {
    // Detect new items
    const wasEmpty = lastItemCount.current === 0;
    const hasNewItem = filteredItems.length > lastItemCount.current;
    lastItemCount.current = filteredItems.length;

    // If user is not at bottom and there's a new item, show indicator
    if (hasNewItem && !checkIfAtBottom()) {
      setHasNewMessages(true);
    }

    // Auto-scroll if enabled. The first fill (history loaded into an empty
    // list) needs the settling loop; streaming increments only need one shot.
    if (isAutoScrollEnabled.current && hasNewItem) {
      if (wasEmpty) {
        settleToBottom();
      } else {
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      }
    }
  }, [filteredItems.length, checkIfAtBottom, scrollToBottom, settleToBottom]);

  // Scroll to bottom on mount (session opened with already-cached items)
  useEffect(() => {
    if (filteredItems.length > 0) {
      settleToBottom();
    }
  }, []); // Only on mount

  if (filteredItems.length === 0) {
    return (
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div className="message-list" ref={parentRef}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-secondary)',
              gap: '1rem',
            }}
          >
            <div style={{ fontSize: '3rem' }}>💬</div>
            <p>{t.messageList.noMessages}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="message-list"
      ref={parentRef}
      onScroll={handleScroll}
    >
      {filteredItems.map((item) => (
        <div key={item.id} className="message-row">
          <MessageRow item={item} onToolApprove={onToolApprove} onToolReject={onToolReject} />
        </div>
      ))}
      {/* Bottom anchor for precise scroll-to-end */}
      <div ref={bottomAnchorRef} />

      {/* Scroll to bottom button - positioned at bottom of visible area */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom(true)}
          className="scroll-to-bottom-button"
          style={{
            position: 'sticky',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '2rem',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            boxShadow: '0 4px 12px var(--shadow-hover)',
            transition: 'all 0.2s ease',
            zIndex: 10,
            marginTop: '-4rem',
            pointerEvents: 'auto',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.transform = 'translateX(-50%) translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px var(--shadow-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
            e.currentTarget.style.transform = 'translateX(-50%)';
            e.currentTarget.style.boxShadow = '0 4px 12px var(--shadow-hover)';
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>↓</span>
          {hasNewMessages ? t.messageList.newMessages : t.messageList.scrollToBottom}
        </button>
      )}
    </div>
  );
}
