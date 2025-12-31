/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Session Config - Simplified configuration UI for new sessions
 * Keeps role and working directory selection, model comes from Settings
 */

import React, { useState, useEffect } from 'react';
import { RoleType, ROLE_DISPLAY_NAMES } from '../../../../core/roles/role-enum.js';
import { useLanguage } from '../../i18n/LanguageContext.js';

interface SessionConfigProps {
  defaultRole?: RoleType;
  defaultModel?: string;
  defaultCwd?: string;
  onConfigChange?: (config: { role: RoleType; modelName: string; cwd: string }) => void;
}

export function SessionConfig({
  defaultRole = RoleType.OFFICE_ASSISTANT,
  defaultModel,
  defaultCwd,
  onConfigChange,
}: SessionConfigProps): React.ReactElement {
  const { t } = useLanguage();
  const [selectedRole, setSelectedRole] = useState<RoleType>(defaultRole);
  const [selectedCwd, setSelectedCwd] = useState<string>(defaultCwd || '');
  const [modelName, setModelName] = useState<string>(defaultModel || '');

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Notify parent of config changes
  useEffect(() => {
    onConfigChange?.({
      role: selectedRole,
      modelName: modelName,
      cwd: selectedCwd,
    });
  }, [selectedRole, modelName, selectedCwd, onConfigChange]);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.settings.get();
      if (!defaultCwd && settings.defaultCwd) {
        setSelectedCwd(settings.defaultCwd);
      }
      if (!defaultModel && settings.defaultModel) {
        setModelName(settings.defaultModel);
      }
      if (!defaultRole && settings.defaultRole) {
        setSelectedRole(settings.defaultRole);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSelectDirectory = async () => {
    try {
      const directory = await window.electronAPI.workspace.selectDirectory();
      if (directory) {
        setSelectedCwd(directory);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleRoleChange = (role: RoleType) => {
    setSelectedRole(role);
  };

  const roles = Object.values(RoleType);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        gap: '2rem',
      }}
    >
      {/* Welcome Section */}
      <div style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            margin: '0 auto 1rem',
          }}
        >
          💬
        </div>
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '0 0 0.5rem 0',
          }}
        >
          {t.sessionConfig.title}
        </h2>
      </div>

      {/* Configuration Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          width: '100%',
          maxWidth: '500px',
        }}
      >
        {/* Role Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              marginBottom: '0.5rem',
            }}
          >
            {t.sessionConfig.chooseRole}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {roles.map((role) => (
              <button
                key={role}
                onClick={() => handleRoleChange(role)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  backgroundColor: selectedRole === role ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: selectedRole === role ? '#ffffff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {ROLE_DISPLAY_NAMES[role]}
              </button>
            ))}
          </div>
        </div>

        {/* Working Directory Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              marginBottom: '0.5rem',
            }}
          >
            {t.sessionConfig.selectWorkingDirectory}
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: '0.875rem',
                color: selectedCwd ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={selectedCwd}
            >
              {selectedCwd || t.sessionConfig.noDirectorySelected}
            </div>
            <button
              onClick={handleSelectDirectory}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: '1px solid var(--border)',
                borderRadius: '4px',
                backgroundColor: 'var(--accent)',
                color: '#ffffff',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {t.sessionConfig.browseDirectory}
            </button>
          </div>
        </div>
      </div>

      {/* Start Hint */}
      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
        <p
          style={{
            fontSize: '1rem',
            fontWeight: 500,
            color: 'var(--accent)',
            margin: '0 0 0.5rem 0',
          }}
        >
          {t.sessionConfig.startConversationInstruction}
        </p>

        {/* Animated Arrow */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            animation: 'bounce 2s ease-in-out infinite',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <style>
            {`
              @keyframes bounce {
                0%, 100% {
                  transform: translateY(0);
                  opacity: 1;
                }
                50% {
                  transform: translateY(8px);
                  opacity: 0.7;
                }
              }
            `}
          </style>
        </div>
      </div>
    </div>
  );
}

export default SessionConfig;
