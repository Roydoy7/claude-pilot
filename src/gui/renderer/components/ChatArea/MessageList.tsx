/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MessageList Component - Displays scrollable list of messages and tool calls
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Message } from './Message';
import { ToolCallItem } from './ToolCallItem';
import { StatusItem } from './StatusItem';
import { useLanguage } from '../../i18n/LanguageContext';
import type { MessageListItem } from '../../../preload/preload-types';

interface MessageListProps {
  items: MessageListItem[];
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
}

const SCROLL_THRESHOLD = 150; // Distance from bottom to consider "at bottom"
const SMOOTH_SCROLL_THRESHOLD = 300; // Use smooth scroll if less than this distance

export function MessageList({
  items,
  onToolApprove,
  onToolReject,
}: MessageListProps) {
  const { t } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const isAutoScrollEnabled = useRef(true);
  const lastItemCount = useRef(items.length);

  // Check if user is at bottom
  const checkIfAtBottom = useCallback(() => {
    if (!listRef.current) return false;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom < SCROLL_THRESHOLD;
  }, []);

  // Scroll to bottom with smart behavior
  const scrollToBottom = useCallback((smooth = false) => {
    if (!listRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Use smooth scroll only for short distances or when explicitly requested
    const shouldSmooth = smooth || distanceFromBottom < SMOOTH_SCROLL_THRESHOLD;

    listRef.current.scrollTo({
      top: scrollHeight,
      behavior: shouldSmooth ? 'smooth' : 'auto',
    });

    // Re-enable auto-scroll and clear indicators
    isAutoScrollEnabled.current = true;
    setShowScrollButton(false);
    setHasNewMessages(false);
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
    const hasNewItem = items.length > lastItemCount.current;
    lastItemCount.current = items.length;

    // If user is not at bottom and there's a new item, show indicator
    if (hasNewItem && !checkIfAtBottom()) {
      setHasNewMessages(true);
    }

    // Auto-scroll if enabled
    if (isAutoScrollEnabled.current) {
      scrollToBottom(false); // Use instant scroll during streaming
    }
  }, [items, checkIfAtBottom, scrollToBottom]);

  // Scroll to bottom on mount
  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  if (items.length === 0) {
    return (
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div className="message-list" ref={listRef}>
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
    <div className="message-list" ref={listRef} onScroll={handleScroll} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map((item) => {
          if (item.type === 'message') {
            // Skip empty assistant messages (often appear before tool calls)
            if (item.role === 'assistant' && (!item.content || (typeof item.content === 'string' && item.content.trim() === ''))) {
              return null;
            }

            return (
              <Message
                key={item.id}
                message={{
                  id: item.id,
                  role: item.role!,
                  content: item.content!,
                  usage: item.usage,
                }}
              />
            );
          } else if (item.type === 'tool_call') {
            return (
              <ToolCallItem
                key={item.id}
                item={item}
                onApprove={onToolApprove}
                onReject={onToolReject}
              />
            );
          } else if (item.type === 'status') {
            return (
              <StatusItem
                key={item.id}
                item={item}
              />
            );
          }
          return null;
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
