/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * InputArea Component - Teams-style layout with consistent theme
 */

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import type { MessageContent } from '../../../preload/preload-types';
import { WorkspaceBrowser } from './WorkspaceBrowser';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * Permission mode type - matches SDK PermissionMode
 */
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

/**
 * Setting source type - matches SDK SettingSource
 */
type SettingSource = 'user' | 'project' | 'local';

/**
 * All available setting sources
 */
const ALL_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];

/**
 * Permission mode display config
 */
interface PermissionModeConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

/**
 * SVG icon for setting sources
 */
const SettingSourcesIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

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
};

/**
 * Get permission mode configurations (visual only, labels from i18n)
 */
const PERMISSION_MODE_CONFIGS: Record<PermissionMode, PermissionModeConfig> = {
  default: {
    icon: PermissionIcons.shield,
    color: 'var(--text-secondary)',
    bgColor: 'var(--bg-tertiary, rgba(128, 128, 128, 0.1))',
  },
  acceptEdits: {
    icon: PermissionIcons.edit,
    color: '#4caf50',
    bgColor: 'rgba(76, 175, 80, 0.12)',
  },
  bypassPermissions: {
    icon: PermissionIcons.zap,
    color: '#ff9800',
    bgColor: 'rgba(255, 152, 0, 0.12)',
  },
  plan: {
    icon: PermissionIcons.clipboard,
    color: '#2196f3',
    bgColor: 'rgba(33, 150, 243, 0.12)',
  },
  dontAsk: {
    icon: PermissionIcons.volumeX,
    color: '#9c27b0',
    bgColor: 'rgba(156, 39, 176, 0.12)',
  },
};

/**
 * All permission modes in order
 */
const PERMISSION_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'];

interface AttachedImage {
  id: string;
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for preview
}

/**
 * Context usage information for display
 */
interface ContextUsage {
  usedTokens: number;
  totalTokens: number;
  percentUsed: number;
}

interface InputAreaProps {
  sessionId?: string;
  onSend: (message: MessageContent) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
  placeholder?: string;
  templateContent?: string;
  onTemplateApplied?: () => void;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  settingSources?: SettingSource[];
  onSettingSourcesChange?: (sources: SettingSource[]) => void;
  contextUsage?: ContextUsage;
  slashCommands?: string[];
  onSlashCommandSelect?: (command: string) => void;
}

