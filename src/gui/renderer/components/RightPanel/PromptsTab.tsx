/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * PromptsTab Component - Prompt template management
 */

import { useState, useEffect } from 'react';
import { TemplateEditorModal } from './TemplateEditorModal';
import { useLanguage } from '../../i18n/LanguageContext';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface PromptsTabProps {
  onApplyTemplate: (content: string) => void;
}

export function PromptsTab({ onApplyTemplate }: PromptsTabProps) {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  useEffect(() => {
    loadTemplates();

    // Expose refresh method globally
    window.__promptsTabRefresh = loadTemplates;
    return () => {
      delete window.__promptsTabRefresh;
    };
  }, []);

  const loadTemplates = async () => {
    try {
      const result = await window.electronAPI.templates.list();
      setTemplates(result);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const handleNew = () => {
    setIsCreatingNew(true);
  };

  const handleCreate = async (name: string, content: string) => {
    try {
      await window.electronAPI.templates.create({
        name,
        content,
      });
      await loadTemplates();
    } catch (error) {
      console.error('Failed to create template:', error);
      throw error;
    }
  };

  const handleCloseEditor = () => {
    setEditingTemplate(null);
    setIsCreatingNew(false);
  };

  const handleEdit = (template: PromptTemplate) => {
    setEditingTemplate(template);
  };

  const handleSave = async (id: string, name: string, content: string) => {
    try {
      await window.electronAPI.templates.update(id, { name, content });
      await loadTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
      throw error;
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t.rightPanel.promptsTab.deleteConfirm)) return;

    try {
      await window.electronAPI.templates.delete(id);
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleDeleteAll = async () => {
    if (templates.length === 0) return;
    if (!confirm(t.rightPanel.promptsTab.deleteAllConfirm(templates.length))) return;

    try {
      for (const template of templates) {
        await window.electronAPI.templates.delete(template.id);
      }
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete all templates:', error);
    }
  };

  const handleApply = (template: PromptTemplate) => {
    onApplyTemplate(template.content);
  };

  return (
    <div className="prompts-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '1rem 1rem 12px 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h3 className="tab-title" style={{ marginBottom: '8px', margin: 0 }}>{t.rightPanel.promptsTab.title}</h3>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: '1.4',
          }}
        >
          {t.rightPanel.promptsTab.description}
        </p>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 1rem', flexShrink: 0 }}>
        <button
          className="new-template-button"
          onClick={handleNew}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          {t.rightPanel.promptsTab.newTemplate}
        </button>
        <button
          onClick={handleDeleteAll}
          disabled={templates.length === 0}
          style={{
            padding: '8px 12px',
            fontSize: '13px',
            backgroundColor: 'var(--bg-secondary)',
            color: templates.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            cursor: templates.length === 0 ? 'not-allowed' : 'pointer',
            opacity: templates.length === 0 ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          {t.rightPanel.promptsTab.clearAll}
        </button>
      </div>

      {/* Template List - fills remaining space */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
        {templates.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {templates.map((template) => (
              <div
                key={template.id}
                className="prompt-item"
                onClick={() => handleApply(template)}
              >
                <span className="prompt-item-name" title={template.name}>
                  {template.name}
                </span>
                <div className="prompt-item-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(template);
                    }}
                    title={t.rightPanel.promptsTab.editTooltip}
                    style={{
                      width: '28px',
                      height: '28px',
                      padding: 0,
                      fontSize: '14px',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid transparent',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleDelete(template.id, e)}
                    title={t.rightPanel.promptsTab.deleteTooltip}
                    style={{
                      width: '28px',
                      height: '28px',
                      padding: 0,
                      fontSize: '14px',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid transparent',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#dc354520';
                      e.currentTarget.style.borderColor = '#dc354540';
                      e.currentTarget.style.color = '#dc3545';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
            }}
          >
            {t.rightPanel.promptsTab.noTemplates}
          </div>
        )}
      </div>

      {/* Template Editor Modal */}
      {(editingTemplate || isCreatingNew) && (
        <TemplateEditorModal
          template={editingTemplate}
          isNew={isCreatingNew}
          onClose={handleCloseEditor}
          onSave={handleSave}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
