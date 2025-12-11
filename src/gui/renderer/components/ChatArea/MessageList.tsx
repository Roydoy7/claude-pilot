/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MessageList Component - Virtualized scrollable list of messages and tool calls
 * Uses @tanstack/react-virtual for efficient rendering of long message lists
 */

import type React from 'react';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
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
const DEFAULT_ITEM_HEIGHT = 100; // Estimated height for items before measurement

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

export function MessageList({
  items,
  onToolApprove,
  onToolReject,
}: MessageListProps) {
  const { t } = useLanguage();
  const parentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const isAutoScrollEnabled = useRef(true);
  const lastItemCount = useRef(items.length);

  // Filter out empty items before virtualization
  const filteredItems = useMemo(() => items.filter(shouldRenderItem), [items]);

  // TanStack Virtual virtualizer with dynamic measurement
  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => DEFAULT_ITEM_HEIGHT,
    overscan: 5,
    // Use item ID as key for stable measurements
    getItemKey: (index: number) => filteredItems[index]?.id ?? index,
  });

  // Check if user is at bottom
  const checkIfAtBottom = useCallback(() => {
    if (!parentRef.current) return false;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom < SCROLL_THRESHOLD;
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((_smooth = false) => {
    if (!parentRef.current || filteredItems.length === 0) return;

    // Use virtualizer's scrollToIndex for accurate scrolling
    virtualizer.scrollToIndex(filteredItems.length - 1, {
      align: 'end',
      behavior: 'auto',
    });

    // Re-enable auto-scroll and clear indicators
    isAutoScrollEnabled.current = true;
    setShowScrollButton(false);
    setHasNewMessages(false);
  }, [filteredItems.length, virtualizer]);

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
    const hasNewItem = filteredItems.length > lastItemCount.current;
    lastItemCount.current = filteredItems.length;

    // If user is not at bottom and there's a new item, show indicator
    if (hasNewItem && !checkIfAtBottom()) {
      setHasNewMessages(true);
    }

    // Auto-scroll if enabled
    if (isAutoScrollEnabled.current && hasNewItem) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [filteredItems.length, checkIfAtBottom, scrollToBottom]);

  // Scroll to bottom on mount
  useEffect(() => {
    if (filteredItems.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
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

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="message-list"
      ref={parentRef}
      onScroll={handleScroll}
    >
      {/* Virtual list container - position:relative here so absolute children respect padding */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {/* Render only visible items */}
        {virtualItems.map((virtualItem: VirtualItem) => {
          const item = filteredItems[virtualItem.index];
          return (
            <div
              key={item.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                boxSizing: 'border-box',
                paddingBottom: '1rem',
              }}
            >
              {renderItem(item, onToolApprove, onToolReject)}
            </div>
          );
        })}
      </div>

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
