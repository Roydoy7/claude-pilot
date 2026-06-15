/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * RoleExampleRotator - Rotating, fade-animated example prompt for the
 * selected agent, sourced from the agent's prompts.md
 */

import React, { useState, useEffect } from 'react';

interface RoleExampleRotatorProps {
  examples: string[];
  label: string;
  onExampleClick: (example: string) => void;
}

const ROTATE_INTERVAL_MS = 4000;
const FADE_DURATION_MS = 300;

export function RoleExampleRotator({ examples, label, onExampleClick }: RoleExampleRotatorProps): React.ReactElement | null {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Reset to the first example whenever the example list changes (e.g. role switch)
  useEffect(() => {
    setIndex(0);
    setVisible(true);
  }, [examples]);

  // Rotate through examples, fading out before swapping and fading back in
  useEffect(() => {
    if (examples.length <= 1) {
      return;
    }

    let fadeTimeout: ReturnType<typeof setTimeout>;
    const rotateInterval = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((current) => (current + 1) % examples.length);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, ROTATE_INTERVAL_MS);

    return () => {
      clearInterval(rotateInterval);
      clearTimeout(fadeTimeout);
    };
  }, [examples.length]);

  if (examples.length === 0) {
    return null;
  }

  return (
    <div className="role-example">
      <div className="role-example__label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2V17a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-1.8A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/>
          <line x1="9" y1="21" x2="15" y2="21"/>
          <line x1="10" y1="17" x2="14" y2="17"/>
        </svg>
        {label}:
      </div>
      <div className="role-example__body">
        <span
          className="role-example__text"
          data-visible={visible}
          onClick={() => onExampleClick(examples[index])}
        >
          "{examples[index]}"
        </span>
        <span className="role-example__counter">{index + 1} / {examples.length}</span>
      </div>
    </div>
  );
}

export default RoleExampleRotator;