export function InputArea({
  sessionId,
  onSend,
  onCancel,
  disabled = false,
  isProcessing = false,
  placeholder = 'Type a message',
  templateContent,
  onTemplateApplied,
  permissionMode = 'default',
  onPermissionModeChange,
  settingSources = [...ALL_SETTING_SOURCES],
  onSettingSourcesChange,
  contextUsage,
  slashCommands = [],
  onSlashCommandSelect,
}: InputAreaProps) {
  const { t } = useLanguage();
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [showWorkspaceBrowser, setShowWorkspaceBrowser] = useState(false);
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const [showSettingSourcesMenu, setShowSettingSourcesMenu] = useState(false);
  const [showSlashCommandMenu, setShowSlashCommandMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const settingSourcesMenuRef = useRef<HTMLDivElement>(null);
  const slashCommandMenuRef = useRef<HTMLDivElement>(null);

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

  // Apply template content when it changes
  useEffect(() => {
    if (templateContent) {
      setMessage(templateContent);
      // Auto-expand textarea to fit content
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
        textareaRef.current.style.height = `${newHeight}px`;
      }
      // Notify parent that template was applied
      if (onTemplateApplied) {
        onTemplateApplied();
      }
    }
  }, [templateContent, onTemplateApplied]);

  const handleSend = () => {
    // Only trim for empty check, preserve original message content including newlines
    if ((!message.trim() && images.length === 0) || disabled) return;

    // Build message content
    let messageContent: MessageContent;

    if (images.length === 0) {
      // Simple text message - preserve original content
      messageContent = message;
    } else {
      // Multimodal message with images - use Anthropic native format
      const contentBlocks: MessageContent = [];

      // Add text if present (preserve original)
      if (message.trim()) {
        contentBlocks.push({ type: 'text', text: message });
      }

      // Add images using Anthropic native format
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.data,
          },
        });
      }

      messageContent = contentBlocks;
    }

    onSend(messageContent);
    setMessage('');
    setImages([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without modifiers)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-expand textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
  };

  // Format actions
  const insertFormatting = (before: string, after: string = before) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = message.substring(start, end);

    const newText =
      message.substring(0, start) +
      before + selectedText + after +
      message.substring(end);

    setMessage(newText);

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Image handling functions
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages: AttachedImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Only accept image files
      if (!file.type.startsWith('image/')) continue;

      try {
        // Read file as base64
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix to get pure base64
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Create preview URL
        const previewUrl = URL.createObjectURL(file);

        newImages.push({
          id: `${Date.now()}-${i}`,
          data: base64Data,
          mimeType: file.type,
          preview: previewUrl,
        });
      } catch (error) {
        console.error('Failed to read image file:', error);
      }
    }

    setImages([...images, ...newImages]);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const newImages: AttachedImage[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Only handle image items
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior for images

        const file = item.getAsFile();
        if (!file) continue;

        try {
          // Read file as base64
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Create preview URL
          const previewUrl = URL.createObjectURL(file);

          newImages.push({
            id: `${Date.now()}-${i}`,
            data: base64Data,
            mimeType: file.type,
            preview: previewUrl,
          });
        } catch (error) {
          console.error('Failed to read pasted image:', error);
        }
      }
    }

    if (newImages.length > 0) {
      setImages([...images, ...newImages]);
    }
  };

  const handleRemoveImage = (imageId: string) => {
    setImages(images.filter(img => {
      if (img.id === imageId) {
        // Revoke object URL to free memory
        URL.revokeObjectURL(img.preview);
        return false;
      }
      return true;
    }));
  };

  // Handle workspace file selection
  const handleWorkspacePathsSelect = (paths: string[]) => {
    if (paths.length === 0) return;

    // Insert paths into message at cursor position or at end
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const pathsText = paths.join('\n');

    // Add newline before if there's existing text and cursor is not at start
    const prefix = message && start > 0 && !message[start - 1].match(/\s/) ? '\n' : '';

    const newText =
      message.substring(0, start) +
      prefix + pathsText +
      message.substring(end);

    setMessage(newText);

    // Set cursor after inserted paths
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + pathsText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);

      // Auto-expand textarea
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }, 0);
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(img => {
        URL.revokeObjectURL(img.preview);
      });
    };
  }, [images]);

  return (
    <div className="input-area-modern">
      {/* Workspace Browser Modal */}
      {showWorkspaceBrowser && sessionId && (
        <WorkspaceBrowser
          sessionId={sessionId}
          onSelect={handleWorkspacePathsSelect}
          onClose={() => setShowWorkspaceBrowser(false)}
        />
      )}

      {/* Toolbar - minimal like Teams */}
      <div className="input-toolbar">
        <div className="toolbar-left">
          <button
            className="toolbar-btn"
            onClick={() => setShowWorkspaceBrowser(true)}
            title="Browse Workspace Files"
            disabled={disabled || !sessionId}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => insertFormatting('**')}
            title="Bold"
            disabled={disabled}
          >
            <strong>B</strong>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => insertFormatting('*')}
            title="Italic"
            disabled={disabled}
          >
            <em>I</em>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => insertFormatting('`')}
            title="Code"
            disabled={disabled}
          >
            {'</>'}
          </button>
        </div>
        <button
          className="toolbar-btn"
          onClick={() => setMessage('')}
          title="Clear"
          disabled={disabled}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      {/* Hidden file input for image selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleImageSelect}
      />

      {/* Input container with send button */}
      <div className="input-container">
        <div className="input-text-area">
          <textarea
            ref={textareaRef}
            className="input-textarea-modern"
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            style={{
              minHeight: '60px',
              resize: 'none',
            }}
          />
        </div>
        <div className="input-actions" style={{ justifyContent: 'space-between' }}>
          {/* Left side - Permission mode and Setting sources dropdowns */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Permission mode dropdown */}
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
                  backgroundColor: 'var(--bg-primary, #ffffff)',
                  border: '1px solid var(--border-color, #dee2e6)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color, #dee2e6)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
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

            {/* Setting sources dropdown */}
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
                  color: settingSources.length === ALL_SETTING_SOURCES.length ? 'var(--text-secondary)' : '#2196f3',
                  backgroundColor: settingSources.length === ALL_SETTING_SOURCES.length ? 'var(--bg-tertiary, rgba(128, 128, 128, 0.1))' : 'rgba(33, 150, 243, 0.12)',
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
                    backgroundColor: 'var(--bg-primary, #ffffff)',
                    border: '1px solid var(--border-color, #dee2e6)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 1000,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color, #dee2e6)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                          if (!isDisabled) e.currentTarget.style.backgroundColor = 'var(--bg-secondary, #f8f9fa)';
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
                          border: `1.5px solid ${isSelected ? '#2196f3' : 'var(--border-color, #dee2e6)'}`,
                          backgroundColor: isSelected ? '#2196f3' : 'transparent',
                          flexShrink: 0,
                        }}>
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: isSelected ? '#2196f3' : 'var(--text-primary)', marginBottom: '2px' }}>
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

            {/* Slash commands dropdown */}
            {slashCommands.length > 0 && (
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
            )}

            {/* Context usage indicator */}
            {contextUsage && (
              <div
                title={`${contextUsage.usedTokens.toLocaleString()} / ${contextUsage.totalTokens.toLocaleString()} tokens`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: contextUsage.percentUsed >= 90 ? '#ef4444' : contextUsage.percentUsed >= 75 ? '#f59e0b' : 'var(--text-secondary)',
                  backgroundColor: contextUsage.percentUsed >= 90 ? 'rgba(239, 68, 68, 0.12)' : contextUsage.percentUsed >= 75 ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-tertiary, rgba(128, 128, 128, 0.1))',
                  borderRadius: '4px',
                }}
              >
                {/* Progress bar */}
                <div style={{
                  width: '40px',
                  height: '4px',
                  backgroundColor: 'var(--border-color, rgba(128, 128, 128, 0.3))',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, contextUsage.percentUsed)}%`,
                    height: '100%',
                    backgroundColor: contextUsage.percentUsed >= 90 ? '#ef4444' : contextUsage.percentUsed >= 75 ? '#f59e0b' : '#10b981',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <span>{contextUsage.percentUsed}%</span>
              </div>
            )}
          </div>

          {/* Right side - Upload and Send buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="toolbar-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload Image"
              disabled={disabled}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
            {isProcessing ? (
              <button
                className="toolbar-btn cancel-btn"
                onClick={onCancel}
                title="Cancel Request"
                style={{
                  backgroundColor: 'var(--error, #dc3545)',
                  color: 'white',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              </button>
            ) : (
              <button
                className="toolbar-btn send-btn"
                onClick={handleSend}
                disabled={disabled}
                title="Send (Enter)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Image previews - below input area */}
      {images.length > 0 && (
        <div className="image-previews" style={{
          display: 'flex',
          gap: '8px',
          padding: '8px',
          flexWrap: 'wrap',
          backgroundColor: 'var(--bg-secondary, #f8f9fa)',
          borderTop: '1px solid var(--border-color, #dee2e6)',
          borderRadius: '0 0 8px 8px',
        }}>
          {images.map(img => (
            <div key={img.id} style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid var(--border-color, #dee2e6)',
              backgroundColor: 'white',
            }}>
              <img
                src={img.preview}
                alt="Preview"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <button
                onClick={() => handleRemoveImage(img.id)}
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  padding: 0,
                  lineHeight: 1,
                }}
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
