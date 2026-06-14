/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ModelSelector - Dropdown to choose the model used for the current/next
 * message. Takes effect immediately for an active session and is persisted
 * to the session record.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ModelInfo } from '../../../../../core/providers/model-list-manager';
import { useLanguage } from '../../../i18n/LanguageContext';

interface ModelSelectorProps {
  modelName: string;
  models: ModelInfo[];
  onModelChange?: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ modelName, models, onModelChange, disabled = false }: ModelSelectorProps) {
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleSelect = useCallback((model: string) => {
    if (onModelChange) {
      onModelChange(model);
    }
    setShowMenu(false);
  }, [onModelChange]);

  const currentLabel = models.find((model) => model.id === modelName)?.name || modelName;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={disabled || !onModelChange}
        title={t.inputArea.modelSelector?.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '4px 8px',
          width: 'auto',
          height: 'auto',
          fontSize: '11px',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-tertiary, rgba(128, 128, 128, 0.1))',
          border: 'none',
          borderRadius: '4px',
          cursor: onModelChange ? 'pointer' : 'default',
          opacity: onModelChange ? 1 : 0.5,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ flexShrink: 0 }}>{currentLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {showMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            minWidth: '240px',
            maxHeight: '320px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            border: '1px solid var(--border-color, #dee2e6)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color, #dee2e6)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t.inputArea.modelSelector?.label}
          </div>
          {models.map((model) => {
            const isSelected = model.id === modelName;
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  backgroundColor: isSelected ? 'var(--bg-tertiary, rgba(0, 0, 0, 0.05))' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-secondary, #f8f9fa)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: isSelected ? 'var(--accent)' : 'var(--text-primary)', marginBottom: model.description ? '2px' : 0 }}>
                    {model.name}
                    {isSelected && <span style={{ marginLeft: '6px', fontSize: '10px' }}>✓</span>}
                  </div>
                  {model.description && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {model.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
