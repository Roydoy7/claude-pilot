/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * RightPanel Component - Tabbed panel with Workspace and Prompts tabs
 */

import { useState, useEffect } from 'react';
import { SessionsTab } from './SessionsTab';
import { WorkspaceTab } from './WorkspaceTab';
import { PromptsTab } from './PromptsTab';
import { SkillsTab } from './SkillsTab';
import { useLanguage } from '../../i18n/LanguageContext';
import type { Session } from '../../../../core/sessions/session-manager';

type TabType = 'sessions' | 'workspace' | 'prompts' | 'skills';

interface RightPanelProps {
  sessionId?: string;
  onClose?: () => void;
  onSessionSelect?: (session: Session) => void;
  onApplyTemplate?: (content: string) => void;
  width?: number;
}

export function RightPanel({ sessionId, onClose, onSessionSelect, onApplyTemplate, width }: RightPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('sessions');

  // Expose switchToWorkspace method globally
  useEffect(() => {
    window.__rightPanelSwitchToWorkspace = () => {
      setActiveTab('workspace');
    };
    return () => {
      delete window.__rightPanelSwitchToWorkspace;
    };
  }, []);

  return (
    <div className="right-panel" style={width ? { width: `${width}px` } : undefined}>
      {/* Tab Bar */}
      <div className="tab-bar">
        <button
          className="tab-button"
          data-active={activeTab === 'sessions'}
          onClick={() => setActiveTab('sessions')}
          title={t.rightPanel.sessions}
        >
          <span>💬</span>
          <span>{t.rightPanel.sessions}</span>
        </button>
        <button
          className="tab-button"
          data-active={activeTab === 'workspace'}
          onClick={() => setActiveTab('workspace')}
          title={t.rightPanel.workspace}
        >
          <span>📁</span>
          <span>{t.rightPanel.workspace}</span>
        </button>
        <button
          className="tab-button"
          data-active={activeTab === 'prompts'}
          onClick={() => setActiveTab('prompts')}
          title={t.rightPanel.prompts}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>{t.rightPanel.prompts}</span>
        </button>
        <button
          className="tab-button"
          data-active={activeTab === 'skills'}
          onClick={() => setActiveTab('skills')}
          title={t.rightPanel.skills}
        >
          <span>🧩</span>
          <span>{t.rightPanel.skills}</span>
        </button>
        <button
          className="tab-button close-button"
          onClick={onClose}
          title={t.rightPanel.closePanel}
        >
          <span>❌</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        <div style={{ display: activeTab === 'sessions' ? 'block' : 'none' }}>
          <SessionsTab currentSessionId={sessionId} onSessionSelect={onSessionSelect} />
        </div>
        <div style={{ display: activeTab === 'workspace' ? 'block' : 'none' }}>
          <WorkspaceTab sessionId={sessionId} />
        </div>
        <div style={{ display: activeTab === 'prompts' ? 'block' : 'none' }}>
          <PromptsTab onApplyTemplate={onApplyTemplate || (() => {})} />
        </div>
        <div style={{ display: activeTab === 'skills' ? 'block' : 'none' }}>
          <SkillsTab sessionId={sessionId ?? null} />
        </div>
      </div>
    </div>
  );
}
