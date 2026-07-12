/// <reference types="vite/client" />

interface Window {
  /** Set by PromptsTab while mounted; refreshes its template list. */
  __promptsTabRefresh?: () => void;
  /** Set by RightPanel while mounted; switches the active tab to "workspace". */
  __rightPanelSwitchToWorkspace?: () => void;
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      partition?: string;
      preload?: string;
      nodeintegration?: boolean;
      allowpopups?: boolean;
      ref?: React.Ref<Electron.WebviewTag>;
    };
  }
}

