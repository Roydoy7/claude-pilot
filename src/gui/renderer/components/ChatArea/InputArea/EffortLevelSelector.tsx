/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * EffortLevelSelector - Dropdown to choose the model's thinking effort
 * level. Takes effect immediately for an active session and is persisted
 * to the session record. Renders nothing if the current model has no
 * adjustable effort levels (e.g. Haiku 4.5).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { EffortLevel } from '../../../../../core/providers/model-list-manager';
import { useLanguage } from '../../../i18n/LanguageContext';

interface EffortLevelSelectorProps {
  effortLevel?: EffortLevel;
  supportedLevels: EffortLevel[];
  onEffortLevelChange?: (level: EffortLevel) => void;
  disabled?: boolean;
}

export function EffortLevelSelector({ effortLevel, supportedLevels, onEffortLevelChange, disabled = false }: EffortLevelSelectorProps) {
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

  const handleSelect = useCallback((level: EffortLevel) => {
    if (onEffortLevelChange) {
      onEffortLevelChange(level);
    }
    setShowMenu(false);
  }, [onEffortLevelChange]);

  if (supportedLevels.length === 0) {
    return null;
  }

  const levelLabels = t.inputArea.effortLevelSelector?.levels;
  const currentLabel = effortLevel ? (levelLabels?.[effortLevel] || effortLevel) : '';

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={disabled || !onEffortLevelChange}
        title={t.inputArea.effortLevelSelector?.label}
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
          cursor: onEffortLevelChange ? 'pointer' : 'default',
          opacity: onEffortLevelChange ? 1 : 0.5,
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
            minWidth: '140px',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            border: '1px solid var(--border-color, #dee2e6)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color, #dee2e6)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t.inputArea.effortLevelSelector?.label}
          </div>
          {supportedLevels.map((level) => {
            const isSelected = level === effortLevel;
            return (
              <button
                key={level}
                onClick={() => handleSelect(level)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  backgroundColor: isSelected ? 'var(--bg-tertiary, rgba(0, 0, 0, 0.05))' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-secondary, #f8f9fa)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{levelLabels?.[level] || level}</span>
                {isSelected && <span style={{ fontSize: '10px' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
