/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * InputArea Component - Teams-style layout with consistent theme
 */

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import type { MessageContent, PromptSuggestion, Language, PermissionMode } from '../../../preload/preload-types';
import type { RoleType } from '../../../../core/roles/role-enum.js';
import { WorkspaceBrowser } from './WorkspaceBrowser';
import { useLanguage } from '../../i18n/LanguageContext';

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
  // Users icon for delegate mode
  users: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
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
  delegate: {
    icon: PermissionIcons.users,
    color: '#009688',
    bgColor: 'rgba(0, 150, 136, 0.12)',
  },
};

/**
 * All permission modes in order
 */
const PERMISSION_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'delegate'];

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
  cwd?: string; // Working directory - used for @ button when sessionId is not available
  role?: RoleType; // Current role - used for smart suggestions
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
  cwd,
  role,
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
  const { t, language } = useLanguage();
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [showWorkspaceBrowser, setShowWorkspaceBrowser] = useState(false);
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const [showSettingSourcesMenu, setShowSettingSourcesMenu] = useState(false);
  const [showSlashCommandMenu, setShowSlashCommandMenu] = useState(false);
  const [showPromptsMenu, setShowPromptsMenu] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<{ id: string; name: string; content: string }[]>([]);
  const [smartSuggestions, setSmartSuggestions] = useState<PromptSuggestion[]>([]);
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Max heights for normal and expanded modes
  const maxHeightNormal = 200;
  const maxHeightExpanded = 500;
  const currentMaxHeight = isExpanded ? maxHeightExpanded : maxHeightNormal;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const settingSourcesMenuRef = useRef<HTMLDivElement>(null);
  const slashCommandMenuRef = useRef<HTMLDivElement>(null);
  const promptsMenuRef = useRef<HTMLDivElement>(null);

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

  // Load prompt templates
  const loadPromptTemplates = useCallback(async () => {
    try {
      const result = await window.electronAPI.templates.list();
      const templates = Array.isArray(result) ? result : (result as { templates?: { id: string; name: string; content: string }[] }).templates || [];
      setPromptTemplates(templates);
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
    }
  }, []);

  // Load smart suggestions
  const loadSmartSuggestions = useCallback(async () => {
    if (!role) return;
    try {
      const suggestions = await window.electronAPI.suggestions.getDefaults(role, language as Language);
      // Filter out template suggestions (only show tool/llm based ones)
      setSmartSuggestions(suggestions.filter(s => s.source !== 'template'));
    } catch (error) {
      console.error('Failed to load smart suggestions:', error);
    }
  }, [role, language]);

  // Refresh smart suggestions with LLM
  const refreshSmartSuggestions = useCallback(async () => {
    if (!role) return;
    setIsRefreshingSuggestions(true);
    try {
      const result = await window.electronAPI.suggestions.refresh(role, language as Language);
      if (result.success && result.suggestions) {
        // Filter out template suggestions
        setSmartSuggestions(result.suggestions.filter(s => s.source !== 'template'));
      }
    } catch (error) {
      console.error('Failed to refresh smart suggestions:', error);
    } finally {
      setIsRefreshingSuggestions(false);
    }
  }, [role, language]);

  // Load templates and suggestions when menu opens
  useEffect(() => {
    if (showPromptsMenu) {
      loadPromptTemplates();
      loadSmartSuggestions();
    }
  }, [showPromptsMenu, loadPromptTemplates, loadSmartSuggestions]);

  // Close prompts menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (promptsMenuRef.current && !promptsMenuRef.current.contains(event.target as Node)) {
        setShowPromptsMenu(false);
      }
    };

    if (showPromptsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPromptsMenu]);

  // Handle prompt template selection
  const handlePromptSelect = useCallback((content: string) => {
    setMessage(content);
    setShowPromptsMenu(false);
    // Auto-expand textarea to fit content
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, currentMaxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [currentMaxHeight]);

  // Apply template content when it changes
  useEffect(() => {
    if (templateContent) {
      setMessage(templateContent);
      // Auto-expand textarea to fit content
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        const newHeight = Math.min(textareaRef.current.scrollHeight, currentMaxHeight);
        textareaRef.current.style.height = `${newHeight}px`;
      }
      // Notify parent that template was applied
      if (onTemplateApplied) {
        onTemplateApplied();
      }
    }
  }, [templateContent, onTemplateApplied, currentMaxHeight]);

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
    const newHeight = Math.min(textarea.scrollHeight, currentMaxHeight);
    textarea.style.height = `${newHeight}px`;
  };

  // Toggle expanded mode
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Recalculate textarea height when expanded state changes
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;

      if (isExpanded) {
        // Expanding: set to expanded minHeight, content will auto-expand from there
        textarea.style.height = '200px';
      } else {
        // Collapsing: force reset to collapsed minHeight
        textarea.style.height = '60px';
      }
    }
  }, [isExpanded]);

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
      const newHeight = Math.min(textarea.scrollHeight, currentMaxHeight);
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
      {showWorkspaceBrowser && (sessionId || cwd) && (
        <WorkspaceBrowser
          sessionId={sessionId}
          cwd={cwd}
          onSelect={handleWorkspacePathsSelect}
          onClose={() => setShowWorkspaceBrowser(false)}
        />
      )}

      {/* Toolbar - minimal like Teams */}
      <div className="input-toolbar">
        <div className="toolbar-left">
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
          {/* Separator */}
          <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color, #dee2e6)', margin: '0 4px' }}></span>
          {/* Insert file path button - @ symbol indicates "mention/reference" */}
          <button
            className="toolbar-btn"
            onClick={() => setShowWorkspaceBrowser(true)}
            title="Insert File Path (@)"
            disabled={disabled || (!sessionId && !cwd)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* @ symbol - commonly used for mentions/references */}
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path>
            </svg>
          </button>
          {/* Prompts button */}
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
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', borderBottom: '1px solid var(--border)' }}>
                    {t.inputArea.promptsButton?.noTemplates || 'No templates yet'}
                  </div>
                ) : (
                  promptTemplates.slice(0, 4).map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handlePromptSelect(template.content)}
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

                {/* Smart Suggestions Section */}
                {role && (
                  <>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>💡</span>
                        <span>{t.suggestions?.tryThese || 'Try These'}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          refreshSmartSuggestions();
                        }}
                        disabled={isRefreshingSuggestions}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          color: 'var(--text-secondary)',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: isRefreshingSuggestions ? 'wait' : 'pointer',
                          opacity: isRefreshingSuggestions ? 0.6 : 1,
                        }}
                        title={t.suggestions?.refresh || 'Refresh'}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            animation: isRefreshingSuggestions ? 'spin 1s linear infinite' : 'none',
                          }}
                        >
                          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                          <path d="M21 3v5h-5" />
                        </svg>
                      </button>
                    </div>
                    {smartSuggestions.length === 0 ? (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {t.suggestions?.noSuggestions || 'No suggestions available'}
                      </div>
                    ) : (
                      smartSuggestions.slice(0, 6).map((suggestion) => (
                        <div
                          key={suggestion.id}
                          onClick={() => handlePromptSelect(suggestion.prompt)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--border)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span>{suggestion.icon}</span>
                            <span style={{ fontWeight: 500 }}>{suggestion.title}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {suggestion.description}
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}
          </div>
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
            rows={isExpanded ? 10 : 3}
            style={{
              minHeight: isExpanded ? '200px' : '60px',
              maxHeight: `${currentMaxHeight}px`,
              resize: 'none',
              transition: 'min-height 0.2s ease',
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

          {/* Right side - Expand, Upload and Send buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="toolbar-btn"
              onClick={toggleExpanded}
              title={isExpanded ? 'Collapse input' : 'Expand input'}
              disabled={disabled}
              style={{
                color: isExpanded ? 'var(--primary, #6366f1)' : undefined,
              }}
            >
              {isExpanded ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"></polyline>
                  <polyline points="20 10 14 10 14 4"></polyline>
                  <line x1="14" y1="10" x2="21" y2="3"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              )}
            </button>
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
            {/* Stop button - always visible, disabled when not processing */}
            <button
              className="toolbar-btn cancel-btn"
              onClick={onCancel}
              disabled={!isProcessing}
              title="Stop Response"
              style={{
                backgroundColor: isProcessing ? 'var(--error, #dc3545)' : 'var(--bg-tertiary)',
                color: isProcessing ? 'white' : 'var(--text-secondary)',
                opacity: isProcessing ? 1 : 0.5,
                cursor: isProcessing ? 'pointer' : 'not-allowed',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            </button>
            {/* Send button - always visible */}
            <button
              className="toolbar-btn send-btn"
              onClick={handleSend}
              disabled={disabled || (!message.trim() && images.length === 0)}
              title="Send (Enter)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
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
