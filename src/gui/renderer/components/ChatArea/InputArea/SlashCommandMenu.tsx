/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SlashCommandMenu - Dropdown listing available slash commands for the
 * current session.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';

interface SlashCommandMenuProps {
  slashCommands: string[];
  onSlashCommandSelect?: (command: string) => void;
  disabled?: boolean;
}

export function SlashCommandMenu({ slashCommands, onSlashCommandSelect, disabled = false }: SlashCommandMenuProps) {
  const { t } = useLanguage();
  const [showSlashCommandMenu, setShowSlashCommandMenu] = useState(false);
  const slashCommandMenuRef = useRef<HTMLDivElement>(null);

  // Close slash command menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (slashCommandMenuRef.current && !slashCommandMenuRef.current.contains(event.target as Node)) {
        setShowSlashCommandMenu(false);
      }
    };

    if (showSlashCommandMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSlashCommandMenu]);

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback((command: string) => {
    if (onSlashCommandSelect) {
      onSlashCommandSelect(command);
    }
    setShowSlashCommandMenu(false);
  }, [onSlashCommandSelect]);

  if (slashCommands.length === 0) {
    return null;
  }

  return (
    <div ref={slashCommandMenuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowSlashCommandMenu(!showSlashCommandMenu)}
        disabled={disabled || !onSlashCommandSelect}
        title={t.inputArea.slashCommands?.label || 'Slash Commands'}
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
          cursor: onSlashCommandSelect ? 'pointer' : 'default',
          opacity: onSlashCommandSelect ? 1 : 0.5,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ flexShrink: 0 }}>{t.inputArea.slashCommands?.label || 'Commands'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Dropdown menu */}
      {showSlashCommandMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            minWidth: '220px',
            maxHeight: '300px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            border: '1px solid var(--border-color, #dee2e6)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color, #dee2e6)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t.inputArea.slashCommands?.label || 'Slash Commands'}
          </div>
          {slashCommands.map((command) => (
            <button
              key={command}
              onClick={() => handleSlashCommandSelect(command)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary, #f8f9fa)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ color: '#6366f1', fontFamily: 'monospace' }}>{command}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
