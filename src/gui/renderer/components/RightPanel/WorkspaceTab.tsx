/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * WorkspaceTab Component - Session-based directory management
 * Displays cwd (read-only) and manages additionalDirectories
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface WorkspaceTabProps {
  sessionId?: string;
}

export function WorkspaceTab({ sessionId }: WorkspaceTabProps) {
  const { t } = useLanguage();
  const [cwd, setCwd] = useState<string>('');
  const [additionalDirectories, setAdditionalDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Load session directories when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSessionDirectories();
    } else {
      setCwd('');
      setAdditionalDirectories([]);
    }
  }, [sessionId]);

  const loadSessionDirectories = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      // Get session data (which includes cwd)
      const sessions = await window.electronAPI.session.list();
      const currentSession = sessions.find(s => s.id === sessionId);

      if (currentSession) {
        setCwd(currentSession.cwd);
      }

      // Get additional directories
      const dirs = await window.electronAPI.session.getAdditionalDirectories(sessionId);
      setAdditionalDirectories(dirs);
    } catch (error) {
      console.error('Failed to load session directories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDirectory = async () => {
    if (!sessionId) return;

    const path = await window.electronAPI.workspace.selectDirectory();
    if (!path) return;

    // Check if already exists
    if (cwd === path || additionalDirectories.includes(path)) {
      return;
    }

    try {
      await window.electronAPI.session.addAdditionalDirectory(sessionId, path);
      await loadSessionDirectories();
    } catch (error) {
      console.error('Failed to add directory:', error);
    }
  };

  const handleRemoveDirectory = async (path: string) => {
    if (!sessionId) return;

    try {
      await window.electronAPI.session.removeAdditionalDirectory(sessionId, path);
      await loadSessionDirectories();
    } catch (error) {
      console.error('Failed to remove directory:', error);
    }
  };

  return (
    <div className="workspace-tab panel-scroll">
      <p className="panel-tab-description">
        {t.rightPanel.workspaceTab.description}
      </p>

      {!sessionId ? (
        /* No Session Active */
        <div className="panel-empty">
          {t.rightPanel.workspaceTab.noSessionWarning}
        </div>
      ) : (
        <>
          {/* Current Working Directory (Read-only) */}
          <div className="panel-section">
            <h4 className="panel-section-title">
              {t.rightPanel.workspaceTab.workingDirectory}
            </h4>
            <div className="workspace-current-path">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></svg>
              <div className="workspace-current-copy">
                <div className="workspace-current-value mono" title={cwd}>{cwd || t.sessionConfig.noDirectorySelected}</div>
                <div className="workspace-current-help">
                {t.rightPanel.workspaceTab.setDuringCreation}
                </div>
              </div>
            </div>
          </div>

          {/* Additional Directories */}
          <div className="panel-section">
            <h4 className="panel-section-title">
              {t.rightPanel.workspaceTab.additionalDirectories(additionalDirectories.length)}
            </h4>

            {/* Add Directory Button */}
            <button
              className="btn btn-outline"
              onClick={handleAddDirectory}
              disabled={loading}
            >
              {t.rightPanel.workspaceTab.addDirectory}
            </button>

            {/* Directory List */}
            {additionalDirectories.length === 0 ? (
              <div className="workspace-empty-inline">
                {t.rightPanel.workspaceTab.noAdditionalDirectories}
              </div>
            ) : (
              <div className="workspace-list">
                {additionalDirectories.map((path, index) => (
                  <div key={index} className="workspace-item">
                    <div className="workspace-item-copy">
                      <span className="workspace-item-label">
                        {t.rightPanel.workspaceTab.directoryLabel(index + 1)}
                      </span>
                      <span className="workspace-path mono" title={path}>
                        {path}
                      </span>
                    </div>
                    <button
                      className="workspace-remove"
                      onClick={() => handleRemoveDirectory(path)}
                      title={t.rightPanel.workspaceTab.removeDirectory}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="panel-note">
            {t.rightPanel.workspaceTab.accessNote}
          </div>
        </>
      )}
    </div>
  );
}
