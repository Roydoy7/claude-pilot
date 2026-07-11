/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * InputArea Component - Teams-style layout with consistent theme
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';
import type { MessageContent, PermissionMode } from '../../../../preload/preload-types';
import type { ModelInfo, EffortLevel } from '../../../../../core/providers/model-list-manager';
import { MarkdownEditor, type AttachedImage } from './MarkdownEditor';
import { PermissionModeSelector } from './PermissionModeSelector';
import { SettingSourcesToggle, type SettingSource, ALL_SETTING_SOURCES } from './SettingSourcesToggle';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ModelSelector } from './ModelSelector';
import { EffortLevelSelector } from './EffortLevelSelector';
import { SuggestionsPopup } from './SuggestionsPopup';
import { WorkspaceBrowserModal } from './WorkspaceBrowserModal';
import { useWorkspaceBrowser } from './useWorkspaceBrowser';

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
  modelName?: string;
  models?: ModelInfo[];
  onModelChange?: (model: string) => void;
  effortLevel?: EffortLevel;
  supportedEffortLevels?: EffortLevel[];
  onEffortLevelChange?: (level: EffortLevel) => void;
}

export function InputArea({
  sessionId,
  cwd,
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
  modelName = '',
  models = [],
  onModelChange,
  effortLevel,
  supportedEffortLevels = [],
  onEffortLevelChange,
}: InputAreaProps) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Max heights for normal and expanded modes
  const maxHeightNormal = 200;
  const maxHeightExpanded = 500;
  const currentMaxHeight = isExpanded ? maxHeightExpanded : maxHeightNormal;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { showWorkspaceBrowser, openWorkspaceBrowser, closeWorkspaceBrowser, handleWorkspacePathsSelect } = useWorkspaceBrowser({
    message,
    setMessage,
    textareaRef,
    currentMaxHeight,
  });

  // Handle prompt template / smart suggestion selection
  const handlePromptSelect = useCallback((content: string) => {
    setMessage(content);
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

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
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
  const handleImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
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

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
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
      <WorkspaceBrowserModal
        show={showWorkspaceBrowser}
        sessionId={sessionId}
        cwd={cwd}
        onSelect={handleWorkspacePathsSelect}
        onClose={closeWorkspaceBrowser}
      />

      <MarkdownEditor
        message={message}
        images={images}
        isExpanded={isExpanded}
        disabled={disabled}
        placeholder={placeholder}
        currentMaxHeight={currentMaxHeight}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInsertFormatting={insertFormatting}
        onClear={() => setMessage('')}
        onImageSelect={handleImageSelect}
        onRemoveImage={handleRemoveImage}
        extraToolbarButtons={
          <>
            {/* Insert file path button - @ symbol indicates "mention/reference" */}
            <button
              className="toolbar-btn"
              onClick={openWorkspaceBrowser}
              title="Insert File Path (@)"
              disabled={disabled || (!sessionId && !cwd)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {/* @ symbol - commonly used for mentions/references */}
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path>
              </svg>
            </button>
            <SuggestionsPopup onSelect={handlePromptSelect} disabled={disabled} />
          </>
        }
      >
        <div className="input-actions" style={{ justifyContent: 'space-between' }}>
          {/* Left side - Permission mode and Setting sources dropdowns */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <PermissionModeSelector
              permissionMode={permissionMode}
              onPermissionModeChange={onPermissionModeChange}
              disabled={disabled}
            />

            <SettingSourcesToggle
              settingSources={settingSources}
              onSettingSourcesChange={onSettingSourcesChange}
              disabled={disabled}
            />

            <SlashCommandMenu
              slashCommands={slashCommands}
              onSlashCommandSelect={onSlashCommandSelect}
              disabled={disabled}
            />

            <ModelSelector
              modelName={modelName}
              models={models}
              onModelChange={onModelChange}
              disabled={disabled}
            />

            <EffortLevelSelector
              effortLevel={effortLevel}
              supportedLevels={supportedEffortLevels}
              onEffortLevelChange={onEffortLevelChange}
              disabled={disabled}
            />

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
                  color: contextUsage.percentUsed >= 90 ? 'var(--error)' : contextUsage.percentUsed >= 75 ? 'var(--warning)' : 'var(--text-secondary)',
                  backgroundColor: contextUsage.percentUsed >= 90 ? 'rgba(239, 68, 68, 0.12)' : contextUsage.percentUsed >= 75 ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-tertiary)',
                  borderRadius: '4px',
                }}
              >
                {/* Progress bar */}
                <div style={{
                  width: '40px',
                  height: '4px',
                  backgroundColor: 'var(--border)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, contextUsage.percentUsed)}%`,
                    height: '100%',
                    backgroundColor: contextUsage.percentUsed >= 90 ? 'var(--error)' : contextUsage.percentUsed >= 75 ? 'var(--warning)' : 'var(--success)',
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
                color: isExpanded ? 'var(--accent)' : undefined,
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
                backgroundColor: isProcessing ? 'var(--error)' : 'var(--bg-tertiary)',
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
      </MarkdownEditor>
    </div>
  );
}
