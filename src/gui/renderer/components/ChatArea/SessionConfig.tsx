/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Session Config - Configuration UI for Claude sessions
 * Simplified for Claude-only architecture
 */

import React, { useState, useEffect } from 'react';
import { RoleType, ROLE_DISPLAY_NAMES } from '../../../../core/roles/role-enum.js';
import type { AuthStatus } from '../../../../core/types/auth-types.js';
import type { ModelInfo } from '../../../../core/providers/model-list-manager.js';
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
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel || '');
  const [selectedCwd, setSelectedCwd] = useState<string>(defaultCwd || '');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Load auth status, models, and last cwd on mount
  useEffect(() => {
    loadAuthAndModels();
    loadLastCwd();
  }, []);

  // Notify parent of config changes
  useEffect(() => {
    if (selectedCwd) {
      onConfigChange?.({
        role: selectedRole,
        modelName: selectedModel,
        cwd: selectedCwd,
      });
    }
  }, [selectedRole, selectedModel, selectedCwd, onConfigChange]);

  const loadAuthAndModels = async () => {
    setIsLoading(true);
    try {
      // Load auth status
      const status = await window.electronAPI.auth.isAuthenticated();
      setAuthStatus(status);

      // Load models from API
      const modelList = await window.electronAPI.models.list();
      setModels(modelList);

      // Set default model if not already set
      if (!selectedModel && modelList.length > 0) {
        const defaultModelId = await window.electronAPI.models.getDefault();
        const foundDefault = modelList.find(m => m.id === defaultModelId);
        setSelectedModel(foundDefault ? foundDefault.id : modelList[0].id);
      }
    } catch (error) {
      console.error('Failed to load auth status and models:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLastCwd = async () => {
    try {
      // Load last used cwd if not provided
      if (!defaultCwd) {
        const lastCwd = await window.electronAPI.session.getLastCwd();
        setSelectedCwd(lastCwd);
      }
    } catch (error) {
      console.error('Failed to load last cwd:', error);
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

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
  };

  const handleOAuthLogin = async (loginMethod: 'claudeai' | 'console') => {
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const result = await window.electronAPI.auth.loginWithOAuth({ loginMethod });

      if (result.success) {
        await loadAuthAndModels();
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch (error) {
      console.error('OAuth login failed:', error);
      setLoginError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.auth.logout();
      await loadAuthAndModels();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const roles = Object.values(RoleType);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-secondary)',
        }}
      >
        {t.common.loading}
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateRows: 'auto auto auto 1fr auto',
        padding: '1rem 2rem',
        gap: '1rem',
        overflowY: 'auto',
        alignItems: 'start',
        justifyItems: 'center',
      }}
    >
      {/* Title */}
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '900px' }}>
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {t.sessionConfig.title}
        </h2>
      </div>

      {/* Role Selection */}
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            1
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {t.sessionConfig.chooseRole}
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {t.sessionConfig.chooseRoleDescription}
            </p>
          </div>
        </div>
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
                transition: 'all 0.2s',
              }}
            >
              {ROLE_DISPLAY_NAMES[role]}
            </button>
          ))}
        </div>
      </div>

      {/* Model Selection */}
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            2
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {t.sessionConfig.selectProviderModel}
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {t.sessionConfig.selectProviderModelDescription}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--bg-primary)',
            height: '220px',
            width: '100%',
          }}
        >
          {/* Left: Model list */}
          <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
            {models.length > 0 ? (
              <div>
                {models.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => authStatus?.authenticated && handleModelChange(model.id)}
                    style={{
                      padding: '0.75rem',
                      cursor: authStatus?.authenticated ? 'pointer' : 'not-allowed',
                      backgroundColor: selectedModel === model.id ? 'var(--bg-hover)' : 'transparent',
                      borderLeft: selectedModel === model.id ? '3px solid var(--accent)' : '3px solid transparent',
                      transition: 'all 0.2s',
                      opacity: authStatus?.authenticated ? 1 : 0.5,
                    }}
                    onMouseEnter={(e) => {
                      if (authStatus?.authenticated && selectedModel !== model.id) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedModel !== model.id) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: selectedModel === model.id ? 600 : 400,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {model.name}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {model.id}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {t.sessionConfig.noModelsAvailable}
              </div>
            )}
          </div>

          {/* Right: Authentication info */}
          <div
            style={{
              width: '280px',
              padding: '0.75rem',
              backgroundColor: 'var(--bg-secondary)',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <label style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem' }}>
                {t.sessionConfig.authStatus}
              </label>

              {authStatus?.authenticated ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                    <span>✓</span>
                    <span style={{ fontSize: '0.75rem' }}>
                      {t.sessionConfig.authenticated} ({authStatus.apiKeySource})
                    </span>
                  </div>
                  {authStatus.oauthInfo && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '1.25rem' }}>
                      {authStatus.oauthInfo.subscriptionType && (
                        <div>Plan: {authStatus.oauthInfo.subscriptionType}</div>
                      )}
                      <div>Expires: {new Date(authStatus.oauthInfo.expiresAt).toLocaleString()}</div>
                    </div>
                  )}
                  {authStatus.apiKeySource === 'oauth' && (
                    <button
                      onClick={handleLogout}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: '#dc2626',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Logout
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
                    <span>⚠</span>
                    <span style={{ fontSize: '0.75rem' }}>
                      {t.sessionConfig.authRequired}
                    </span>
                  </div>

                  {/* OAuth Login Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => handleOAuthLogin('claudeai')}
                      disabled={isLoggingIn}
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        border: '1px solid var(--accent)',
                        borderRadius: '4px',
                        backgroundColor: isLoggingIn ? 'var(--bg-tertiary)' : 'var(--accent)',
                        color: '#ffffff',
                        cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {isLoggingIn ? 'Logging in...' : '🔐 Login with Claude Account (Pro/Max/Team)'}
                    </button>
                    <button
                      onClick={() => handleOAuthLogin('console')}
                      disabled={isLoggingIn}
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        backgroundColor: isLoggingIn ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {isLoggingIn ? 'Logging in...' : '🔑 Login with Console Account (API Billing)'}
                    </button>
                  </div>

                  {loginError && (
                    <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem' }}>
                      Error: {loginError}
                    </div>
                  )}

                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Or set environment variable: {t.sessionConfig.setEnvironmentVariable('ANTHROPIC_API_KEY')}
                  </div>
                </div>
              )}

              {/* Provider badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1rem',
                  padding: '0.5rem',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                }}
              >
                <span>🟣</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Anthropic Claude
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Working Directory Selection */}
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            3
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {t.sessionConfig.selectWorkingDirectory}
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {t.sessionConfig.selectWorkingDirectoryDescription}{' '}
              <span
                onClick={() => {
                  if ((window as unknown as { __rightPanelSwitchToWorkspace?: () => void }).__rightPanelSwitchToWorkspace) {
                    (window as unknown as { __rightPanelSwitchToWorkspace: () => void }).__rightPanelSwitchToWorkspace();
                  }
                }}
                style={{
                  color: 'var(--accent)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t.sessionConfig.workspaceLink}
              </span>
              {t.sessionConfig.selectWorkingDirectoryDescriptionSuffix}
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
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
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {t.sessionConfig.browseDirectory}
          </button>
        </div>
      </div>

      {/* Spacer - pushes the following content to bottom */}
      <div style={{ width: '100%' }} />

      {/* Start Conversation Hint */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            4
          </div>
          <p
            style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            {t.sessionConfig.startConversationInstruction}
          </p>
        </div>

        {/* Animated Arrow Indicator */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            animation: 'bounce 2s ease-in-out infinite',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
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
                  transform: translateY(10px);
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
