/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * RightPanel Component - Tabbed panel with Workspace and Prompts tabs
 */

import { useState, useEffect } from 'react';
import { WorkspaceTab } from './WorkspaceTab';
import { PromptsTab } from './PromptsTab';
import { SkillsTab } from './SkillsTab';
import { BrowserTab } from './BrowserTab';
import { useLanguage } from '../../i18n/LanguageContext';

type TabType = 'workspace' | 'prompts' | 'skills' | 'browser';

interface RightPanelProps {
  sessionId?: string;
  onClose?: () => void;
  onApplyTemplate?: (content: string) => void;
  width?: number;
  /** Incremented by App when the main process requests the browser pane */
  showBrowserSignal?: number;
}

export function RightPanel({ sessionId, onClose, onApplyTemplate, width, showBrowserSignal }: RightPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('workspace');
  // The webview must not be created inside a display:none subtree — the guest
  // page never attaches. Mount BrowserTab only after first activation, then
  // keep it alive with visibility:hidden so the session persists.
  const [browserMounted, setBrowserMounted] = useState(false);

  useEffect(() => {
    if (showBrowserSignal && showBrowserSignal > 0) {
      setActiveTab('browser');
      setBrowserMounted(true);
    }
  }, [showBrowserSignal]);

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
        <div className="right-panel-tabs">
          <button
            className="right-panel-tab"
            data-active={activeTab === 'workspace'}
            onClick={() => setActiveTab('workspace')}
            title={t.rightPanel.workspace}
            aria-label={t.rightPanel.workspace}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
            </svg>
          </button>
          <button
            className="right-panel-tab"
            data-active={activeTab === 'prompts'}
            onClick={() => setActiveTab('prompts')}
            title={t.rightPanel.prompts}
            aria-label={t.rightPanel.prompts}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
          <button
            className="right-panel-tab"
            data-active={activeTab === 'skills'}
            onClick={() => setActiveTab('skills')}
            title={t.rightPanel.skills}
            aria-label={t.rightPanel.skills}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 3H5a2 2 0 0 0-2 2v3.5a2.5 2.5 0 1 1 0 5V19a2 2 0 0 0 2 2h5.5a2.5 2.5 0 1 1 5 0H19a2 2 0 0 0 2-2v-5.5a2.5 2.5 0 1 1 0-5V5a2 2 0 0 0-2-2h-5.5a2.5 2.5 0 1 1-5 0Z" />
            </svg>
          </button>
          <button
            className="right-panel-tab"
            data-active={activeTab === 'browser'}
            onClick={() => { setActiveTab('browser'); setBrowserMounted(true); }}
            title={t.rightPanel.browser}
            aria-label={t.rightPanel.browser}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
        </div>
        <button className="right-panel-close" onClick={onClose} title={t.rightPanel.closePanel} aria-label={t.rightPanel.closePanel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content" style={{ position: 'relative' }}>
        <div style={{ display: activeTab === 'workspace' ? 'block' : 'none' }}>
          <WorkspaceTab sessionId={sessionId} />
        </div>
        <div style={{ display: activeTab === 'prompts' ? 'block' : 'none' }}>
          <PromptsTab onApplyTemplate={onApplyTemplate || (() => {})} />
        </div>
        <div style={{ display: activeTab === 'skills' ? 'block' : 'none' }}>
          <SkillsTab sessionId={sessionId ?? null} />
        </div>
        <div
          style={
            activeTab === 'browser'
              ? { display: 'flex', flexDirection: 'column', height: '100%' }
              : {
                  visibility: 'hidden',
                  pointerEvents: 'none',
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }
          }
        >
          {browserMounted && <BrowserTab />}
        </div>
      </div>
    </div>
  );
}
