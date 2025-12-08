/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Message Component - Displays a single chat message with Markdown support
 */

import { useState, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { MessageContent, UsageMetadata } from '../../../preload/preload-types';
import { useLanguage } from '../../i18n/LanguageContext';

// Re-export UsageMetadata for consumers that import from this file
export type { UsageMetadata };

/**
 * Message data structure (simplified - no tool_calls, they are separate ToolCallItems now)
 */
export interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: MessageContent; // Supports both text and multimodal content
  usage?: UsageMetadata;
}

interface MessageProps {
  message: MessageData;
}

export const Message = memo(function Message({ message }: MessageProps) {
  const { t } = useLanguage();
  const isUser = message.role === 'user';
  const [isSaving, setIsSaving] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ data: string; mimeType: string } | null>(null);

  // Handle ESC key to close image modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewingImage) {
        setViewingImage(null);
      }
    };

    if (viewingImage) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [viewingImage]);

  // Parse multimodal content (text + images)
  let textContent = '';
  let images: Array<{ data: string; mimeType: string }> = [];

  if (typeof message.content === 'string') {
    textContent = message.content;
  } else if (Array.isArray(message.content)) {
    // Handle ContentBlock array (multimodal content)
    for (const block of message.content) {
      // Type guard for text blocks
      if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
        textContent += block.text;
      }
      // Type guard for image blocks (Claude SDK format: { type: 'image', source: { type: 'base64', media_type, data } })
      else if (block.type === 'image' && 'source' in block && block.source) {
        const source = block.source as { type: string; media_type: string; data: string };
        if (source.type === 'base64' && source.data && source.media_type) {
          images.push({
            data: source.data,
            mimeType: source.media_type,
          });
        }
      }
    }
  } else {
    // Fallback for unknown format
    textContent = JSON.stringify(message.content);
  }

  // For user messages, convert single newlines to Markdown hard breaks (two spaces + newline)
  // This ensures newlines are preserved in the rendered output
  const contentString = isUser ? textContent.replace(/\n/g, '  \n') : textContent;

  // Handle save as template
  const handleSaveAsTemplate = async () => {
    if (!contentString || contentString.trim() === '') return;

    setIsSaving(true);
    try {
      await window.electronAPI.templates.create({
        name: contentString.length > 50
          ? contentString.substring(0, 47) + '...'
          : contentString,
        content: contentString,
      });

      // Refresh templates list if PromptsTab is open
      if ((window as any).__promptsTabRefresh) {
        (window as any).__promptsTabRefresh();
      }

      // Show success feedback briefly
      setTimeout(() => setIsSaving(false), 1000);
    } catch (error) {
      console.error('Failed to save template:', error);
      setIsSaving(false);
    }
  };

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-ai'}`}>
      {/* Avatar */}
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar-icon user-avatar">
            {/* User icon - person silhouette */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        ) : (
          <div className="avatar-icon ai-avatar">
            {/* AI icon - bot/robot face */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="12" rx="2" />
              <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
              <path d="M12 2v4" />
              <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
        )}
      </div>
      <div className="message-content">
        {/* Message bubble - only show if there's content */}
        {contentString && contentString.trim() !== '' && (
          <div className="message-bubble">
            {/* Main message content */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // Custom renderers for better styling
                p: ({ children }) => <p style={{ margin: '0.5em 0' }}>{children}</p>,
                code: ({ node, className, children, ...props }: any) => {
                  const inline = !className;
                  // For block code, ReactMarkdown automatically wraps in <pre><code>
                  // We just need to style the code tag
                  return inline ? (
                    <code
                      className={className}
                      style={{
                        backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : 'var(--bg-tertiary)',
                        padding: '0.125em 0.25em',
                        borderRadius: '3px',
                        fontSize: '0.9em',
                      }}
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: isUser ? 'rgba(255,255,255,0.9)' : 'var(--accent)',
                      textDecoration: 'underline',
                    }}
                  >
                    {children}
                  </a>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>{children}</ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    style={{
                      margin: '0.5em 0',
                      padding: '0.5em 0.75em',
                      backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      border: 'none',
                    }}
                  >
                    {children}
                  </blockquote>
                ),
              }}
            >
              {contentString}
            </ReactMarkdown>

            {/* Display images if present */}
            {images.length > 0 && (
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: contentString ? '8px' : '0',
                flexWrap: 'wrap',
              }}>
                {images.map((img, index) => (
                  <img
                    key={index}
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt={`Attachment ${index + 1}`}
                    style={{
                      maxWidth: '300px',
                      maxHeight: '300px',
                      borderRadius: '8px',
                      objectFit: 'contain',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      // Open image in modal overlay
                      setViewingImage(img);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="message-footer">
          {message.usage && !isUser && (
            <div className="message-usage">
              {/* Basic token counts */}
              <span title={t.message.tokens.input}>{message.usage.input_tokens}↑</span>
              <span title={t.message.tokens.output}>{message.usage.output_tokens}↓</span>
              <span title={t.message.tokens.total}>{message.usage.total_tokens}Σ</span>

              {/* Prompt caching info - only show if cache was used or created */}
              {((message.usage.cache_read_input_tokens || 0) > 0 || (message.usage.cache_creation_input_tokens || 0) > 0) && (
                <>
                  <span style={{ margin: '0 0.25rem', color: 'var(--text-tertiary)' }}>|</span>
                  {(message.usage.cache_read_input_tokens || 0) > 0 && (
                    <span
                      title={t.message.tokens.cacheHit(message.usage.cache_read_input_tokens || 0)}
                      style={{ color: '#10b981', fontWeight: '600' }}
                    >
                      ⚡{message.usage.cache_read_input_tokens}
                    </span>
                  )}
                  {(message.usage.cache_creation_input_tokens || 0) > 0 && (
                    <span
                      title={t.message.tokens.cacheWrite(message.usage.cache_creation_input_tokens || 0)}
                      style={{ color: '#f59e0b' }}
                    >
                      📝{message.usage.cache_creation_input_tokens}
                      {/* Show TTL breakdown if available */}
                      {message.usage.cache_creation && (
                        <span style={{ fontSize: '0.75em', opacity: 0.8 }}>
                          {message.usage.cache_creation.ephemeral_5m_input_tokens ? ' (5m)' : ''}
                          {message.usage.cache_creation.ephemeral_1h_input_tokens ? ' (1h)' : ''}
                        </span>
                      )}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {/* Save as Template button - only for user messages */}
          {isUser && contentString && contentString.trim() !== '' && (
            <button
              onClick={handleSaveAsTemplate}
              disabled={isSaving}
              title={isSaving ? t.message.saved : t.message.saveAsTemplate}
              style={{
                width: '24px',
                height: '24px',
                padding: '4px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                backgroundColor: isSaving ? 'rgba(76,175,80,0.2)' : 'var(--bg-secondary)',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: 0.7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSaving ? '#4caf50' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
                e.currentTarget.style.backgroundColor = isSaving ? 'rgba(76,175,80,0.2)' : 'var(--bg-secondary)';
                e.currentTarget.style.color = isSaving ? '#4caf50' : 'var(--text-secondary)';
              }}
            >
              {isSaving ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Image modal overlay */}
      {viewingImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
          }}
          onClick={() => setViewingImage(null)}
        >
          <img
            src={`data:${viewingImage.mimeType};base64,${viewingImage.data}`}
            alt="Full size view"
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain',
              cursor: 'default',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});
