/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * useWorkspaceBrowser - Manages the workspace file browser's open state and
 * inserts the paths it returns into the message textarea.
 */

import { useState, type RefObject } from 'react';

interface UseWorkspaceBrowserParams {
  message: string;
  setMessage: (message: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  currentMaxHeight: number;
}

export function useWorkspaceBrowser({ message, setMessage, textareaRef, currentMaxHeight }: UseWorkspaceBrowserParams) {
  const [showWorkspaceBrowser, setShowWorkspaceBrowser] = useState(false);

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
      const newHeight = Math.min(textarea.scrollHeight, currentMaxHeight);
      textarea.style.height = `${newHeight}px`;
    }, 0);
  };

  return {
    showWorkspaceBrowser,
    openWorkspaceBrowser: () => setShowWorkspaceBrowser(true),
    closeWorkspaceBrowser: () => setShowWorkspaceBrowser(false),
    handleWorkspacePathsSelect,
  };
}
