/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Browser IPC Handlers - Controls the embedded webview from main process
 */

import { ipcMain, webContents, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { ChannelMap } from '../../shared/ipc-channels.js';
import { IpcChannels } from '../../shared/ipc-channels.js';

export interface BrowserTabDescriptor {
  id: number;
  webContentsId: number | null;
  title: string;
  url: string;
}

export interface BrowserCommand {
  type: 'switch' | 'new' | 'close';
  tabId?: number;
  url?: string;
}

let browserWebContentsId: number | null = null;
let browserTabs: BrowserTabDescriptor[] = [];
let activeTabId: number | null = null;
let appWindow: BrowserWindow | null = null;

function handleIpc<C extends keyof ChannelMap>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: ChannelMap[C]['args']
  ) => ChannelMap[C]['result'] | Promise<ChannelMap[C]['result']>
): void {
  ipcMain.handle(channel, handler);
}

function getBrowserWebContents(): Electron.WebContents | null {
  if (browserWebContentsId === null) return null;
  return webContents.fromId(browserWebContentsId) ?? null;
}

export function setBrowserWebContentsId(id: number): void {
  browserWebContentsId = id;
}

export function getBrowserWebContentsIdValue(): number | null {
  return browserWebContentsId;
}

export function getBrowserTabsState(): { tabs: BrowserTabDescriptor[]; activeTabId: number | null } {
  return { tabs: browserTabs, activeTabId };
}

/**
 * Sends a tab command (switch/new/close) to the renderer's browser pane.
 * Returns false if the app window is gone.
 */
export function sendBrowserCommand(command: BrowserCommand): boolean {
  if (!appWindow || appWindow.isDestroyed()) return false;
  appWindow.webContents.send('browser:command', command);
  return true;
}

/**
 * Returns the browser pane's WebContents, asking the renderer to open the
 * Browser tab first if the webview does not exist yet. Waits up to
 * `timeoutMs` for the webview to register itself after the show request.
 */
export async function ensureBrowserWebContents(timeoutMs = 5000): Promise<Electron.WebContents | null> {
  const existing = getBrowserWebContents();
  if (existing) return existing;

  if (!appWindow || appWindow.isDestroyed()) return null;
  appWindow.webContents.send('browser:show');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const wc = getBrowserWebContents();
    if (wc) return wc;
  }
  return null;
}

export function registerBrowserIpcHandlers(window: BrowserWindow): void {
  appWindow = window;
  handleIpc(IpcChannels.browser.navigate, async (_event, url) => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false, error: 'Browser not available' };
    try {
      await wc.loadURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  handleIpc(IpcChannels.browser.goBack, async () => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false };
    wc.goBack();
    return { success: true };
  });

  handleIpc(IpcChannels.browser.goForward, async () => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false };
    wc.goForward();
    return { success: true };
  });

  handleIpc(IpcChannels.browser.reload, async () => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false };
    wc.reload();
    return { success: true };
  });

  handleIpc(IpcChannels.browser.screenshot, async () => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false, error: 'Browser not available' };
    try {
      const image = await wc.capturePage();
      const data = image.toPNG().toString('base64');
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  handleIpc(IpcChannels.browser.getContent, async (_event, selector) => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false, error: 'Browser not available' };
    try {
      const code = selector
        ? `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`
        : `document.body.innerText`;
      const content = await wc.executeJavaScript(code) as string;
      return { success: true, content };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  handleIpc(IpcChannels.browser.click, async (_event, x, y) => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false, error: 'Browser not available' };
    try {
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  handleIpc(IpcChannels.browser.type, async (_event, text) => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false, error: 'Browser not available' };
    try {
      for (const char of text) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: char });
        wc.sendInputEvent({ type: 'char', keyCode: char });
        wc.sendInputEvent({ type: 'keyUp', keyCode: char });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  handleIpc(IpcChannels.browser.executeJS, async (_event, code) => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false, error: 'Browser not available' };
    try {
      const result = await wc.executeJavaScript(code);
      return { success: true, result: String(result) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  handleIpc(IpcChannels.browser.getUrl, async () => {
    const wc = getBrowserWebContents();
    if (!wc) return { success: false };
    return { success: true, url: wc.getURL() };
  });

  // Renderer syncs the full tab list (with WebContents IDs) whenever it changes
  ipcMain.handle('browser:register-tabs', (_event, tabs: BrowserTabDescriptor[], active: number) => {
    browserTabs = tabs;
    activeTabId = active;
    const activeTab = tabs.find((tab) => tab.id === active);
    browserWebContentsId = activeTab?.webContentsId ?? null;
  });
}
