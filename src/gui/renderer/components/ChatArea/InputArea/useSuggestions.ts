/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * useSuggestions - Loads prompt templates and smart (role-based) suggestions
 * for the "Quick Prompts" popup, and manages the popup's open state.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Language, PromptSuggestion } from '../../../../preload/preload-types';
import type { RoleType } from '../../../../../core/roles/role-enum.js';

export function useSuggestions(role: RoleType | undefined, language: Language) {
  const [showPromptsMenu, setShowPromptsMenu] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<{ id: string; name: string; content: string }[]>([]);
  const [smartSuggestions, setSmartSuggestions] = useState<PromptSuggestion[]>([]);
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false);
  const promptsMenuRef = useRef<HTMLDivElement>(null);

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
      const suggestions = await window.electronAPI.suggestions.getDefaults(role, language);
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
      const result = await window.electronAPI.suggestions.refresh(role, language);
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

  return {
    showPromptsMenu,
    setShowPromptsMenu,
    promptsMenuRef,
    promptTemplates,
    smartSuggestions,
    isRefreshingSuggestions,
    refreshSmartSuggestions,
  };
}
