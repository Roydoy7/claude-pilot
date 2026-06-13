/// <reference types="vite/client" />

interface Window {
  /** Set by PromptsTab while mounted; refreshes its template list. */
  __promptsTabRefresh?: () => void;
  /** Set by RightPanel while mounted; switches the active tab to "workspace". */
  __rightPanelSwitchToWorkspace?: () => void;
}
