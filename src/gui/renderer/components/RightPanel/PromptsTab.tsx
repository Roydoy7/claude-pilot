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
    if (!(await window.electronAPI.dialog.confirm(t.rightPanel.promptsTab.deleteConfirm))) return;

    try {
      await window.electronAPI.templates.delete(id);
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleDeleteAll = async () => {
    if (templates.length === 0) return;
    if (!(await window.electronAPI.dialog.confirm(t.rightPanel.promptsTab.deleteAllConfirm(templates.length)))) return;

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
    <div className="prompts-tab">
      {/* Header */}
      <div className="prompts-header">
        <h3 className="tab-title">{t.rightPanel.promptsTab.title}</h3>
        <p className="panel-tab-description">
          {t.rightPanel.promptsTab.description}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="prompts-actions">
        <button
          className="btn btn-outline btn-lg prompts-new-button"
          onClick={handleNew}
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
          className="btn btn-danger-ghost btn-lg prompts-clear-button"
          onClick={handleDeleteAll}
          disabled={templates.length === 0}
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
      <div className="prompts-list-scroll">
        {templates.length > 0 ? (
          <div className="prompts-list">
            {templates.map((template) => (
              <div
                key={template.id}
                className="prompt-item"
                onClick={() => handleApply(template)}
              >
                <div className="prompt-item-copy">
                  <span className="prompt-item-name" title={template.name}>{template.name}</span>
                  <span className="prompt-item-preview">{template.content}</span>
                </div>
                <div className="prompt-item-actions">
                  <button
                    className="item-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(template);
                    }}
                    title={t.rightPanel.promptsTab.editTooltip}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button
                    className="item-action-btn danger"
                    onClick={(e) => handleDelete(template.id, e)}
                    title={t.rightPanel.promptsTab.deleteTooltip}
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
          <div className="prompts-empty">
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
