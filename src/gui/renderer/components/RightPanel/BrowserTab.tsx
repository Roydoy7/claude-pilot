/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * BrowserTab Component - Embedded multi-tab browser pane using Electron webview
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface WebviewElement extends HTMLElement {
  src: string;
  goBack(): void;
  goForward(): void;
  reload(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getWebContentsId(): number;
}

interface BrowserTabInfo {
  id: number;
  title: string;
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const HOME_URL = 'https://www.google.com';

export function BrowserTab() {
  const { t } = useLanguage();
  const [tabs, setTabs] = useState<BrowserTabInfo[]>([]);
  const [activeId, setActiveId] = useState<number>(0);
  const [inputUrl, setInputUrl] = useState(HOME_URL);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewsRef = useRef(new Map<number, WebviewElement>());
  const readyRef = useRef(new Set<number>());
  const wcIdsRef = useRef(new Map<number, number>());
  const [syncTick, setSyncTick] = useState(0);
  const nextIdRef = useRef(1);
  const activeIdRef = useRef(0);
  const tabsRef = useRef<BrowserTabInfo[]>([]);
  const initializedRef = useRef(false);

  activeIdRef.current = activeId;
  tabsRef.current = tabs;

  const updateTab = useCallback((id: number, patch: Partial<BrowserTabInfo>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)));
  }, []);


  const createTab = useCallback((url: string) => {
    const container = containerRef.current;
    if (!container) return;
    const id = nextIdRef.current++;

    const wv = document.createElement('webview') as unknown as WebviewElement;
    wv.setAttribute('src', url);
    wv.setAttribute('partition', 'persist:browser-pane');
    wv.className = 'browser-webview';
    container.appendChild(wv);
    webviewsRef.current.set(id, wv);

    wv.addEventListener('dom-ready', () => {
      readyRef.current.add(id);
      try {
        wcIdsRef.current.set(id, wv.getWebContentsId());
      } catch { /* not attached yet */ }
      setSyncTick((n) => n + 1);
    });

    wv.addEventListener('did-start-loading', () => updateTab(id, { isLoading: true }));

    wv.addEventListener('did-stop-loading', () => {
      const patch: Partial<BrowserTabInfo> = { isLoading: false };
      try {
        patch.canGoBack = wv.canGoBack();
        patch.canGoForward = wv.canGoForward();
      } catch { /* not attached yet */ }
      updateTab(id, patch);
    });

    wv.addEventListener('page-title-updated', (e: Event) => {
      const title = (e as Event & { title: string }).title;
      if (title) updateTab(id, { title });
    });

    const onNavigate = (e: Event) => {
      const url = (e as Event & { url: string }).url;
      const patch: Partial<BrowserTabInfo> = {};
      if (url) patch.url = url;
      try {
        patch.canGoBack = wv.canGoBack();
        patch.canGoForward = wv.canGoForward();
      } catch { /* not attached yet */ }
      updateTab(id, patch);
      if (url && activeIdRef.current === id) setInputUrl(url);
    };
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);

    setTabs((prev) => [
      ...prev,
      { id, title: url, url, isLoading: true, canGoBack: false, canGoForward: false },
    ]);
    setActiveId(id);
    setInputUrl(url);
  }, [updateTab]);

  const closeTab = useCallback((id: number) => {
    const wv = webviewsRef.current.get(id);
    if (wv) wv.remove();
    webviewsRef.current.delete(id);
    readyRef.current.delete(id);
    wcIdsRef.current.delete(id);

    const prev = tabsRef.current;
    const idx = prev.findIndex((tab) => tab.id === id);
    const next = prev.filter((tab) => tab.id !== id);
    setTabs(next);

    if (next.length === 0) {
      createTab(HOME_URL);
      return;
    }
    if (activeIdRef.current === id) {
      const neighbor = next[Math.min(Math.max(idx, 0), next.length - 1)];
      setActiveId(neighbor.id);
      setInputUrl(neighbor.url);
    }
  }, [createTab]);

  const activateTab = useCallback((id: number) => {
    setActiveId(id);
    const info = tabsRef.current.find((tab) => tab.id === id);
    if (info) setInputUrl(info.url);
  }, []);

  // Create the initial tab and listen for agent-issued tab commands on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    createTab(HOME_URL);

    window.electronAPI.browser.onCommand((command) => {
      if (command.type === 'switch' && command.tabId !== undefined) {
        activateTab(command.tabId);
      } else if (command.type === 'new') {
        createTab(command.url ?? HOME_URL);
      } else if (command.type === 'close' && command.tabId !== undefined) {
        closeTab(command.tabId);
      }
    });
  }, [createTab, closeTab, activateTab]);

  // Show only the active webview and sync the tab list to the main process
  useEffect(() => {
    for (const [id, wv] of webviewsRef.current) {
      // Empty string = inherit, so the active webview still hides together
      // with the whole pane when RightPanel sets visibility:hidden on it
      wv.style.visibility = id === activeId ? '' : 'hidden';
    }
    window.electronAPI.invoke(
      'browser:register-tabs',
      tabs.map((tab) => ({
        id: tab.id,
        webContentsId: wcIdsRef.current.get(tab.id) ?? null,
        title: tab.title,
        url: tab.url,
      })),
      activeId
    );
  }, [tabs, activeId, syncTick]);

  const navigateTo = useCallback((targetUrl: string) => {
    const wv = webviewsRef.current.get(activeIdRef.current);
    if (!wv) return;
    let normalized = targetUrl.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    wv.src = normalized;
    setInputUrl(normalized);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigateTo(inputUrl);
    }
  }, [inputUrl, navigateTo]);

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const activeWebview = () => webviewsRef.current.get(activeIdRef.current);

  return (
    <div className="browser-tab">
      <div className="browser-tabstrip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="browser-tab-item"
            data-active={tab.id === activeId}
            onClick={() => activateTab(tab.id)}
            title={tab.url}
          >
            {tab.isLoading && <div className="browser-loading-indicator" />}
            <span className="browser-tab-title">{tab.title}</span>
            <button
              className="browser-tab-close"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              title={t.rightPanel.browserTab.closeTab}
              aria-label={t.rightPanel.browserTab.closeTab}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          className="browser-tab-new"
          onClick={() => createTab(HOME_URL)}
          title={t.rightPanel.browserTab.newTab}
          aria-label={t.rightPanel.browserTab.newTab}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <div className="browser-toolbar">
        <button
          className="browser-nav-btn"
          onClick={() => activeWebview()?.goBack()}
          disabled={!activeTab?.canGoBack}
          title={t.rightPanel.browserTab.back}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          className="browser-nav-btn"
          onClick={() => activeWebview()?.goForward()}
          disabled={!activeTab?.canGoForward}
          title={t.rightPanel.browserTab.forward}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <button
          className="browser-nav-btn"
          onClick={() => activeWebview()?.reload()}
          title={t.rightPanel.browserTab.reload}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
        <input
          className="browser-url-input"
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://"
        />
        <button
          className="browser-nav-btn"
          onClick={() => navigateTo(inputUrl)}
          title={t.rightPanel.browserTab.go}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        {activeTab?.isLoading && <div className="browser-loading-indicator" />}
      </div>
      <div className="browser-webview-container" ref={containerRef} />
    </div>
  );
}
