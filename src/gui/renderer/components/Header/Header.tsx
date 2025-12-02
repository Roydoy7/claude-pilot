/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Header Component - Top navigation bar
 */

import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useLanguage } from '../../i18n/LanguageContext';
import type { Session } from '../../../../core/sessions/session-manager';

interface HeaderProps {
  onTogglePanel?: () => void;
  isPanelVisible?: boolean;
  currentSession?: Session | null;
}

export function Header({ onTogglePanel, isPanelVisible = true, currentSession }: HeaderProps) {
  const { t } = useLanguage();

  // Format role display name
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'office-assistant':
        return t.header.roles.officeAssistant;
      case 'translator':
        return t.header.roles.translator;
      default:
        return role;
    }
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
        <span className="header-logo-icon">🤖</span>
        <span>Claude Pilot</span>
      </div>

      {currentSession && (
        <div className="header-session-info">
          <span className="session-role" title={`Role: ${getRoleDisplayName(currentSession.role)}`}>
            {getRoleDisplayName(currentSession.role)}
          </span>
          <span className="session-separator">•</span>
          <span className="session-provider" title="Provider: Anthropic Claude">
            {t.header.providers.anthropic}
          </span>
          <span className="session-separator">•</span>
          <span className="session-model" title={`Model: ${currentSession.modelName}`}>
            {getModelDisplayName(currentSession.modelName)}
          </span>
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
