/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Main React application component
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { Header } from './components/Header';
import { ChatArea } from './components/ChatArea';
import { LeftSidebar } from './components/LeftSidebar';
import { RightPanel } from './components/RightPanel';
import { useAgentDefinitions } from './hooks/useAgentDefinitions.js';
import type { Session } from '../../core/sessions/session-manager.js';

const PANEL_WIDTH_KEY = 'rightPanelWidth';
const DEFAULT_PANEL_WIDTH = 360;
const MIN_PANEL_WIDTH = 304;
const MAX_PANEL_WIDTH = 800;

function App() {
  const agentDefinitions = useAgentDefinitions();
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [templateContent, setTemplateContent] = useState<string | undefined>(undefined);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [showSettingsOnMount, setShowSettingsOnMount] = useState(false);

  // Incremented when the main process asks to show the browser pane
  // (an agent invoked a browser tool while the pane was closed)
  const [showBrowserSignal, setShowBrowserSignal] = useState(0);

  useEffect(() => {
    window.electronAPI.browser.onShowRequest(() => {
      setIsPanelVisible(true);
      setShowBrowserSignal((n) => n + 1);
    });
  }, []);

  // Initialize service and load sessions
  useEffect(() => {
    async function initialize() {
      try {
        // Check authentication status first
        const authStatus = await window.electronAPI.auth.isAuthenticated();
        setIsAuthenticated(authStatus.authenticated);

        // If not authenticated, show settings dialog
        if (!authStatus.authenticated) {
          setShowSettingsOnMount(true);
        }

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

  const handleAuthChange = (authenticated: boolean) => {
    setIsAuthenticated(authenticated);
    if (authenticated) {
      setShowSettingsOnMount(false);
    }
  };

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

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };
  }, [panelWidth]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      // Calculate new width (dragging left increases width, right decreases)
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeRef.current.startWidth + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save to localStorage
      localStorage.setItem(PANEL_WIDTH_KEY, panelWidth.toString());
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelWidth]);

  if (isLoading) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <div className="app">
            <Header
              onTogglePanel={togglePanel}
              isPanelVisible={isPanelVisible}
              isAuthenticated={isAuthenticated}
              onAuthChange={handleAuthChange}
            />
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
            isAuthenticated={isAuthenticated}
            onAuthChange={handleAuthChange}
            showSettingsOnMount={showSettingsOnMount}
          />
          <div className="main-layout">
            <LeftSidebar
              currentSessionId={currentSession?.id}
              onSessionSelect={handleSessionSelect}
            />
            <ChatArea
              sessionId={currentSession?.id}
              defaultAgentId={currentSession?.agentId || agentDefinitions[0]?.id}
              defaultModel={currentSession?.modelName}
              defaultEffortLevel={currentSession?.effortLevel}
              onSessionUpdate={handleSessionUpdate}
              templateContent={templateContent}
              onTemplateApplied={handleTemplateApplied}
            />
            {isPanelVisible && (
              <>
                {/* Resizer handle */}
                <div
                  className={`panel-resizer ${isResizing ? 'resizing' : ''}`}
                  onMouseDown={handleResizeStart}
                />
                <RightPanel
                  sessionId={currentSession?.id}
                  onClose={togglePanel}
                  onApplyTemplate={handleApplyTemplate}
                  width={panelWidth}
                  showBrowserSignal={showBrowserSignal}
                />
              </>
            )}
          </div>
        </div>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
