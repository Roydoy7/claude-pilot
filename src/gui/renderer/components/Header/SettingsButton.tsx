/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Settings Button Component
 */

interface SettingsButtonProps {
  onClick?: () => void;
}

export function SettingsButton({ onClick }: SettingsButtonProps) {
  return (
    <button
      className="icon-button"
      onClick={onClick}
      aria-label="Settings"
      title="Settings"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 1v6m0 6v6m-5-11.66l3 3m0 6l3 3m-11.66-5l3-3m6 0l3 3M1 12h6m6 0h6"></path>
      </svg>
    </button>
  );
}
