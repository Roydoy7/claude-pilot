/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * WorkspaceBrowserModal - Wraps WorkspaceBrowser, only rendering it while
 * open and a session/cwd is available to browse.
 */

import { WorkspaceBrowser } from '../WorkspaceBrowser';

interface WorkspaceBrowserModalProps {
  show: boolean;
  sessionId?: string;
  cwd?: string;
  onSelect: (paths: string[]) => void;
  onClose: () => void;
}

export function WorkspaceBrowserModal({ show, sessionId, cwd, onSelect, onClose }: WorkspaceBrowserModalProps) {
  if (!show || (!sessionId && !cwd)) {
    return null;
  }

  return (
    <WorkspaceBrowser
      sessionId={sessionId}
      cwd={cwd}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
