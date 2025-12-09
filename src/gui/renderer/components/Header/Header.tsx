/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Header Component - Top navigation bar
 */

import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useLanguage } from '../../i18n/LanguageContext';
import type { Session } from '../../../../core/sessions/session-manager';
import { getRoleDisplayName, RoleType } from '../../../../core/roles/role-enum.js';

interface HeaderProps {
  onTogglePanel?: () => void;
  isPanelVisible?: boolean;
  currentSession?: Session | null;
}

export function Header({ onTogglePanel, isPanelVisible = true, currentSession }: HeaderProps) {
  const { t } = useLanguage();

  // Get short directory name from full path
  const getShortDirName = (fullPath: string) => {
    if (!fullPath) return '';
    // Handle both Windows and Unix paths
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1] || parts[parts.length - 2] || fullPath;
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
          <span className="session-role" title={`${t.header.sessionInfo.role}: ${getRoleDisplayName(currentSession.role as RoleType)}`}>
            <span className="session-label">{t.header.sessionInfo.role}</span>
            {getRoleDisplayName(currentSession.role as RoleType)}
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
        <ThemeToggle />
        <LanguageToggle />
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
    </header>
  );
}
