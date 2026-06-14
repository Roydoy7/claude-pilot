/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SamplePrompts - Rotating, fade-animated example of what the selected
 * agent can do, sourced from the agent's prompts.md
 */

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext.js';

interface SamplePromptsProps {
  prompts: string[];
  onPromptClick: (prompt: string) => void;
}

const ROTATE_INTERVAL_MS = 4000;
const FADE_DURATION_MS = 300;

export function SamplePrompts({ prompts, onPromptClick }: SamplePromptsProps): React.ReactElement | null {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Reset to the first prompt whenever the prompt list changes (e.g. role switch)
  useEffect(() => {
    setIndex(0);
    setVisible(true);
  }, [prompts]);

  // Rotate through prompts, fading out before swapping and fading back in
  useEffect(() => {
    if (prompts.length <= 1) {
      return;
    }

    let fadeTimeout: ReturnType<typeof setTimeout>;
    const rotateInterval = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((current) => (current + 1) % prompts.length);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, ROTATE_INTERVAL_MS);

    return () => {
      clearInterval(rotateInterval);
      clearTimeout(fadeTimeout);
    };
  }, [prompts.length]);

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="sample-prompt">
      <span className="sample-prompt-icon">💡</span>
      <span
        className="sample-prompt-text"
        data-visible={visible}
        title={t.sessionConfig.tryAsking}
        onClick={(event) => {
          event.stopPropagation();
          onPromptClick(prompts[index]);
        }}
      >
        {prompts[index]}
      </span>
    </div>
  );
}

export default SamplePrompts;
