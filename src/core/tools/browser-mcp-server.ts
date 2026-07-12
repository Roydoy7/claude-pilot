/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Browser MCP Server - Provides browser automation tools to Claude Agent
 * Controls the embedded webview in the right panel via IPC
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  ensureBrowserWebContents,
  getBrowserTabsState,
  sendBrowserCommand,
} from '../../gui/main/browser-ipc-handlers.js';

function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  } as { [x: string]: unknown; content: Array<{ type: 'text'; text: string }> };
}

function imageResult(base64: string, mimeType: string) {
  return {
    content: [{ type: 'image' as const, data: base64, mimeType }],
  } as { [x: string]: unknown; content: Array<{ type: 'image'; data: string; mimeType: string }> };
}

const BROWSER_UNAVAILABLE =
  'Error: Browser pane failed to open. Ask the user to open the Browser tab in the right panel.';

function formatTabList(): string {
  const { tabs, activeTabId } = getBrowserTabsState();
  if (tabs.length === 0) return 'No tabs open.';
  return tabs
    .map((tab) => `${tab.id === activeTabId ? '* ' : '  '}[${tab.id}] ${tab.title} — ${tab.url}`)
    .join('\n');
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

export const browserMcpServer = createSdkMcpServer({
  name: 'browser',
  version: '1.0.0',
  tools: [
    tool(
      'navigate',
      'Navigate the embedded browser to a URL. Use this to open web pages for inspection or testing.',
      { url: z.string().describe('The URL to navigate to') },
      async ({ url }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        try {
          await wc.loadURL(url);
          return textResult(`Navigated to: ${wc.getURL()}`);
        } catch (err) {
          return textResult(`Navigation failed: ${String(err)}`);
        }
      }
    ),

    tool(
      'screenshot',
      'Take a screenshot of the current browser page. Returns the screenshot as an image.',
      {},
      async () => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        try {
          let image = await wc.capturePage();
          // Downscale large captures; Claude vision caps at ~1568px anyway
          const { width, height } = image.getSize();
          const maxDim = 1568;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            image = image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
          }
          const base64 = image.toJPEG(80).toString('base64');
          return imageResult(base64, 'image/jpeg');
        } catch (err) {
          return textResult(`Screenshot failed: ${String(err)}`);
        }
      }
    ),

    tool(
      'read_page',
      'Read the text content of the current browser page, or a specific element matched by a CSS selector.',
      { selector: z.string().optional().describe('CSS selector to read content from. If omitted, reads entire page text.') },
      async ({ selector }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        try {
          const code = selector
            ? `document.querySelector(${JSON.stringify(selector)})?.innerText ?? '(element not found)'`
            : `document.body.innerText`;
          const content = await wc.executeJavaScript(code) as string;
          return textResult(content);
        } catch (err) {
          return textResult(`Read failed: ${String(err)}`);
        }
      }
    ),

    tool(
      'click',
      'Click at specific coordinates in the browser page.',
      {
        x: z.number().describe('X coordinate to click'),
        y: z.number().describe('Y coordinate to click'),
      },
      async ({ x, y }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        try {
          wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
          return textResult(`Clicked at (${x}, ${y})`);
        } catch (err) {
          return textResult(`Click failed: ${String(err)}`);
        }
      }
    ),

    tool(
      'type_text',
      'Type text into the currently focused element in the browser.',
      { text: z.string().describe('Text to type into the currently focused element') },
      async ({ text }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        try {
          for (const char of text) {
            wc.sendInputEvent({ type: 'keyDown', keyCode: char });
            wc.sendInputEvent({ type: 'char', keyCode: char });
            wc.sendInputEvent({ type: 'keyUp', keyCode: char });
          }
          return textResult(`Typed: "${text}"`);
        } catch (err) {
          return textResult(`Type failed: ${String(err)}`);
        }
      }
    ),

    tool(
      'list_tabs',
      'List all open browser tabs with their IDs, titles and URLs. The active tab is marked with *.',
      {},
      async () => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        return textResult(formatTabList());
      }
    ),

    tool(
      'switch_tab',
      'Switch the browser to another tab by its ID (see list_tabs). Subsequent browser tools operate on the active tab.',
      { tab_id: z.number().describe('The ID of the tab to activate') },
      async ({ tab_id }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        const { tabs } = getBrowserTabsState();
        if (!tabs.some((tab) => tab.id === tab_id)) {
          return textResult(`Error: No tab with ID ${tab_id}.\n${formatTabList()}`);
        }
        sendBrowserCommand({ type: 'switch', tabId: tab_id });
        const ok = await waitFor(() => getBrowserTabsState().activeTabId === tab_id);
        return textResult(ok ? `Switched to tab ${tab_id}.\n${formatTabList()}` : `Failed to switch to tab ${tab_id}.`);
      }
    ),

    tool(
      'open_tab',
      'Open a new browser tab, optionally navigating to a URL, and make it the active tab.',
      { url: z.string().optional().describe('URL to open in the new tab. Defaults to the home page.') },
      async ({ url }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        const before = getBrowserTabsState().tabs.length;
        sendBrowserCommand({ type: 'new', url });
        const ok = await waitFor(() => {
          const { tabs, activeTabId } = getBrowserTabsState();
          const active = tabs.find((tab) => tab.id === activeTabId);
          return tabs.length > before && active?.webContentsId != null;
        }, 8000);
        return textResult(ok ? `Opened new tab.\n${formatTabList()}` : 'Failed to open new tab.');
      }
    ),

    tool(
      'close_tab',
      'Close a browser tab by its ID (see list_tabs). Closing the last tab opens a fresh home tab.',
      { tab_id: z.number().describe('The ID of the tab to close') },
      async ({ tab_id }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        const { tabs } = getBrowserTabsState();
        if (!tabs.some((tab) => tab.id === tab_id)) {
          return textResult(`Error: No tab with ID ${tab_id}.\n${formatTabList()}`);
        }
        sendBrowserCommand({ type: 'close', tabId: tab_id });
        const ok = await waitFor(() => !getBrowserTabsState().tabs.some((tab) => tab.id === tab_id));
        return textResult(ok ? `Closed tab ${tab_id}.\n${formatTabList()}` : `Failed to close tab ${tab_id}.`);
      }
    ),

    tool(
      'execute_js',
      'Execute JavaScript code in the browser page and return the result.',
      { code: z.string().describe('JavaScript code to execute in the browser page') },
      async ({ code }) => {
        const wc = await ensureBrowserWebContents();
        if (!wc) return textResult(BROWSER_UNAVAILABLE);
        try {
          const result = await wc.executeJavaScript(code);
          return textResult(String(result));
        } catch (err) {
          return textResult(`JS execution failed: ${String(err)}`);
        }
      }
    ),
  ],
});
