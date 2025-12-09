/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SessionsTab Component - Session management
 */

import { useState, useEffect } from 'react';
import type { Session } from '../../../../core/sessions/session-manager';
import { useLanguage } from '../../i18n/LanguageContext';
import { getRoleDisplayName, RoleType } from '../../../../core/roles/role-enum.js';

interface SessionsTabProps {
  currentSessionId?: string;
  onSessionSelect?: (session: Session) => void;
}

export function SessionsTab({ currentSessionId, onSessionSelect }: SessionsTabProps) {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load sessions on mount and when currentSessionId changes (to pick up new sessions)
  useEffect(() => {
    loadSessions();
  }, [currentSessionId]);

  const loadSessions = async () => {
    try {
      const sessions = await window.electronAPI.session.list();
      setSessions(sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSession = () => {
    // Clear current session to show Configure Session UI
    // Pass null to trigger the config screen
    if (onSessionSelect) {
      onSessionSelect(null as unknown as Session);
    }
  };

  const handleDeleteAll = async () => {
    if (sessions.length === 0) {
      return;
    }

    if (!confirm(t.rightPanel.sessionsTab.deleteAllConfirm(sessions.length))) {
      return;
    }

    try {
      // Delete all sessions one by one
      for (const session of sessions) {
        await window.electronAPI.session.delete(session.id);
      }

      // Clear all sessions from local state
      setSessions([]);

      // Clear current session (show new session config)
      onSessionSelect?.(null as unknown as Session);
    } catch (error) {
      console.error('Failed to delete all sessions:', error);
      // Reload sessions on error to sync with backend
      await loadSessions();
    }
  };

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!confirm(t.rightPanel.sessionsTab.deleteSessionConfirm)) {
      return;
    }

    try {
      const result = await window.electronAPI.session.delete(sessionId);
      if (result.success) {
        // Remove from local state immediately
        const remainingSessions = sessions.filter((s) => s.id !== result.sessionId);
        setSessions(remainingSessions);

        // If the deleted session was the current one, switch to another session or clear
        if (sessionId === currentSessionId) {
          if (remainingSessions.length > 0) {
            // Switch to the first remaining session
            onSessionSelect?.(remainingSessions[0]);
          } else {
            // No sessions left, clear current session (show new session config)
            onSessionSelect?.(null as unknown as Session);
          }
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      // Reload sessions on error to sync with backend
      await loadSessions();
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return t.common.time.today;
    } else if (days === 1) {
      return t.common.time.yesterday;
    } else if (days < 7) {
      return t.common.time.daysAgo(days);
    } else {
      return date.toLocaleDateString();
    }
  };

  if (isLoading) {
    return (
      <div className="sessions-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {t.rightPanel.sessionsTab.loading}
        </div>
      </div>
    );
  }

  return (
    <div className="sessions-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      {/* Fixed header with buttons */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: '0.5rem',
        flexShrink: 0,
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <button
          onClick={handleNewSession}
          style={{
            flex: 1,
            padding: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            backgroundColor: 'var(--accent)',
            color: '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {t.rightPanel.sessionsTab.newSession}
        </button>
        <button
          onClick={handleDeleteAll}
          disabled={sessions.length === 0}
          style={{
            width: '2.75rem',
            height: '2.75rem',
            minWidth: '2.75rem',
            padding: '0',
            border: '1px solid var(--error)',
            borderRadius: '6px',
            backgroundColor: sessions.length === 0 ? 'var(--bg-secondary)' : 'transparent',
            cursor: sessions.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: sessions.length === 0 ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            if (sessions.length > 0) {
              e.currentTarget.style.backgroundColor = 'var(--error)';
              const svg = e.currentTarget.querySelector('svg');
              if (svg) svg.style.stroke = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            if (sessions.length > 0) {
              e.currentTarget.style.backgroundColor = 'transparent';
              const svg = e.currentTarget.querySelector('svg');
              if (svg) svg.style.stroke = 'var(--error)';
            }
          }}
          title={sessions.length === 0 ? t.rightPanel.sessionsTab.noSessionsToDelete : t.rightPanel.sessionsTab.deleteAllTooltip(sessions.length)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={sessions.length === 0 ? 'var(--text-tertiary)' : 'var(--error)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>

      {/* Scrollable sessions list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sessions.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {t.rightPanel.sessionsTab.noSessions}
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSessionSelect?.(session)}
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                backgroundColor: session.id === currentSessionId ? 'var(--bg-secondary)' : 'transparent',
                borderLeft: session.id === currentSessionId ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (session.id !== currentSessionId) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (session.id !== currentSessionId) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', flex: 1, marginRight: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.title || 'New Session'}
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    minWidth: '1.5rem',
                    padding: '0',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--error)';
                    e.currentTarget.style.backgroundColor = 'var(--error)';
                    const svg = e.currentTarget.querySelector('svg');
                    if (svg) svg.style.stroke = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                    const svg = e.currentTarget.querySelector('svg');
                    if (svg) svg.style.stroke = 'var(--text-secondary)';
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-secondary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                {getRoleDisplayName(session.role as RoleType)} · {session.modelName}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                {formatDate(session.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
