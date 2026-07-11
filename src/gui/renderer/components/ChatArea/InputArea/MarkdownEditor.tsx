/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * MarkdownEditor - The message textarea, its formatting toolbar, and
 * attached-image previews. The actions row (permission mode, send button,
 * etc.) is rendered by the parent and passed in as `children` so it stays
 * inside the same `input-container` as the textarea.
 */

import { useState } from 'react';
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
  const [enlargedImage, setEnlargedImage] = useState<AttachedImage | null>(null);

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
          <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border)', margin: '0 4px' }}></span>
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
        {/* Image previews - inside the input box, above the textarea */}
        {images.length > 0 && (
          <div className="image-previews">
            {images.map(img => (
              <div key={img.id} className="image-preview-item">
                <img
                  src={img.preview}
                  alt="Preview"
                  className="image-preview-thumb"
                  onClick={() => setEnlargedImage(img)}
                />
                <button
                  className="image-preview-remove"
                  onClick={() => onRemoveImage(img.id)}
                  title="Remove image"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
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
            rows={isExpanded ? 10 : 2}
            style={{
              minHeight: isExpanded ? '200px' : '44px',
              maxHeight: `${currentMaxHeight}px`,
              resize: 'none',
              transition: 'min-height 0.2s ease',
            }}
          />
        </div>
        {children}
      </div>

      {/* Lightbox for enlarged image preview */}
      {enlargedImage && (
        <div className="image-preview-lightbox" onClick={() => setEnlargedImage(null)}>
          <div className="image-preview-lightbox-content">
            <img src={enlargedImage.preview} alt="Preview" />
            <button
              className="image-preview-lightbox-close"
              onClick={() => setEnlargedImage(null)}
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
