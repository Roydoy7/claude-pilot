/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * TaskNotificationItem - Displays a compact card for a <task-notification>
 * injected when a background subagent (Agent tool) finishes.
 */

import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageListItem } from '../../../preload/preload-types';
import { useLanguage } from '../../i18n/LanguageContext';

interface TaskNotificationItemProps {
  item: MessageListItem;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function TaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2v4" />
      <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function statusColor(status: string): string {
  if (status === 'completed') return 'var(--success)';
  if (status === 'failed') return 'var(--error, #e5484d)';
  return 'var(--warning)';
}

export const TaskNotificationItem = memo(function TaskNotificationItem({ item }: TaskNotificationItemProps) {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  if (item.type !== 'task_notification' || !item.taskNotification) {
    return null;
  }

  const notification = item.taskNotification;
  const hasDetails = !!(notification.result || notification.usage || notification.outputFile);
  const badgeColor = statusColor(notification.status);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 'var(--chat-item-max-width)',
        margin: '0.75rem 0',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${badgeColor}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: hasDetails ? 'pointer' : 'default',
        }}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--accent)' }} aria-hidden="true">
          <TaskIcon />
        </span>

        <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>
          {notification.summary}
        </span>

        <span
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            fontSize: '0.6875rem',
            fontWeight: 600,
            padding: '0.1rem 0.5rem',
            borderRadius: '999px',
            color: badgeColor,
            backgroundColor: 'color-mix(in srgb, ' + badgeColor + ' 15%, transparent)',
            textTransform: 'uppercase',
          }}
        >
          {notification.status}
        </span>

        {hasDetails && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </div>

      {isExpanded && hasDetails && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
          {notification.result && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{notification.result}</ReactMarkdown>
            </div>
          )}

          {notification.usage && (
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
              }}
            >
              {notification.usage.subagentTokens !== undefined && (
                <span>{notification.usage.subagentTokens.toLocaleString()} {t.taskNotification?.tokens || 'tokens'}</span>
              )}
              {notification.usage.toolUses !== undefined && (
                <span>{notification.usage.toolUses} {t.taskNotification?.toolUses || 'tool uses'}</span>
              )}
              {notification.usage.durationMs !== undefined && (
                <span>{formatDuration(notification.usage.durationMs)} {t.taskNotification?.duration || 'duration'}</span>
              )}
            </div>
          )}

          {notification.outputFile && (
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--text-tertiary)',
                overflowWrap: 'anywhere',
              }}
            >
              {t.taskNotification?.outputFile || 'Output file'}: {notification.outputFile}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
