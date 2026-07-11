/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Header Component - Top navigation bar
 */

import { useState, useEffect } from 'react';
import { SettingsDialog } from './SettingsDialog';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAgentDefinitions } from '../../hooks/useAgentDefinitions.js';
import type { Session } from '../../../../core/sessions/session-manager';

interface HeaderProps {
  onTogglePanel?: () => void;
  isPanelVisible?: boolean;
  currentSession?: Session | null;
  isAuthenticated?: boolean;
  onSettingsOpen?: () => void;
  onSettingsClose?: () => void;
  onAuthChange?: (authenticated: boolean) => void;
  showSettingsOnMount?: boolean;
}

export function Header({
  onTogglePanel,
  isPanelVisible = true,
  currentSession,
  isAuthenticated = true,
  onSettingsOpen,
  onSettingsClose,
  onAuthChange,
  showSettingsOnMount = false,
}: HeaderProps) {
  const { t } = useLanguage();
  const agentDefinitions = useAgentDefinitions();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Auto-open settings on mount if requested
  useEffect(() => {
    if (showSettingsOnMount) {
      setIsSettingsOpen(true);
    }
  }, [showSettingsOnMount]);

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
    onSettingsOpen?.();
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    onSettingsClose?.();
  };

  const handleAuthChange = (authenticated: boolean) => {
    onAuthChange?.(authenticated);
  };

  // Get short directory name from full path
  const getShortDirName = (fullPath: string) => {
    if (!fullPath) return '';
    // Handle both Windows and Unix paths
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1] || parts[parts.length - 2] || fullPath;
  };

  // Get the display name for an agent id from the loaded agent definitions
  const getAgentDisplayName = (agentId: string) => {
    return agentDefinitions.find((agent) => agent.id === agentId)?.displayName ?? agentId;
  };

  // Format model display name
  const getModelDisplayName = (modelName: string) => {
    // Simplify model name for display
    if (modelName.includes('gpt')) {
      return modelName.replace('gpt-', 'GPT-');
    }
    if (modelName.includes('claude')) {
      return modelName.replace('claude-', 'Claude ');
    }
    if (modelName.includes('gemini')) {
      return modelName.replace('gemini-', 'Gemini ');
    }
    return modelName;
  };

  return (
    <header className="header">
      <div className="header-logo">
        <span className="header-logo-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <path d="M12 2v4" />
            <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span>Claude Pilot</span>
      </div>

      {currentSession && (
        <div className="header-session-info">
          <span className="session-role" title={`${t.header.sessionInfo.role}: ${getAgentDisplayName(currentSession.agentId)}`}>
            <span className="session-label">{t.header.sessionInfo.role}</span>
            {getAgentDisplayName(currentSession.agentId)}
          </span>
          <span className="session-separator">•</span>
          <span className="session-model" title={`${t.header.sessionInfo.model}: ${currentSession.modelName}`}>
            <span className="session-label">{t.header.sessionInfo.model}</span>
            {getModelDisplayName(currentSession.modelName)}
          </span>
          {currentSession.cwd && (
            <>
              <span className="session-separator">•</span>
              <span className="session-cwd" title={currentSession.cwd}>
                <span className="session-label">{t.header.sessionInfo.workspace}</span>
                {getShortDirName(currentSession.cwd)}
              </span>
            </>
          )}
        </div>
      )}

      <div className="header-spacer" />

      <div className="header-actions">
        {/* Auth warning icon - shown when not authenticated */}
        {!isAuthenticated && (
          <button
            className="icon-button"
            onClick={handleOpenSettings}
            title="Authentication required"
            style={{
              color: 'var(--warning)',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </button>
        )}

        {/* Settings button */}
        <button
          className="icon-button"
          onClick={handleOpenSettings}
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

        {/* Panel toggle button */}
        <button
          className="icon-button"
          onClick={onTogglePanel}
          title={isPanelVisible ? t.header.hideRightPanel : t.header.showRightPanel}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
        </button>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        showWelcomeMessage={!isAuthenticated}
        onAuthChange={handleAuthChange}
      />
    </header>
  );
}
