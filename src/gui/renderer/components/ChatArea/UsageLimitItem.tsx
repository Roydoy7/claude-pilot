/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * UsageLimitItem Component - Displays usage limit reached status
 * Shows when API rate/usage limits are hit
 */

import { memo } from 'react';
import type { MessageListItem } from '../../../preload/preload-types';
import { useLanguage } from '../../i18n/LanguageContext';

interface UsageLimitItemProps {
  item: MessageListItem;
}

/**
 * Warning/Limit icon - exclamation in triangle
 */
function LimitIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="17"
        x2="12.01"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const UsageLimitItem = memo(function UsageLimitItem({ item }: UsageLimitItemProps) {
  const { t } = useLanguage();

  // Validate item type
  if (item.type !== 'usage_limit') {
    return null;
  }

  return (
    <div className="message message-ai">
      <div className="message-content">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            padding: '0.4rem 0.75rem',
            maxWidth: '100%',
            boxSizing: 'border-box',
            backgroundColor: 'var(--warning-subtle)',
            border: '1px solid var(--warning)',
            borderRadius: '6px',
            color: 'var(--warning)',
            fontSize: '0.75rem',
          }}
        >
          <span style={{ display: 'flex', flexShrink: 0, marginTop: '0.1em' }} aria-hidden="true">
            <LimitIcon />
          </span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.4 }}>
            {item.usageLimitMessage || t.messageList.usageLimitReached}
          </span>
        </div>
      </div>
    </div>
  );
});
