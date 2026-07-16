/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Session Config - Simplified configuration UI for new sessions
 * Keeps role and working directory selection, model comes from Settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAgentDefinitions } from '../../hooks/useAgentDefinitions.js';
import { useLanguage } from '../../i18n/LanguageContext.js';
import { RoleExampleRotator } from './RoleExampleRotator.js';
import type { AgentLoadError } from '../../../preload/preload-types.js';

interface SessionConfigProps {
  defaultAgentId?: string;
  defaultModel?: string;
  defaultCwd?: string;
  onConfigChange?: (config: { agentId: string; modelName: string; cwd: string }) => void;
  onSuggestionClick?: (prompt: string) => void;
}

export function SessionConfig({
  defaultAgentId,
  defaultModel,
  defaultCwd,
  onConfigChange,
  onSuggestionClick,
}: SessionConfigProps): React.ReactElement {
  const { t } = useLanguage();
  const agentDefinitions = useAgentDefinitions();
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || '');
  const [selectedCwd, setSelectedCwd] = useState<string>(defaultCwd || '');
  const [agentLoadErrors, setAgentLoadErrors] = useState<AgentLoadError[]>([]);
  const modelName = defaultModel || '';

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Surface agent definitions that failed to load (broken tool scripts,
  // invalid tools.md, ...) instead of silently hiding them from the role list
  useEffect(() => {
    window.electronAPI.agents.loadErrors().then(setAgentLoadErrors).catch((error: unknown) => {
      console.error('Failed to load agent load errors:', error);
    });
  }, []);

  // Fall back to the first available agent definition once it loads, if
  // nothing else (props/settings) resolved an agent yet.
  useEffect(() => {
    if (selectedAgentId || agentDefinitions.length === 0) {
      return;
    }
    setSelectedAgentId(agentDefinitions[0].id);
  }, [agentDefinitions, selectedAgentId]);

  // Notify parent of config changes
  useEffect(() => {
    onConfigChange?.({
      agentId: selectedAgentId,
      modelName: modelName,
      cwd: selectedCwd,
    });
  }, [selectedAgentId, modelName, selectedCwd, onConfigChange]);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.settings.get();
      if (!defaultCwd && settings.defaultCwd) {
        setSelectedCwd(settings.defaultCwd);
      }
      if (!defaultAgentId && settings.defaultAgentId) {
        setSelectedAgentId(settings.defaultAgentId);
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
        // Keep the new-session working directory in sync with the user's
        // latest selection. Otherwise the next SessionConfig mount reloads
        // SettingsManager's initial home-directory default.
        const result = await window.electronAPI.settings.update({ defaultCwd: directory });
        if (!result.success) {
          console.error('Failed to remember selected directory');
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
  };

  const handleSuggestionClick = useCallback((prompt: string) => {
    onSuggestionClick?.(prompt);
  }, [onSuggestionClick]);

  const selectedAgent = agentDefinitions.find((agent) => agent.id === selectedAgentId);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '2rem',
        paddingTop: '1rem',
        gap: '1.25rem',
        overflowY: 'auto',
      }}
    >
      {/* Welcome Section */}
      <div style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem',
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--on-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6.5 5.5h11a3 3 0 0 1 3 3v5.5a3 3 0 0 1-3 3H11l-4.5 3v-3.25A3 3 0 0 1 3.5 14V8.5a3 3 0 0 1 3-3Z" />
          </svg>
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
          gap: '1.25rem',
          width: '100%',
          maxWidth: '900px',
        }}
      >
        {/* Role Selection */}
        <div>
          <div className="role-section-header">
            <div className="role-section-number">1</div>
            <div>
              <label className="role-section-title">
                {t.sessionConfig.chooseRole}
              </label>
              <p className="role-section-description">
                {t.sessionConfig.chooseRoleDescription}
              </p>
            </div>
          </div>
          <div className="role-card-list">
            {agentDefinitions.map((agent) => {
              const isActive = selectedAgentId === agent.id;
              return (
                <button
                  key={agent.id}
                  type="button"
                  className="role-card"
                  data-selected={isActive}
                  onClick={() => handleAgentChange(agent.id)}
                >
                  <span className="role-card-name">{agent.displayName}</span>
                  {agent.description && (
                    <span className="role-card-description">{agent.description}</span>
                  )}
                </button>
              );
            })}
          </div>
          {agentLoadErrors.length > 0 && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.625rem 0.75rem',
                border: '1px solid var(--error, #d64545)',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                color: 'var(--error, #d64545)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                {t.sessionConfig.agentLoadErrorTitle}
              </div>
              {agentLoadErrors.map(({ id, error }) => (
                <div key={id} style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                  {id}: {error}
                </div>
              ))}
            </div>
          )}
          {selectedAgent && selectedAgent.prompts.length > 0 && (
            <RoleExampleRotator
              examples={selectedAgent.prompts}
              label={t.sessionConfig.tryAsking}
              onExampleClick={handleSuggestionClick}
            />
          )}
        </div>

        {/* Working Directory Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              marginBottom: '0.25rem',
            }}
          >
            {t.sessionConfig.selectWorkingDirectory}
          </label>
          <p
            style={{
              margin: '0 0 0.5rem',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
            }}
          >
            {t.sessionConfig.selectWorkingDirectoryDescription}
            {t.sessionConfig.selectWorkingDirectoryDescriptionSuffix && (
              <> {t.sessionConfig.selectWorkingDirectoryDescriptionSuffix}</>
            )}
          </p>
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
                color: 'var(--on-accent)',
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
