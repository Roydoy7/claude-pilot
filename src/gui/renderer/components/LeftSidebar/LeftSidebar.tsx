/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * LeftSidebar Component - Collapsible session list
 */

import { useState, useEffect } from 'react';
import type { Session } from '../../../../core/sessions/session-manager';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAgentDefinitions } from '../../hooks/useAgentDefinitions.js';

const COLLAPSED_KEY = 'leftSidebarCollapsed';

interface LeftSidebarProps {
  currentSessionId?: string;
  onSessionSelect?: (session: Session) => void;
}

export function LeftSidebar({ currentSessionId, onSessionSelect }: LeftSidebarProps) {
  const { t } = useLanguage();
  const agentDefinitions = useAgentDefinitions();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true');

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

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
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

    if (!(await window.electronAPI.dialog.confirm(t.leftSidebar.deleteAllConfirm(sessions.length)))) {
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

    if (!(await window.electronAPI.dialog.confirm(t.leftSidebar.deleteSessionConfirm))) {
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

  /**
   * Days between a timestamp and now, in whole calendar days
   */
  const daysAgo = (timestamp: number) => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    return Math.floor((startOfDay(now) - startOfDay(new Date(timestamp))) / (1000 * 60 * 60 * 24));
  };

  const groupLabel = (timestamp: number) => {
    const days = daysAgo(timestamp);
    if (days <= 0) return t.common.time.today;
    if (days === 1) return t.common.time.yesterday;
    if (days < 7) return t.common.time.thisWeek;
    return t.common.time.earlier;
  };

  if (isCollapsed) {
    return (
      <div className="left-sidebar" data-collapsed="true">
        <button className="icon-button" onClick={toggleCollapsed} title={t.leftSidebar.expand}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
          </svg>
        </button>
        <button className="icon-button" onClick={handleNewSession} title={t.leftSidebar.newSession}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <div className="left-sidebar-collapsed-list">
          {sessions.map((session) => {
            const title = session.title || t.leftSidebar.newSessionFallback;
            return (
              <button
                key={session.id}
                className="left-sidebar-collapsed-item"
                data-active={session.id === currentSessionId}
                title={title}
                onClick={() => onSessionSelect?.(session)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></svg>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="left-sidebar">
      <div className="left-sidebar-header">
        <button className="btn btn-outline btn-lg left-sidebar-new-button" onClick={handleNewSession}>
          {t.leftSidebar.newSession}
        </button>
        <button className="icon-button" onClick={toggleCollapsed} title={t.leftSidebar.collapse}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
          </svg>
        </button>
        <button
          className="icon-button sidebar-delete-all"
          onClick={handleDeleteAll}
          disabled={sessions.length === 0}
          title={sessions.length === 0 ? t.leftSidebar.noSessionsToDelete : t.leftSidebar.deleteAllTooltip(sessions.length)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>

      <div className="left-sidebar-list">
        {isLoading ? (
          <div className="left-sidebar-empty">{t.leftSidebar.loading}</div>
        ) : sessions.length === 0 ? (
          <div className="left-sidebar-empty">{t.leftSidebar.noSessions}</div>
        ) : (
          sessions.map((session, index) => {
            const label = groupLabel(session.updatedAt);
            const showGroupLabel = index === 0 || label !== groupLabel(sessions[index - 1].updatedAt);
            return (
              <div key={session.id}>
                {showGroupLabel && (
                  <div className="left-sidebar-group-label">{label}</div>
                )}
                <div
                  className="left-sidebar-item"
                  data-active={session.id === currentSessionId}
                  onClick={() => onSessionSelect?.(session)}
                >
                  <div className="left-sidebar-item-title">
                    {session.title || t.leftSidebar.newSessionFallback}
                  </div>
                  <button
                    className="left-sidebar-item-delete"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                  <div className="left-sidebar-item-meta">
                    {agentDefinitions.find((agent) => agent.id === session.agentId)?.displayName ?? session.agentId}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
