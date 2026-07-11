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
      <h3 className="tab-title">{t.rightPanel.workspaceTab.title}</h3>

      {/* Description */}
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
            <div className="panel-card">
              <div className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {cwd || t.sessionConfig.noDirectorySelected}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                {t.rightPanel.workspaceTab.setDuringCreation}
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
              className="add-workspace-button"
              onClick={handleAddDirectory}
              disabled={loading}
              style={{ marginBottom: '0.75rem' }}
            >
              {t.rightPanel.workspaceTab.addDirectory}
            </button>

            {/* Directory List */}
            {additionalDirectories.length === 0 ? (
              <div className="panel-empty">
                {t.rightPanel.workspaceTab.noAdditionalDirectories}
              </div>
            ) : (
              <div className="workspace-list">
                {additionalDirectories.map((path, index) => (
                  <div key={index} className="workspace-item">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                        {t.rightPanel.workspaceTab.directoryLabel(index + 1)}
                      </span>
                      <span className="workspace-path mono" title={path} style={{ fontSize: '0.85rem' }}>
                        {path}
                      </span>
                    </div>
                    <button
                      className="workspace-remove"
                      onClick={() => handleRemoveDirectory(path)}
                      title={t.rightPanel.workspaceTab.removeDirectory}
                    >
                      ×
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
