/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * PermissionModeSelector - Dropdown to choose the agent's permission mode
 * (default / acceptEdits / bypassPermissions / plan / dontAsk / auto).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PermissionMode } from '../../../../preload/preload-types';
import { useLanguage } from '../../../i18n/LanguageContext';

/**
 * Permission mode display config
 */
interface PermissionModeConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

/**
 * SVG icons for permission modes
 */
const PermissionIcons = {
  // Shield icon for default mode
  shield: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  ),
  // Edit/pencil icon for acceptEdits mode
  edit: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  ),
  // Zap/lightning icon for YOLO mode
  zap: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  // Clipboard icon for plan mode
  clipboard: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
    </svg>
  ),
  // Volume-x icon for dontAsk mode
  volumeX: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>
  ),
  // Cpu icon for auto (model classifier) mode
  cpu: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
      <rect x="9" y="9" width="6" height="6"></rect>
      <line x1="9" y1="1" x2="9" y2="4"></line>
      <line x1="15" y1="1" x2="15" y2="4"></line>
      <line x1="9" y1="20" x2="9" y2="23"></line>
      <line x1="15" y1="20" x2="15" y2="23"></line>
      <line x1="20" y1="9" x2="23" y2="9"></line>
      <line x1="20" y1="14" x2="23" y2="14"></line>
      <line x1="1" y1="9" x2="4" y2="9"></line>
      <line x1="1" y1="14" x2="4" y2="14"></line>
    </svg>
  ),
};

/**
 * Permission mode configurations (visual only, labels from i18n)
 */
const PERMISSION_MODE_CONFIGS: Record<PermissionMode, PermissionModeConfig> = {
  default: {
    icon: PermissionIcons.shield,
    color: 'var(--text-secondary)',
    bgColor: 'var(--bg-tertiary)',
  },
  acceptEdits: {
    icon: PermissionIcons.edit,
    color: 'var(--success)',
    bgColor: 'var(--success-subtle)',
  },
  bypassPermissions: {
    icon: PermissionIcons.zap,
    color: 'var(--warning)',
    bgColor: 'var(--warning-subtle)',
  },
  plan: {
    icon: PermissionIcons.clipboard,
    color: 'var(--accent)',
    bgColor: 'var(--accent-subtle)',
  },
  dontAsk: {
    icon: PermissionIcons.volumeX,
    color: 'var(--warning)',
    bgColor: 'var(--warning-subtle)',
  },
  auto: {
    icon: PermissionIcons.cpu,
    color: 'var(--accent)',
    bgColor: 'var(--accent-subtle)',
  },
};

/**
 * All permission modes in order
 */
const PERMISSION_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'];

interface PermissionModeSelectorProps {
  permissionMode: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  disabled?: boolean;
}

export function PermissionModeSelector({ permissionMode, onPermissionModeChange, disabled = false }: PermissionModeSelectorProps) {
  const { t } = useLanguage();
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const permissionMenuRef = useRef<HTMLDivElement>(null);

  // Close permission menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (permissionMenuRef.current && !permissionMenuRef.current.contains(event.target as Node)) {
        setShowPermissionMenu(false);
      }
    };

    if (showPermissionMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPermissionMenu]);

  // Handle permission mode selection
  const handlePermissionModeSelect = useCallback((mode: PermissionMode) => {
    if (onPermissionModeChange) {
      onPermissionModeChange(mode);
    }
    setShowPermissionMenu(false);
  }, [onPermissionModeChange]);

  // Get localized mode info
  const getModeInfo = useCallback((mode: PermissionMode) => {
    const modeTranslations = t.inputArea.permissionMode.modes;
    return modeTranslations[mode];
  }, [t]);

  return (
    <div ref={permissionMenuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowPermissionMenu(!showPermissionMenu)}
        disabled={disabled || !onPermissionModeChange}
        title={getModeInfo(permissionMode).description}
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
          color: PERMISSION_MODE_CONFIGS[permissionMode].color,
          backgroundColor: PERMISSION_MODE_CONFIGS[permissionMode].bgColor,
          border: 'none',
          borderRadius: '4px',
          cursor: onPermissionModeChange ? 'pointer' : 'default',
          opacity: onPermissionModeChange ? 1 : 0.5,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{PERMISSION_MODE_CONFIGS[permissionMode].icon}</span>
        <span style={{ flexShrink: 0 }}>{getModeInfo(permissionMode).name}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Dropdown menu */}
      {showPermissionMenu && (
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
            {t.inputArea.permissionMode.label}
          </div>
          {PERMISSION_MODES.map((mode) => {
            const config = PERMISSION_MODE_CONFIGS[mode];
            const modeInfo = getModeInfo(mode);
            const isSelected = mode === permissionMode;
            return (
              <button
                key={mode}
                onClick={() => handlePermissionModeSelect(mode)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', color: config.color, flexShrink: 0 }}>
                  {config.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: isSelected ? config.color : 'var(--text-primary)', marginBottom: '2px' }}>
                    {modeInfo.name}
                    {isSelected && <span style={{ marginLeft: '6px', fontSize: '10px' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {modeInfo.description}
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
