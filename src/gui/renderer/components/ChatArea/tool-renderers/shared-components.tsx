/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Shared Components for Tool Renderers
 * Contains common UI components used across tool renderers
 */

import { useState, useEffect } from 'react';
import type { ToolProgressEntry } from '../../../../preload/preload-types';

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
              entry.type === 'stderr' || entry.type === 'error' ? '#f59e0b' :
              entry.type === 'end' ? '#10b981' :
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
