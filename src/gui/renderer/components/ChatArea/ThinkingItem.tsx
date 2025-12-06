/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ThinkingItem Component - Displays extended thinking content
 * Minimal, inline design that doesn't interrupt the conversation flow
 */

import { useState } from 'react';
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

export function ThinkingItem({ item }: ThinkingItemProps) {
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
    <div className="message message-ai" style={{ marginTop: '-0.5rem', marginBottom: '-0.5rem' }}>
      {/* Avatar placeholder to match message layout */}
      <div className="message-avatar">
        <div style={{ width: '2rem', height: '2rem' }} />
      </div>
      <div className="message-content">
        {/* Collapsed: Single line with preview */}
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '0.35rem',
              padding: '0.2rem 0.5rem',
              backgroundColor: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: '0.7rem',
              fontStyle: 'italic',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = 'var(--text-tertiary)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            <SparklesIcon />
            <span style={{ opacity: 0.8 }}>{previewText}</span>
            <span style={{ opacity: 0.5, marginLeft: '0.25rem' }}>▸</span>
          </button>
        ) : (
          /* Expanded: Full content */
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <button
              onClick={() => setExpanded(false)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.6rem',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                fontSize: '0.7rem',
                textAlign: 'left',
              }}
            >
              <SparklesIcon />
              <span style={{ fontWeight: 500 }}>Thinking</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5 }}>▾</span>
            </button>

            {/* Content */}
            <div
              style={{
                padding: '0.5rem 0.75rem',
                paddingTop: '0',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                lineHeight: '1.5',
                fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
                maxHeight: '200px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                opacity: 0.85,
              }}
            >
              {thinkingContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
