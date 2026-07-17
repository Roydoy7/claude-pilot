/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * StatusItem Component - AI status indicator with SVG animations
 * Two-layer state system: thinking state + tool state can coexist
 */

import { useState, useEffect, memo } from 'react';
import type { MessageListItem } from '../../../preload/preload-types';
import { useLanguage } from '../../i18n/LanguageContext';

interface StatusItemProps {
  item: MessageListItem;
}

/**
 * SVG Thinking Icon - message bubble with animated dots
 */
function ThinkingIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="thinking-icon"
    >
      {/* Message bubble */}
      <path
        d="M20 2H4C2.9 2 2 2.9 2 4V16C2 17.1 2.9 18 4 18H8L12 22L16 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Three dots inside */}
      <circle cx="8" cy="10" r="1.5" fill="currentColor" className="dot-1" />
      <circle cx="12" cy="10" r="1.5" fill="currentColor" className="dot-2" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" className="dot-3" />
    </svg>
  );
}

/**
 * Animated text component - scan left to right, randomly bounce characters
 */
function AnimatedText({ text }: { text: string }) {
  const [bouncingIndices, setBouncingIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    const chars = text.split('');
    const nonSpaceIndices = chars
      .map((char, index) => (char !== ' ' ? index : -1))
      .filter((index) => index !== -1);

    if (nonSpaceIndices.length === 0) return;

    let position = 0;
    const timeouts: NodeJS.Timeout[] = [];

    const interval = setInterval(() => {
      const currentCharIndex = nonSpaceIndices[position];

      // Roll the dice: 50% chance to bounce
      if (Math.random() > 0.5) {
        setBouncingIndices((prev) => new Set(prev).add(currentCharIndex));

        // Clear bounce after animation completes (500ms)
        const timeout = setTimeout(() => {
          setBouncingIndices((prev) => {
            const next = new Set(prev);
            next.delete(currentCharIndex);
            return next;
          });
        }, 500);

        timeouts.push(timeout);
      }

      // Move to next position
      position = (position + 1) % nonSpaceIndices.length;
    }, 200); // Scan every 200ms

    return () => {
      clearInterval(interval);
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [text]);

  return (
    <span>
      {text.split('').map((char, index) => (
        <span
          key={index}
          style={{
            display: 'inline-block',
            animation: bouncingIndices.has(index) ? 'charBounce 0.5s linear' : 'none',
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

/**
 * SVG Gear Icon for executing tool
 */
function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="gear-icon"
    >
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * SVG Clock Icon for waiting approval
 */
function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="clock-icon"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 6V12L16 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * SVG Terminal Icon for slash commands
 */
function TerminalIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="terminal-icon"
    >
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 9L10 12L6 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15H18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * SVG Queue Icon for queued messages
 */
function QueueIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="queue-icon"
    >
      {/* Three stacked horizontal lines representing queue */}
      <path
        d="M4 6H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 12H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 18H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arrow pointing right on top line */}
      <path
        d="M16 3L20 6L16 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const StatusItem = memo(function StatusItem({ item }: StatusItemProps) {
  const { t } = useLanguage();

  // Validate item type
  if (item.type !== 'status' || !item.agentState) {
    return null;
  }

  const state = item.agentState;

  // Check if there's anything to display
  const hasActiveTasks = Boolean(state.activeTasks?.length);
  const hasSubagent = state.subagent !== undefined && !hasActiveTasks;
  const hasTool = state.tool !== undefined;
  const hasCommand = state.command !== undefined && state.command.status === 'running';
  // A running slash command already explains what the agent is doing. Avoid
  // rendering the generic thinking line alongside it (notably for /compact).
  const hasThinking = state.thinking && !hasSubagent && !hasActiveTasks && !hasCommand;
  const hasQueued = state.queued === true;

  if (!hasThinking && !hasTool && !hasCommand && !hasQueued && !hasSubagent && !hasActiveTasks) {
    return null; // Idle state - nothing to display
  }

  // Get command display text from i18n or fallback
  const getCommandText = (commandName: string): string => {
    const commands = t.status.commands;
    if (commands && commandName in commands) {
      return commands[commandName as keyof typeof commands];
    }
    return `Running /${commandName}...`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        marginBottom: '0.5rem',
        fontSize: '0.875rem',
        color: 'var(--text-secondary)',
      }}
    >
      {/* Queued state indicator - shown first (message is waiting in queue) */}
      {hasQueued && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="status-icon-queue">
            <QueueIcon />
          </span>
          <AnimatedText text={t.status.messageQueued || 'Message queued...'} />
        </div>
      )}

      {/* Command state indicator - shown second (highest priority after queue) */}
      {hasCommand && state.command && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="status-icon-terminal">
            <TerminalIcon />
          </span>
          <AnimatedText text={getCommandText(state.command.name)} />
        </div>
      )}

      {/* Tool state indicator - shown second */}
      {hasTool && state.tool && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {state.tool.type === 'executing' ? (
            <>
              <span className="status-icon-gear">
                <GearIcon />
              </span>
              <AnimatedText text={t.status.executingTool(state.tool.toolName || '')} />
            </>
          ) : (
            <>
              <span className="status-icon-clock">
                <ClockIcon />
              </span>
              <AnimatedText text={t.status.waitingForApproval} />
            </>
          )}
        </div>
      )}

      {/* Subagent state indicator - takes over from the generic thinking line while a subagent runs */}
      {hasSubagent && state.subagent && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="status-icon-gear">
            <GearIcon />
          </span>
          <AnimatedText
            text={t.status.subagentRunning(
              state.subagent.name,
              state.subagent.lastToolName,
              state.subagent.elapsedSeconds
            )}
          />
        </div>
      )}

      {/* SDK task lifecycle supports several concurrent background agents. */}
      {state.activeTasks?.map((task) => (
        <div
          key={task.taskId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="status-icon-gear">
            <GearIcon />
          </span>
          <AnimatedText
            text={t.status.subagentRunning(
              task.subagentType || task.description || 'agent',
              task.status === 'paused' ? 'paused' : task.lastToolName,
              task.durationMs === undefined ? undefined : Math.round(task.durationMs / 1000)
            )}
          />
          {task.totalTokens !== undefined && (
            <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              {task.totalTokens.toLocaleString()} tokens
            </span>
          )}
        </div>
      ))}

      {/* API retry banner - the only live signal during a rate-limit retry
          storm; shown whenever the SDK reports a retry, regardless of which
          activity row is visible (it cannot be attributed to one subagent) */}
      {state.apiRetry && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--warning, #d97706)',
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>
            {t.status.apiRetrying(
              state.apiRetry.attempt,
              state.apiRetry.maxRetries,
              Math.round(state.apiRetry.retryDelayMs / 1000),
              state.apiRetry.errorStatus,
            )}
          </span>
        </div>
      )}

      {/* Thinking state indicator - shown last (at bottom) */}
      {hasThinking && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span className="status-icon-thinking">
            <ThinkingIcon />
          </span>
          <AnimatedText
            text={
              state.thinkingTokens
                ? t.status.aiThinkingWithTokens(state.thinkingTokens)
                : t.status.aiThinking
            }
          />
        </div>
      )}

      <style>{`
        .status-icon-thinking {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-primary);
        }

        /* Animated dots inside thinking bubble */
        .status-icon-thinking .dot-1 {
          animation: dotPulse 1.4s 0s ease-in-out infinite;
        }
        .status-icon-thinking .dot-2 {
          animation: dotPulse 1.4s 0.2s ease-in-out infinite;
        }
        .status-icon-thinking .dot-3 {
          animation: dotPulse 1.4s 0.4s ease-in-out infinite;
        }

        .status-icon-gear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          animation: rotate 3s linear infinite;
          color: var(--accent-primary);
        }

        .status-icon-clock {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          animation: tick 1s steps(12) infinite;
          color: var(--warning);
        }

        .status-icon-terminal {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          animation: terminalPulse 1.5s ease-in-out infinite;
          color: var(--success);
        }

        .status-icon-queue {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          animation: queueSlide 1.2s ease-in-out infinite;
          color: var(--text-tertiary);
        }

        /* Terminal pulse animation */
        @keyframes terminalPulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }

        /* Queue slide animation - lines slide right */
        @keyframes queueSlide {
          0%, 100% {
            transform: translateX(0);
            opacity: 0.6;
          }
          50% {
            transform: translateX(2px);
            opacity: 1;
          }
        }

        /* Dot pulse animation for thinking bubble */
        @keyframes dotPulse {
          0%, 60%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          30% {
            opacity: 0.4;
            transform: scale(0.8);
          }
        }

        /* Rotate animation for gear icon */
        @keyframes rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* Tick animation for clock icon */
        @keyframes tick {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* Character bounce animation - elastic rubber band effect */
        @keyframes charBounce {
          0% {
            transform: translateY(0);
            animation-timing-function: cubic-bezier(0.33, 1, 0.68, 1); /* ease-out for going up */
          }
          40% {
            transform: translateY(-10px);
            animation-timing-function: cubic-bezier(0.32, 0, 0.67, 0); /* ease-in for falling down */
          }
          55% {
            transform: translateY(0);
            animation-timing-function: cubic-bezier(0.32, 0, 0.67, 0); /* continue downward momentum */
          }
          70% {
            transform: translateY(2px);
            animation-timing-function: cubic-bezier(0.33, 1, 0.68, 1); /* elastic bounce back up */
          }
          85% {
            transform: translateY(-1.0px);
            animation-timing-function: cubic-bezier(0.32, 0, 0.67, 0); /* small settle */
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
});
