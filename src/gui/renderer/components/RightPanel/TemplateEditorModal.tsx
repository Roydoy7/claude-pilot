/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Template Editor Modal - Rich Markdown editor for prompt templates
 */

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '8px',
          width: '80%',
          maxWidth: '900px',
          height: '80%',
          maxHeight: '700px',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{isNew ? 'New Template' : 'Edit Template'}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0 8px',
            }}
          >
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
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
            }}
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
            onClick={() => setShowPreview(!showPreview)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              backgroundColor: showPreview ? 'var(--accent)' : 'var(--bg-secondary)',
              color: showPreview ? 'white' : 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showPreview ? '📝 Edit' : '👁 Preview'}
          </button>

          {!showPreview && (
            <>
              <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }} />

              <button
                onClick={() => insertMarkdown('**', '**')}
                title="Bold"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                B
              </button>

              <button
                onClick={() => insertMarkdown('*', '*')}
                title="Italic"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontStyle: 'italic',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                I
              </button>

              <button
                onClick={() => insertMarkdown('`', '`')}
                title="Inline Code"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {'</>'}
              </button>

              <button
                onClick={() => insertMarkdown('```\n', '\n```')}
                title="Code Block"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {'{ }'}
              </button>

              <button
                onClick={() => insertMarkdown('[', '](url)')}
                title="Link"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                🔗
              </button>

              <button
                onClick={() => insertMarkdown('- ', '')}
                title="Bullet List"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                •
              </button>

              <button
                onClick={() => insertMarkdown('1. ', '')}
                title="Numbered List"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                1.
              </button>

              <button
                onClick={() => insertMarkdown('# ', '')}
                title="Heading"
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
                fontFamily: 'monospace',
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
                  code: ({ node, className, children, ...props }: any) => {
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
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: isSaving || !name.trim() ? 'var(--bg-secondary)' : 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isSaving || !name.trim() ? 'not-allowed' : 'pointer',
              opacity: isSaving || !name.trim() ? 0.5 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
