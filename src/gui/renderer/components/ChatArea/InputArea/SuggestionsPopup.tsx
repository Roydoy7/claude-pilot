/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SuggestionsPopup - Toolbar button + dropdown showing the user's saved
 * prompt templates.
 */

import { useLanguage } from '../../../i18n/LanguageContext';
import { useSuggestions } from './useSuggestions';

interface SuggestionsPopupProps {
  onSelect: (content: string) => void;
  disabled?: boolean;
}

export function SuggestionsPopup({ onSelect, disabled = false }: SuggestionsPopupProps) {
  const { t } = useLanguage();
  const {
    showPromptsMenu,
    setShowPromptsMenu,
    promptsMenuRef,
    promptTemplates,
  } = useSuggestions();

  return (
    <div ref={promptsMenuRef} style={{ position: 'relative' }}>
      <button
        className="toolbar-btn"
        onClick={() => setShowPromptsMenu(!showPromptsMenu)}
        title={t.inputArea.promptsButton?.tooltip || 'Quick Prompts'}
        disabled={disabled}
        style={{
          backgroundColor: showPromptsMenu ? 'var(--bg-tertiary)' : undefined,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {/* Document/template icon */}
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </button>
      {/* Prompts dropdown menu */}
      {showPromptsMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            marginBottom: '4px',
            minWidth: '280px',
            maxWidth: '360px',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
          }}
        >
          {/* User Templates Section */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📌</span>
            <span>{t.suggestions?.myTemplates || 'My Templates'}</span>
          </div>
          {promptTemplates.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {t.inputArea.promptsButton?.noTemplates || 'No templates yet'}
            </div>
          ) : (
            promptTemplates.slice(0, 4).map((template) => (
              <div
                key={template.id}
                onClick={() => onSelect(template.content)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 {template.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
