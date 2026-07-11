/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ThinkingItem Component - Displays extended thinking content
 * Minimal, inline design that doesn't interrupt the conversation flow
 */

import { useState, memo } from 'react';
import type { MessageListItem } from '../../../preload/preload-types';

interface ThinkingItemProps {
  item: MessageListItem;
}

/**
 * Sparkles icon - subtle thinking indicator
 */
function SparklesIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 15L19.5 17L21.5 17.5L19.5 18L19 20L18.5 18L16.5 17.5L18.5 17L19 15Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

export const ThinkingItem = memo(function ThinkingItem({ item }: ThinkingItemProps) {
  const [expanded, setExpanded] = useState(false);

  // Validate item type
  if (item.type !== 'thinking' || !item.thinking) {
    return null;
  }

  const thinkingContent = item.thinking;
  // Get first line or first 80 chars for preview
  const firstLine = thinkingContent.split('\n')[0];
  const previewText = firstLine.length > 80
    ? firstLine.slice(0, 80) + '...'
    : firstLine;

  return (
    <div className="message message-ai thinking-item" data-expanded={expanded}>
      <div className="message-content">
        {/* Collapsed: Single line with preview */}
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="thinking-summary"
          >
            <SparklesIcon />
            <span className="thinking-preview">{previewText}</span>
            <svg className="thinking-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        ) : (
          /* Expanded: Full content */
          <div className="thinking-details">
            {/* Header */}
            <button
              onClick={() => setExpanded(false)}
              className="thinking-details-header"
            >
              <SparklesIcon />
              <span>{previewText}</span>
              <svg className="thinking-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
            </button>

            {/* Content */}
            <div className="thinking-content">
              {thinkingContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
