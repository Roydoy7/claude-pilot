/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Template Editor Modal - Rich Markdown editor for prompt templates
 */

import { useState, useEffect, useRef, type JSX } from 'react';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface TemplateEditorModalProps {
  template: PromptTemplate | null;
  isNew?: boolean; // Whether this is a new template being created
  onClose: () => void;
  onSave: (id: string, name: string, content: string) => Promise<void>;
  onCreate?: (name: string, content: string) => Promise<void>; // For creating new templates
}

export function TemplateEditorModal({ template, isNew, onClose, onSave, onCreate }: TemplateEditorModalProps) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setContent(template.content);
    } else if (isNew) {
      setName('');
      setContent('');
    } else {
      setName('');
      setContent('');
    }
  }, [template, isNew]);

  const handleSave = async () => {
    if (!name.trim()) return;

    // Don't save if content is empty for new templates
    if (isNew && !content.trim()) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      if (isNew && onCreate) {
        await onCreate(name, content);
      } else if (template) {
        await onSave(template.id, name, content);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const insertMarkdown = (before: string, after: string = '') => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const newContent =
      content.substring(0, start) +
      before + selectedText + after +
      content.substring(end);

    setContent(newContent);

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  if (!template && !isNew) return null;

  return (
    <div className="modal-overlay" onKeyDown={handleKeyDown}>
      <div
        className="modal"
        style={{ width: '80%', maxWidth: '900px', height: '80%', maxHeight: '700px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h3 className="modal-title">{isNew ? 'New Template' : 'Edit Template'}</h3>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '20px' }}>
            ×
          </button>
        </div>

        {/* Name input */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name..."
            className="form-input"
            style={{ width: '100%' }}
          />
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: '8px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            className={showPreview ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? '📝 Edit' : '👁 Preview'}
          </button>

          {!showPreview && (
            <>
              <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }} />

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('**', '**')}
                title="Bold" style={{ fontWeight: 'bold' }}
              >
                B
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('*', '*')}
                title="Italic" style={{ fontStyle: 'italic' }}
              >
                I
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('`', '`')}
                title="Inline Code" style={{ fontFamily: 'var(--font-mono)' }}
              >
                {'</>'}
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('```\n', '\n```')}
                title="Code Block"
              >
                {'{ }'}
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('[', '](url)')}
                title="Link"
              >
                🔗
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('- ', '')}
                title="Bullet List"
              >
                •
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('1. ', '')}
                title="Numbered List"
              >
                1.
              </button>

              <button
                className="editor-tool-btn"
                onClick={() => insertMarkdown('# ', '')}
                title="Heading" style={{ fontWeight: 'bold' }}
              >
                H
              </button>
            </>
          )}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {!showPreview ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your prompt template content here...

Supports Markdown:
- **bold**, *italic*
- # Headers
- - Lists
- ```code blocks```
- [links](url)"
              style={{
                width: '100%',
                height: '100%',
                padding: '16px 20px',
                fontSize: '14px',
                lineHeight: '1.6',
                backgroundColor: 'var(--bg-primary)',
                border: 'none',
                color: 'var(--text-primary)',
                resize: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                padding: '16px 20px',
                fontSize: '14px',
                lineHeight: '1.6',
                overflowY: 'auto',
                color: 'var(--text-primary)',
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  p: ({ children }) => <p style={{ margin: '0.5em 0' }}>{children}</p>,
                  code: ({ node, className, children, ...props }: JSX.IntrinsicElements['code'] & ExtraProps) => {
                    const inline = !className;
                    return !inline ? (
                      <pre
                        className={className}
                        style={{
                          margin: '0.5em 0',
                          padding: '12px',
                          borderRadius: '4px',
                          overflow: 'auto',
                          backgroundColor: 'var(--bg-tertiary)',
                        }}
                      >
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code
                        className={className}
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          padding: '0.125em 0.25em',
                          borderRadius: '3px',
                          fontSize: '0.9em',
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content || '*No content yet*'}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
