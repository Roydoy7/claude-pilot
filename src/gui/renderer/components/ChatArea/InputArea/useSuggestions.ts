/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * useSuggestions - Loads the user's saved prompt templates for the
 * "Quick Prompts" popup, and manages the popup's open state.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export function useSuggestions() {
  const [showPromptsMenu, setShowPromptsMenu] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<{ id: string; name: string; content: string }[]>([]);
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

  // Load templates when menu opens
  useEffect(() => {
    if (showPromptsMenu) {
      loadPromptTemplates();
    }
  }, [showPromptsMenu, loadPromptTemplates]);

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
  };
}
