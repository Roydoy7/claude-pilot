/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Settings Dialog - Modal dialog for application settings
 * VS-style categorized layout with left navigation and right content
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAgentDefinitions } from '../../hooks/useAgentDefinitions.js';
import type { AuthStatus } from '../../../../core/types/auth-types.js';
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
  const agentDefinitions = useAgentDefinitions();

  // Active category
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('account');

  // Settings state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedCwd, setSelectedCwd] = useState<string>('');

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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

  // Fall back to the first available agent definition once it loads, if
  // nothing else (settings) resolved an agent yet.
  useEffect(() => {
    if (selectedAgentId || agentDefinitions.length === 0) {
      return;
    }
    setSelectedAgentId(agentDefinitions[0].id);
  }, [agentDefinitions, selectedAgentId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load settings
      const appSettings = await window.electronAPI.settings.get();
      setSettings(appSettings);
      setSelectedAgentId(appSettings.defaultAgentId ?? '');
      setSelectedCwd(appSettings.defaultCwd);

      // Load auth status
      const status = await window.electronAPI.auth.isAuthenticated();
      setAuthStatus(status);
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

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
    handleSaveSettings({ defaultAgentId: agentId });
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

  // Map an API key source to its localized display label
  const getAuthSourceLabel = (source: AuthStatus['apiKeySource']): string => {
    const labels = t.settings?.account?.sourceLabels;
    switch (source) {
      case 'environment':
        return labels?.environment || 'Environment Variable';
      case 'claude-settings':
        return labels?.claudeSettings || 'Claude Settings (~/.claude/settings.json)';
      case 'oauth':
        return labels?.oauth || 'Claude Account (OAuth)';
      default:
        return labels?.none || 'None';
    }
  };

  // Account settings (Authentication)
  const renderAccountSettings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Welcome message for first-time users */}
      {showWelcomeMessage && !authStatus?.authenticated && (
        <div className="alert-error" style={{ backgroundColor: 'var(--warning-subtle)', borderColor: 'var(--warning)', color: 'var(--warning)', fontSize: 'var(--text-sm)', padding: '1rem' }}>
          {t.settings?.account?.welcomeMessage || 'Welcome! Please authenticate to start using Claude Pilot.'}
        </div>
      )}

      {/* Authentication Status */}
      <div className="settings-group">
        <h4 className="settings-section-title" style={{ marginBottom: '1rem' }}>
          {t.settings?.account?.status || 'Authentication Status'}
        </h4>

        {authStatus?.authenticated ? (
          <div className="panel-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.75rem' }}>
              <span>✓</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {t.settings?.account?.authenticated || 'Authenticated'} ({getAuthSourceLabel(authStatus.apiKeySource)})
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
              <button className="btn btn-danger-ghost" onClick={handleLogout}>
                {t.settings?.account?.logout || 'Logout'}
              </button>
            )}
          </div>
        ) : (
          <div className="panel-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)', marginBottom: '1rem' }}>
              <span>⚠</span>
              <span style={{ fontSize: '0.875rem' }}>{t.settings?.account?.notAuthenticated || 'Not authenticated'}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => handleOAuthLogin('claudeai')}
                disabled={isLoggingIn}
                style={{ padding: '0.75rem 1rem' }}
              >
                {isLoggingIn ? (t.settings?.account?.loggingIn || 'Logging in...') : (t.settings?.account?.loginWithClaude || 'Login with Claude Account (Pro/Max/Team)')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleOAuthLogin('console')}
                disabled={isLoggingIn}
                style={{ padding: '0.75rem 1rem' }}
              >
                {isLoggingIn ? (t.settings?.account?.loggingIn || 'Logging in...') : (t.settings?.account?.loginWithConsole || 'Login with Console Account (API Billing)')}
              </button>
            </div>

            {loginError && (
              <div style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '0.75rem' }}>
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

  // Defaults settings (Role, Working Directory)
  const renderDefaultsSettings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Default Role */}
      <div className="settings-group">
        <h4 className="settings-section-title">
          {t.settings?.defaults?.role || 'Default Role'}
        </h4>
        <p className="settings-section-desc">
          {t.settings?.defaults?.roleDescription || 'Role used when creating new sessions'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {agentDefinitions.map((agent) => (
            <button
              key={agent.id}
              className="choice-btn"
              data-selected={selectedAgentId === agent.id}
              onClick={() => handleAgentChange(agent.id)}
            >
              {agent.displayName}
            </button>
          ))}
        </div>
      </div>

      {/* Default Working Directory */}
      <div className="settings-group">
        <h4 className="settings-section-title">
          {t.settings?.defaults?.workingDirectory || 'Default Working Directory'}
        </h4>
        <p className="settings-section-desc">
          {t.settings?.defaults?.workingDirectoryDescription || 'Working directory used when creating new sessions'}
        </p>
        <div className="panel-card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem' }}>
          <div
            className="mono"
            style={{
              flex: 1,
              fontSize: 'var(--text-sm)',
              color: selectedCwd ? 'var(--text-primary)' : 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={selectedCwd}
          >
            {selectedCwd || (t.settings?.defaults?.noDirectory || 'No directory selected')}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleSelectDirectory}
            style={{ flexShrink: 0 }}
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
            <h4 className="settings-section-title" style={{ marginBottom: '0.25rem' }}>
              {t.settings?.appearance?.theme || 'Theme'}
            </h4>
            <p className="settings-section-desc" style={{ margin: 0 }}>
              {t.settings?.appearance?.themeDescription || 'Choose your preferred color theme'}
            </p>
          </div>
          <div className="segmented">
            <button
              className="segmented-btn"
              data-active={theme === 'light'}
              onClick={() => handleThemeChange('light')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
            >
              <span>☀️</span>
              <span>{t.settings?.appearance?.themeLight || 'Light'}</span>
            </button>
            <button
              className="segmented-btn"
              data-active={theme === 'dark'}
              onClick={() => handleThemeChange('dark')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
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
            <h4 className="settings-section-title" style={{ marginBottom: '0.25rem' }}>
              {t.settings?.appearance?.language || 'Language'}
            </h4>
            <p className="settings-section-desc" style={{ margin: 0 }}>
              {t.settings?.appearance?.languageDescription || 'Choose your preferred language'}
            </p>
          </div>
          <select
            className="form-input"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'zh' | 'ja')}
            style={{ minWidth: '120px', cursor: 'pointer' }}
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
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        style={{ width: '90%', maxWidth: '700px', height: '80vh', maxHeight: '600px', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0, alignItems: 'center' }}>
          <h2 className="modal-title">
            {t.settings?.title || 'Settings'}
          </h2>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '20px' }}>
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
                className="settings-nav-btn"
                data-active={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
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
