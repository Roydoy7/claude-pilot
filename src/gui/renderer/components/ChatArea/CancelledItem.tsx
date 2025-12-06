/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * CancelledItem Component - Displays cancelled request status
 * Minimal, inline design similar to ThinkingItem
 */

import type { MessageListItem } from '../../../preload/preload-types';

interface CancelledItemProps {
  item: MessageListItem;
}

/**
 * Stop/Cancel icon - square stop symbol
 */
function StopIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CancelledItem({ item }: CancelledItemProps) {
  // Validate item type
  if (item.type !== 'cancelled') {
    return null;
  }

  return (
    <div className="message message-ai" style={{ marginTop: '-0.5rem', marginBottom: '-0.5rem' }}>
      {/* Avatar placeholder to match message layout */}
      <div className="message-avatar">
        <div style={{ width: '2rem', height: '2rem' }} />
      </div>
      <div className="message-content">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.2rem 0.5rem',
            backgroundColor: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: '4px',
            color: 'var(--text-tertiary)',
            fontSize: '0.7rem',
            fontStyle: 'italic',
          }}
        >
          <StopIcon />
          <span style={{ opacity: 0.8 }}>Request cancelled</span>
        </div>
      </div>
    </div>
  );
}
