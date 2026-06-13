/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MarkdownEditor - The message textarea, its formatting toolbar, and
 * attached-image previews. The actions row (permission mode, send button,
 * etc.) is rendered by the parent and passed in as `children` so it stays
 * inside the same `input-container` as the textarea.
 */

import type { ChangeEvent, ClipboardEvent, KeyboardEvent, ReactNode, RefObject } from 'react';

export interface AttachedImage {
  id: string;
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for preview
}

interface MarkdownEditorProps {
  message: string;
  images: AttachedImage[];
  isExpanded: boolean;
  disabled?: boolean;
  placeholder?: string;
  currentMaxHeight: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInput: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onInsertFormatting: (before: string, after?: string) => void;
  onClear: () => void;
  onImageSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (imageId: string) => void;
  extraToolbarButtons?: ReactNode;
  children?: ReactNode;
}

export function MarkdownEditor({
  message,
  images,
  isExpanded,
  disabled = false,
  placeholder,
  currentMaxHeight,
  textareaRef,
  fileInputRef,
  onInput,
  onKeyDown,
  onPaste,
  onInsertFormatting,
  onClear,
  onImageSelect,
  onRemoveImage,
  extraToolbarButtons,
  children,
}: MarkdownEditorProps) {
  return (
    <>
      {/* Toolbar - minimal like Teams */}
      <div className="input-toolbar">
        <div className="toolbar-left">
          <button
            className="toolbar-btn"
            onClick={() => onInsertFormatting('**')}
            title="Bold"
            disabled={disabled}
          >
            <strong>B</strong>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => onInsertFormatting('*')}
            title="Italic"
            disabled={disabled}
          >
            <em>I</em>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => onInsertFormatting('`')}
            title="Code"
            disabled={disabled}
          >
            {'</>'}
          </button>
          {/* Separator */}
          <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color, #dee2e6)', margin: '0 4px' }}></span>
          {extraToolbarButtons}
        </div>
        <button
          className="toolbar-btn"
          onClick={onClear}
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
        onChange={onImageSelect}
      />

      {/* Input container with send button */}
      <div className="input-container">
        <div className="input-text-area">
          <textarea
            ref={textareaRef}
            className="input-textarea-modern"
            value={message}
            onChange={onInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
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
        {children}
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
                onClick={() => onRemoveImage(img.id)}
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
    </>
  );
}
