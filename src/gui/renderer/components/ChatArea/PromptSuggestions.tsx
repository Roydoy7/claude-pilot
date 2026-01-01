/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * PromptSuggestions - Displays smart prompt suggestions based on tools and user templates
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RoleType } from '../../../../core/roles/role-enum.js';
import type { PromptSuggestion, Language } from '../../../preload/preload-types.js';
import { useLanguage } from '../../i18n/LanguageContext.js';

interface PromptSuggestionsProps {
  role: RoleType;
  onSuggestionClick: (prompt: string) => void;
}

export function PromptSuggestions({
  role,
  onSuggestionClick,
}: PromptSuggestionsProps): React.ReactElement {
  const { t, language } = useLanguage();
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load suggestions on mount and when role or language changes
  useEffect(() => {
    loadSuggestions();
  }, [role, language]);

  const loadSuggestions = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.suggestions.get(role, language as Language);
      setSuggestions(result);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await window.electronAPI.suggestions.refresh(role, language as Language);
      if (result.success && result.suggestions) {
        setSuggestions(result.suggestions);
      }
    } catch (error) {
      console.error('Failed to refresh suggestions:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [role, language]);

  const handleSuggestionClick = useCallback((suggestion: PromptSuggestion) => {
    onSuggestionClick(suggestion.prompt);
  }, [onSuggestionClick]);

  // Separate templates and tool/LLM suggestions
  const templateSuggestions = suggestions.filter(s => s.source === 'template');
  const otherSuggestions = suggestions.filter(s => s.source !== 'template');

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
        {t.common.loading}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '0.5rem 0',
        width: '100%',
        maxWidth: '600px',
      }}
    >
      {/* User Templates Section */}
      {templateSuggestions.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span>📌</span>
            <span>{t.suggestions?.myTemplates || 'My Templates'}</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
            }}
          >
            {templateSuggestions.slice(0, 4).map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onClick={handleSuggestionClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Smart Suggestions Section */}
      {otherSuggestions.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
              }}
            >
              <span>💡</span>
              <span>{t.suggestions?.tryThese || 'Try These'}</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                cursor: isRefreshing ? 'wait' : 'pointer',
                opacity: isRefreshing ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
              title={t.suggestions?.refresh || 'Refresh suggestions'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                }}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span>{isRefreshing ? (t.suggestions?.refreshing || 'Refreshing...') : (t.suggestions?.refresh || 'Refresh')}</span>
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
            }}
          >
            {otherSuggestions.slice(0, 6).map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onClick={handleSuggestionClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {suggestions.length === 0 && !isLoading && (
        <div
          style={{
            textAlign: 'center',
            padding: '1rem',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
          }}
        >
          {t.suggestions?.noSuggestions || 'No suggestions available'}
        </div>
      )}

      {/* CSS for spin animation */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: PromptSuggestion;
  onClick: (suggestion: PromptSuggestion) => void;
}

function SuggestionCard({ suggestion, onClick }: SuggestionCardProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={() => onClick(suggestion)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.875rem',
        backgroundColor: isHovered ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: isHovered ? 'translateY(-2px)' : 'none',
        boxShadow: isHovered ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none',
        textAlign: 'left',
        minHeight: '100px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ fontSize: '1.125rem' }}>{suggestion.icon}</span>
        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {suggestion.title}
        </span>
      </div>
      <span
        style={{
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          lineHeight: '1.4',
        }}
      >
        {suggestion.prompt}
      </span>
    </button>
  );
}

export default PromptSuggestions;
