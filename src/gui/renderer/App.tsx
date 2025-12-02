/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Main React application component
 */

import { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { Header } from './components/Header';
import { ChatArea } from './components/ChatArea';
import { RightPanel } from './components/RightPanel';
import { RoleType } from '../../core/roles/role-enum.js';
import { ClaudeModel } from '../../core/providers/model-list-manager.js';
import type { Session } from '../../core/sessions/session-manager.js';

function App() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [templateContent, setTemplateContent] = useState<string | undefined>(undefined);

  // Initialize service and load sessions
  useEffect(() => {
    async function initialize() {
      try {
        const result = await window.electronAPI.service.initialize();
        if (result.success) {
          const sessions = result.sessions || [];
          if (sessions.length > 0 && result.currentSession) {
            setCurrentSession(result.currentSession);
          }
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initialize();
  }, []);

  const togglePanel = () => {
    setIsPanelVisible(!isPanelVisible);
  };

  const handleSessionSelect = (session: Session) => {
    setCurrentSession(session);
  };

  const handleSessionUpdate = (session: Session) => {
    setCurrentSession(session);
  };

  const handleApplyTemplate = (content: string) => {
    setTemplateContent(content);
  };

  const handleTemplateApplied = () => {
    setTemplateContent(undefined);
  };

  if (isLoading) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <div className="app">
            <Header onTogglePanel={togglePanel} isPanelVisible={isPanelVisible} />
            <div
              className="main-layout"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              Loading...
            </div>
          </div>
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <div className="app">
          <Header
            onTogglePanel={togglePanel}
            isPanelVisible={isPanelVisible}
            currentSession={currentSession}
          />
          <div className="main-layout">
            <ChatArea
              sessionId={currentSession?.id}
              defaultRole={(currentSession?.role as RoleType) || RoleType.OFFICE_ASSISTANT}
              defaultModel={currentSession?.modelName || ClaudeModel.SONNET_4}
              onSessionUpdate={handleSessionUpdate}
              templateContent={templateContent}
              onTemplateApplied={handleTemplateApplied}
            />
            {isPanelVisible && (
              <RightPanel
                sessionId={currentSession?.id}
                onClose={togglePanel}
                onSessionSelect={handleSessionSelect}
                onApplyTemplate={handleApplyTemplate}
              />
            )}
          </div>
        </div>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
