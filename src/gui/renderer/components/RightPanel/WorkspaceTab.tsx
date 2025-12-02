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
    <div className="workspace-tab" style={{ padding: '1rem', overflowY: 'auto', height: '100%' }}>
      <h3 className="tab-title">{t.rightPanel.workspaceTab.title}</h3>

      {/* Description */}
      <div style={{
        marginBottom: '1rem',
      }}>
        <p style={{
          fontSize: '0.9rem',
          fontWeight: '500',
          color: 'var(--accent)',
          margin: 0,
          lineHeight: '1.5',
        }}>
          {t.rightPanel.workspaceTab.description}
        </p>
      </div>

      {!sessionId ? (
        /* No Session Active */
        <div style={{
          padding: '1rem',
          backgroundColor: 'var(--bg-hover)',
          borderRadius: '8px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
        }}>
          {t.rightPanel.workspaceTab.noSessionWarning}
        </div>
      ) : (
        <>
          {/* Current Working Directory (Read-only) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Working Directory (cwd)
            </h4>
            <div style={{
              padding: '0.75rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}>
                {cwd || t.sessionConfig.noDirectorySelected}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginTop: '0.5rem',
              }}>
                Set during session creation
              </div>
            </div>
          </div>

          {/* Additional Directories */}
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Additional Directories ({additionalDirectories.length})
            </h4>

            {/* Add Directory Button */}
            <button
              className="add-workspace-button"
              onClick={handleAddDirectory}
              disabled={loading}
              style={{
                marginBottom: '0.75rem',
              }}
            >
              + Add Directory
            </button>

            {/* Directory List */}
            {additionalDirectories.length === 0 ? (
              <div style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-hover)',
                borderRadius: '6px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
              }}>
                No additional directories added
              </div>
            ) : (
              <div className="workspace-list">
                {additionalDirectories.map((path, index) => (
                  <div key={index} className="workspace-item">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        flexShrink: 0,
                      }}>
                        Directory {index + 1}
                      </span>
                      <span
                        className="workspace-path"
                        title={path}
                        style={{
                          fontSize: '0.85rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        {path}
                      </span>
                    </div>
                    <button
                      className="workspace-remove"
                      onClick={() => handleRemoveDirectory(path)}
                      title="Remove directory"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div style={{
            marginTop: '1.5rem',
            padding: '0.75rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '4px',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: '1.5',
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> The AI can access files in the working directory and all additional directories.
          </div>
        </>
      )}
    </div>
  );
}
