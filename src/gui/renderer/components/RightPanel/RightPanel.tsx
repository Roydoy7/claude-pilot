/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * RightPanel Component - Tabbed panel with Workspace and Prompts tabs
 */

import { useState, useEffect } from 'react';
import { WorkspaceTab } from './WorkspaceTab';
import { PromptsTab } from './PromptsTab';
import { SkillsTab } from './SkillsTab';
import { useLanguage } from '../../i18n/LanguageContext';

type TabType = 'workspace' | 'prompts' | 'skills';

interface RightPanelProps {
  sessionId?: string;
  onClose?: () => void;
  onApplyTemplate?: (content: string) => void;
  width?: number;
}

export function RightPanel({ sessionId, onClose, onApplyTemplate, width }: RightPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('workspace');

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
      <div className="right-panel-header">
        <span className="right-panel-title">{t.rightPanel.context}</span>
        <button className="right-panel-close" onClick={onClose} title={t.rightPanel.closePanel} aria-label={t.rightPanel.closePanel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="tab-bar">
        <button
          className="tab-button"
          data-active={activeTab === 'workspace'}
          onClick={() => setActiveTab('workspace')}
          title={t.rightPanel.workspace}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
          </svg>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 3H5a2 2 0 0 0-2 2v3.5a2.5 2.5 0 1 1 0 5V19a2 2 0 0 0 2 2h5.5a2.5 2.5 0 1 1 5 0H19a2 2 0 0 0 2-2v-5.5a2.5 2.5 0 1 1 0-5V5a2 2 0 0 0-2-2h-5.5a2.5 2.5 0 1 1-5 0Z" />
          </svg>
          <span>{t.rightPanel.skills}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
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
