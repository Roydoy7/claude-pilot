/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Settings Dialog - Modal dialog for application settings
 * VS-style categorized layout with left navigation and right content
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RoleType, ROLE_DISPLAY_NAMES } from '../../../../core/roles/role-enum.js';
import type { AuthStatus } from '../../../../core/types/auth-types.js';
import type { ModelInfo } from '../../../../core/providers/model-list-manager.js';
import type { AppSettings } from '../../../../core/settings/settings-manager.js';
import { useLanguage } from '../../i18n/LanguageContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';

type SettingsCategory = 'account' | 'defaults' | 'appearance';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showWelcomeMessage?: boolean;
  onAuthChange?: (authenticated: boolean) => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  showWelcomeMessage = false,
  onAuthChange,
}: SettingsDialogProps): React.ReactElement | null {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  // Active category
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('account');

  // Settings state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleType>(RoleType.OFFICE_ASSISTANT);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedCwd, setSelectedCwd] = useState<string>('');

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Models state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings and auth on open
  useEffect(() => {
    if (isOpen) {
      loadData();
      // If showing welcome message, start on account category
      if (showWelcomeMessage) {
        setActiveCategory('account');
      }
    }
  }, [isOpen, showWelcomeMessage]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load settings
      const appSettings = await window.electronAPI.settings.get();
      setSettings(appSettings);
      setSelectedRole(appSettings.defaultRole);
      setSelectedModel(appSettings.defaultModel);
      setSelectedCwd(appSettings.defaultCwd);

      // Load auth status
      const status = await window.electronAPI.auth.isAuthenticated();
      setAuthStatus(status);

      // Load models
      const modelList = await window.electronAPI.models.list();
      setModels(modelList);

      // Set default model if not set
      if (!appSettings.defaultModel && modelList.length > 0) {
        const defaultModelId = await window.electronAPI.models.getDefault();
        const foundDefault = modelList.find(m => m.id === defaultModelId);
        setSelectedModel(foundDefault ? foundDefault.id : modelList[0].id);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = useCallback(async (updates: Partial<AppSettings>) => {
    try {
      await window.electronAPI.settings.update(updates);
      setSettings(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, []);

  const handleRoleChange = (role: RoleType) => {
    setSelectedRole(role);
    handleSaveSettings({ defaultRole: role });
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    handleSaveSettings({ defaultModel: model });
  };

  const handleSelectDirectory = async () => {
    try {
      const directory = await window.electronAPI.workspace.selectDirectory();
      if (directory) {
        setSelectedCwd(directory);
        handleSaveSettings({ defaultCwd: directory });
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    handleSaveSettings({ theme: newTheme });
  };

  const handleLanguageChange = (newLanguage: 'en' | 'zh' | 'ja') => {
    setLanguage(newLanguage);
    handleSaveSettings({ language: newLanguage });
  };

  const handleOAuthLogin = async (loginMethod: 'claudeai' | 'console') => {
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const result = await window.electronAPI.auth.loginWithOAuth({ loginMethod });

      if (result.success) {
        const status = await window.electronAPI.auth.isAuthenticated();
        setAuthStatus(status);
        onAuthChange?.(true);

        // Reload models after auth
        const modelList = await window.electronAPI.models.list();
        setModels(modelList);
      } else {
        setLoginError(result.error || t.settings?.account?.loginFailed || 'Login failed');
      }
    } catch (error) {
      console.error('OAuth login failed:', error);
      setLoginError(error instanceof Error ? error.message : t.settings?.account?.loginFailed || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.auth.logout();
      const status = await window.electronAPI.auth.isAuthenticated();
      setAuthStatus(status);
      onAuthChange?.(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const roles = Object.values(RoleType);

  // Category definitions with icons and labels
  const categories: Array<{ id: SettingsCategory; icon: string; label: string }> = [
    { id: 'account', icon: '👤', label: t.settings?.categories?.account || 'Account' },
    { id: 'defaults', icon: '⚙️', label: t.settings?.categories?.defaults || 'Defaults' },
    { id: 'appearance', icon: '🎨', label: t.settings?.categories?.appearance || 'Appearance' },
  ];

  // Render category content
  const renderCategoryContent = () => {
    if (isLoading) {
      return (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
          {t.common.loading}
        </div>
      );
    }

    switch (activeCategory) {
      case 'account':
        return renderAccountSettings();
      case 'defaults':
        return renderDefaultsSettings();
      case 'appearance':
        return renderAppearanceSettings();
      default:
        return null;
    }
  };

  // Account settings (Authentication)
  const renderAccountSettings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Welcome message for first-time users */}
      {showWelcomeMessage && !authStatus?.authenticated && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'var(--warning-bg, #fef3c7)',
            border: '1px solid var(--warning-border, #f59e0b)',
            borderRadius: '8px',
            color: 'var(--warning-text, #92400e)',
            fontSize: '0.875rem',
          }}
        >
          {t.settings?.account?.welcomeMessage || 'Welcome! Please authenticate to start using Claude Pilot.'}
        </div>
      )}

      {/* Authentication Status */}
      <div className="settings-group">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t.settings?.account?.status || 'Authentication Status'}
        </h4>

        {authStatus?.authenticated ? (
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', marginBottom: '0.75rem' }}>
              <span>✓</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {t.settings?.account?.authenticated || 'Authenticated'} ({authStatus.apiKeySource})
              </span>
            </div>
            {authStatus.oauthInfo && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.25rem', marginBottom: '0.75rem' }}>
                {authStatus.oauthInfo.subscriptionType && (
                  <div>{t.settings?.account?.plan || 'Plan'}: {authStatus.oauthInfo.subscriptionType}</div>
                )}
                <div>{t.settings?.account?.expires || 'Expires'}: {new Date(authStatus.oauthInfo.expiresAt).toLocaleString()}</div>
              </div>
            )}
            {authStatus.apiKeySource === 'oauth' && (
              <button
                onClick={handleLogout}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
              >
                {t.settings?.account?.logout || 'Logout'}
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626', marginBottom: '1rem' }}>
              <span>⚠</span>
              <span style={{ fontSize: '0.875rem' }}>{t.settings?.account?.notAuthenticated || 'Not authenticated'}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => handleOAuthLogin('claudeai')}
                disabled={isLoggingIn}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: '1px solid var(--accent)',
                  borderRadius: '6px',
                  backgroundColor: isLoggingIn ? 'var(--bg-tertiary)' : 'var(--accent)',
                  color: '#ffffff',
                  cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoggingIn ? (t.settings?.account?.loggingIn || 'Logging in...') : (t.settings?.account?.loginWithClaude || 'Login with Claude Account (Pro/Max/Team)')}
              </button>
              <button
                onClick={() => handleOAuthLogin('console')}
                disabled={isLoggingIn}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  backgroundColor: isLoggingIn ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoggingIn ? (t.settings?.account?.loggingIn || 'Logging in...') : (t.settings?.account?.loginWithConsole || 'Login with Console Account (API Billing)')}
              </button>
            </div>

            {loginError && (
              <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.75rem' }}>
                {t.common.messages.error}: {loginError}
              </div>
            )}

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
              {t.settings?.account?.envHint || 'Or set environment variable'}: ANTHROPIC_API_KEY
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Defaults settings (Role, Model, Working Directory)
  const renderDefaultsSettings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Default Role */}
      <div className="settings-group">
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t.settings?.defaults?.role || 'Default Role'}
        </h4>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t.settings?.defaults?.roleDescription || 'Role used when creating new sessions'}
        </p>
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
              }}
            >
              {ROLE_DISPLAY_NAMES[role]}
            </button>
          ))}
        </div>
      </div>

      {/* Default Model */}
      <div className="settings-group">
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t.settings?.defaults?.model || 'Default Model'}
        </h4>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t.settings?.defaults?.modelDescription || 'Model used when creating new sessions'}
        </p>
        <select
          value={selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!authStatus?.authenticated}
          style={{
            width: '100%',
            padding: '0.625rem',
            fontSize: '0.875rem',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            cursor: authStatus?.authenticated ? 'pointer' : 'not-allowed',
            opacity: authStatus?.authenticated ? 1 : 0.5,
          }}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        {!authStatus?.authenticated && (
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {t.settings?.defaults?.authRequired || 'Authentication required to select model'}
          </p>
        )}
      </div>

      {/* Default Working Directory */}
      <div className="settings-group">
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t.settings?.defaults?.workingDirectory || 'Default Working Directory'}
        </h4>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t.settings?.defaults?.workingDirectoryDescription || 'Working directory used when creating new sessions'}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem',
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
            {selectedCwd || (t.settings?.defaults?.noDirectory || 'No directory selected')}
          </div>
          <button
            onClick={handleSelectDirectory}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {t.settings?.defaults?.browse || 'Browse'}
          </button>
        </div>
      </div>
    </div>
  );

  // Appearance settings (Theme, Language)
  const renderAppearanceSettings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Theme */}
      <div className="settings-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              {t.settings?.appearance?.theme || 'Theme'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {t.settings?.appearance?.themeDescription || 'Choose your preferred color theme'}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => handleThemeChange('light')}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: 'none',
                backgroundColor: theme === 'light' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: theme === 'light' ? '#ffffff' : 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <span>☀️</span>
              <span>{t.settings?.appearance?.themeLight || 'Light'}</span>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: 'none',
                borderLeft: '1px solid var(--border)',
                backgroundColor: theme === 'dark' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: theme === 'dark' ? '#ffffff' : 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <span>🌙</span>
              <span>{t.settings?.appearance?.themeDark || 'Dark'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="settings-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              {t.settings?.appearance?.language || 'Language'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {t.settings?.appearance?.languageDescription || 'Choose your preferred language'}
            </p>
          </div>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'zh' | 'ja')}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              minWidth: '120px',
            }}
          >
            <option value="en">🇺🇸 {t.settings?.appearance?.languageEn || 'English'}</option>
            <option value="zh">🇨🇳 {t.settings?.appearance?.languageZh || '中文'}</option>
            <option value="ja">🇯🇵 {t.settings?.appearance?.languageJa || '日本語'}</option>
          </select>
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '700px',
          height: '80vh',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {t.settings?.title || 'Settings'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Main content with sidebar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Left sidebar - Categories */}
          <div
            style={{
              width: '180px',
              borderRight: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              padding: '0.5rem',
              flexShrink: 0,
            }}
          >
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: activeCategory === category.id ? 600 : 400,
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: activeCategory === category.id ? 'var(--accent)' : 'transparent',
                  color: activeCategory === category.id ? '#ffffff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  textAlign: 'left',
                  marginBottom: '0.25rem',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (activeCategory !== category.id) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeCategory !== category.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>

          {/* Right content area */}
          <div
            style={{
              flex: 1,
              padding: '1.5rem',
              overflowY: 'auto',
            }}
          >
            {renderCategoryContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
