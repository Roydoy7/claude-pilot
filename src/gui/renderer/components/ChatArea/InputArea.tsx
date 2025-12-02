/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * InputArea Component - Teams-style layout with consistent theme
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import type { MessageContent } from '../../../preload/preload-types';
import { WorkspaceBrowser } from './WorkspaceBrowser';

interface AttachedImage {
  id: string;
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for preview
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
}: InputAreaProps) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [showWorkspaceBrowser, setShowWorkspaceBrowser] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const trimmed = message.trim();
    if ((!trimmed && images.length === 0) || disabled) return;

    // Build message content
    let messageContent: MessageContent;

    if (images.length === 0) {
      // Simple text message
      messageContent = trimmed;
    } else {
      // Multimodal message with images
      // Use LangChain standard 'image_url' format for cross-provider compatibility
      // This format works with OpenAI, Anthropic/Claude, Google Gemini, and other providers
      const contentBlocks: any[] = [];

      // Add text if present
      if (trimmed) {
        contentBlocks.push({ type: 'text', text: trimmed });
      }

      // Add images using standard 'image_url' format
      // Each provider's LangChain implementation will convert this to their native format
      for (const img of images) {
        contentBlocks.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${img.data}`
          }
        });
      }

      messageContent = contentBlocks as MessageContent;
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
        <div className="input-actions">
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
