/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Shared Components for Tool Renderers
 * Contains common UI components used across tool renderers
 */

import { useState, useEffect, useRef } from 'react';
import type { ToolProgressEntry, SubagentActivityEntry } from '../../../../preload/preload-types';

// ============================================
// Approval Waiting Icon
// ============================================

/**
 * Approval waiting icon - clock indicating waiting for user action
 */
export function ApprovalWaitingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="approval-waiting-icon"
    >
      {/* Clock icon */}
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

// ============================================
// Animated Approval Text
// ============================================

/**
 * Animated text component for approval - bouncing characters like AI thinking
 */
export function AnimatedApprovalText({ text }: { text: string }) {
  const [bouncingIndices, setBouncingIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    const chars = text.split('');
    const nonSpaceIndices = chars
      .map((char, index) => (char !== ' ' ? index : -1))
      .filter((index) => index !== -1);

    if (nonSpaceIndices.length === 0) return;

    let position = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const interval = setInterval(() => {
      const currentCharIndex = nonSpaceIndices[position];

      // 50% chance to bounce
      if (Math.random() > 0.5) {
        setBouncingIndices((prev) => new Set(prev).add(currentCharIndex));

        const timeout = setTimeout(() => {
          setBouncingIndices((prev) => {
            const next = new Set(prev);
            next.delete(currentCharIndex);
            return next;
          });
        }, 500);

        timeouts.push(timeout);
      }

      position = (position + 1) % nonSpaceIndices.length;
    }, 200);

    return () => {
      clearInterval(interval);
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [text]);

  return (
    <span className="tool-approval-text">
      {text.split('').map((char, index) => (
        <span
          key={index}
          className={`char ${bouncingIndices.has(index) ? 'bounce' : ''}`}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

// ============================================
// Copy Button
// ============================================

interface CopyButtonProps {
  text: string;
  variant?: 'default' | 'message-action';
  copyLabel?: string;
  copiedLabel?: string;
}

/** Small button that copies the given text to the clipboard. */
export function CopyButton({
  text,
  variant = 'default',
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={variant === 'message-action' ? 'message-copy' : 'copy-button'}
      data-copied={copied}
      title={copied ? copiedLabel : copyLabel}
      aria-label={copied ? copiedLabel : copyLabel}
      type="button"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {variant === 'default' && <span>{copied ? copiedLabel : copyLabel}</span>}
    </button>
  );
}

// ============================================
// Subagent Activity Log Component
// ============================================

interface SubagentActivityLogProps {
  activity: SubagentActivityEntry[];
  isRunning: boolean;
  startedAt: number;
  completedAt?: number;
  heartbeat?: {
    lastToolName?: string;
    totalTokens?: number;
    elapsedSeconds?: number;
    timestamp: number;
  };
}

function formatTokenCount(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
}

/**
 * Nested activity timeline for a running Agent/Task tool call - shows the
 * subagent's full tool call / text / thinking history in a scrollable log,
 * so users can see everything that happened (and debug) rather than only a
 * truncated "most recent" slice. Defaults to expanded and auto-scrolls to
 * the newest entry while the subagent is running; the user can still
 * collapse it manually and scroll back through history at any time.
 */
export function SubagentActivityLog({ activity, isRunning, startedAt, completedAt, heartbeat }: SubagentActivityLogProps) {
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning && expanded && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activity, isRunning, expanded]);

  if (!activity || activity.length === 0) return null;

  const lastEntry = activity[activity.length - 1];
  const endedAt = completedAt ?? lastEntry.completedAt ?? lastEntry.timestamp;
  const elapsedSeconds = Math.max(0, Math.floor(((isRunning ? now : endedAt) - startedAt) / 1000));
  const elapsed = elapsedSeconds >= 60
    ? `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
    : `${elapsedSeconds}s`;

  return (
    <div className="subagent-activity">
      <button
        onClick={() => setExpanded(!expanded)}
        className="subagent-activity-header"
      >
        <span className={`subagent-activity-chevron${expanded ? ' expanded' : ''}`}>›</span>
        <span className={`subagent-live-dot${isRunning ? ' running' : ''}`} />
        <span className="subagent-activity-title">Subagent Activity</span>
        <span className={`subagent-activity-state${isRunning ? ' running' : ' completed'}`}>
          {isRunning ? 'LIVE' : 'DONE'}
        </span>
        <span className="subagent-activity-meta">{activity.length} events · {elapsed}</span>
      </button>
      {expanded && (
        <div
          ref={logRef}
          className="subagent-activity-log"
        >
          {activity.map((entry) => {
            const icon = entry.kind === 'tool' ? '⚙' : entry.kind === 'thinking' ? '◆' : entry.kind === 'skill' ? '◈' : '›';
            const kindLabel = entry.kind === 'tool' ? 'TOOL' : entry.kind === 'thinking' ? 'THOUGHT' : entry.kind === 'skill' ? 'SKILLS' : 'MESSAGE';
            const label = entry.kind === 'tool'
              ? `${entry.toolName}${entry.toolArgsSummary ? `: ${entry.toolArgsSummary}` : ''}`
              : (entry.text || '');
            const time = new Date(entry.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div key={entry.id} className={`subagent-activity-entry ${entry.kind}${entry.isError ? ' error' : ''}`}>
                <div className="subagent-activity-rail">
                  <span className="subagent-activity-icon">{icon}</span>
                </div>
                <div className="subagent-activity-body">
                  <div className="subagent-activity-entry-meta">
                    <span>{kindLabel}</span>
                    <span>{time}</span>
                    {entry.kind === 'tool' && (
                      <span className={`subagent-tool-state${entry.isError ? ' error' : entry.completedAt ? ' completed' : ' running'}`}>
                        {entry.isError ? 'FAILED' : entry.completedAt ? 'DONE' : 'RUNNING'}
                      </span>
                    )}
                  </div>
                  <div className="subagent-activity-content">{label}</div>
                </div>
              </div>
            );
          })}
          {isRunning && (
            // The CLI does not stream subagent content - complete blocks can be
            // minutes apart during long generations. This trailing row (fed by
            // task_progress/tool_progress heartbeats plus a local clock) keeps
            // the log visibly alive between blocks.
            <div className="subagent-activity-entry working">
              <div className="subagent-activity-rail">
                <span className="subagent-activity-icon working">⚙</span>
              </div>
              <div className="subagent-activity-body">
                <div className="subagent-activity-entry-meta">
                  <span>WORKING</span>
                  <span>{elapsed}</span>
                </div>
                <div className="subagent-activity-content subagent-working-content">
                  {[
                    'Generating…',
                    heartbeat?.lastToolName ? `last tool: ${heartbeat.lastToolName}` : undefined,
                    heartbeat?.totalTokens !== undefined ? `${formatTokenCount(heartbeat.totalTokens)} tokens` : undefined,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Progress Log Component
// ============================================

interface ProgressLogProps {
  progress: ToolProgressEntry[];
  hasResponse: boolean;
  showProgress: boolean;
  setShowProgress: (show: boolean) => void;
}

/**
 * Progress log display component for tool execution
 */
export function ProgressLog({ progress, hasResponse, showProgress, setShowProgress }: ProgressLogProps) {
  if (!progress || progress.length === 0) return null;

  return (
    <div style={{ marginLeft: '1.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
      {/* Show toggle button only after execution completes */}
      {hasResponse && (
        <button
          onClick={() => setShowProgress(!showProgress)}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.25rem 0',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <span style={{ transform: showProgress ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
          <span>Execution Log ({progress.length} entries)</span>
        </button>
      )}
      {/* Show progress: always during execution (!response), or when toggled on after completion */}
      {(!hasResponse || showProgress) && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            fontSize: '0.7rem',
            fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
            maxHeight: '150px',
            overflow: 'auto',
            marginTop: hasResponse ? '0.25rem' : 0,
          }}
        >
          {!hasResponse && (
            <div style={{ marginBottom: '0.25rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              ⏳ Execution Progress:
            </div>
          )}
          {progress.slice(-10).map((entry: ToolProgressEntry, idx: number) => {
            const typeIcon =
              entry.type === 'stdout' ? '📤' :
              entry.type === 'stderr' ? '⚠️' :
              entry.type === 'start' ? '▶️' :
              entry.type === 'end' ? '✅' :
              entry.type === 'error' ? '❌' : '•';
            const typeColor =
              entry.type === 'stderr' || entry.type === 'error' ? 'var(--warning)' :
              entry.type === 'end' ? 'var(--success)' :
              'var(--text-secondary)';

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.125rem',
                  color: typeColor,
                }}
              >
                <span>{typeIcon}</span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {entry.message}
                </span>
              </div>
            );
          })}
          {progress.length > 10 && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
              ... and {progress.length - 10} more entries
            </div>
          )}
        </div>
      )}
    </div>
  );
}
