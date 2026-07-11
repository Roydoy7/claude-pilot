/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SettingSourcesToggle - Dropdown to toggle which setting sources
 * (user/project/local) are loaded for the session.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';

/**
 * Setting source type - matches SDK SettingSource
 */
export type SettingSource = 'user' | 'project' | 'local';

/**
 * All available setting sources
 */
export const ALL_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];

/**
 * SVG icon for setting sources
 */
const SettingSourcesIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

interface SettingSourcesToggleProps {
  settingSources: SettingSource[];
  onSettingSourcesChange?: (sources: SettingSource[]) => void;
  disabled?: boolean;
}

export function SettingSourcesToggle({ settingSources, onSettingSourcesChange, disabled = false }: SettingSourcesToggleProps) {
  const { t } = useLanguage();
  const [showSettingSourcesMenu, setShowSettingSourcesMenu] = useState(false);
  const settingSourcesMenuRef = useRef<HTMLDivElement>(null);

  // Close setting sources menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingSourcesMenuRef.current && !settingSourcesMenuRef.current.contains(event.target as Node)) {
        setShowSettingSourcesMenu(false);
      }
    };

    if (showSettingSourcesMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingSourcesMenu]);

  // Handle setting source toggle
  const handleSettingSourceToggle = useCallback((source: SettingSource) => {
    if (!onSettingSourcesChange) return;

    const isSelected = settingSources.includes(source);
    let newSources: SettingSource[];

    if (isSelected) {
      // Don't allow deselecting all sources - keep at least one
      if (settingSources.length <= 1) return;
      newSources = settingSources.filter(s => s !== source);
    } else {
      newSources = [...settingSources, source];
    }

    onSettingSourcesChange(newSources);
  }, [settingSources, onSettingSourcesChange]);

  // Get localized setting source info
  const getSettingSourceInfo = useCallback((source: SettingSource) => {
    const sourceTranslations = t.inputArea.settingSources?.sources;
    return sourceTranslations?.[source] || { name: source, description: '' };
  }, [t]);

  return (
    <div ref={settingSourcesMenuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowSettingSourcesMenu(!showSettingSourcesMenu)}
        disabled={disabled || !onSettingSourcesChange}
        title={t.inputArea.settingSources?.label || 'Setting Sources'}
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
          color: settingSources.length === ALL_SETTING_SOURCES.length ? 'var(--text-secondary)' : 'var(--accent)',
          backgroundColor: settingSources.length === ALL_SETTING_SOURCES.length ? 'var(--bg-tertiary)' : 'rgba(33, 150, 243, 0.12)',
          border: 'none',
          borderRadius: '4px',
          cursor: onSettingSourcesChange ? 'pointer' : 'default',
          opacity: onSettingSourcesChange ? 1 : 0.5,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{SettingSourcesIcon}</span>
        <span style={{ flexShrink: 0 }}>{settingSources.length}/{ALL_SETTING_SOURCES.length}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Dropdown menu */}
      {showSettingSourcesMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            minWidth: '280px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t.inputArea.settingSources?.label || 'Setting Sources'}
          </div>
          {ALL_SETTING_SOURCES.map((source) => {
            const sourceInfo = getSettingSourceInfo(source);
            const isSelected = settingSources.includes(source);
            const isDisabled = isSelected && settingSources.length <= 1;
            return (
              <button
                key={source}
                onClick={() => handleSettingSourceToggle(source)}
                disabled={isDisabled}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: isDisabled ? 0.5 : 1,
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                }}>
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: isSelected ? 'var(--accent)' : 'var(--text-primary)', marginBottom: '2px' }}>
                    {sourceInfo.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {sourceInfo.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
