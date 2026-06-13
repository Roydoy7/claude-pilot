/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Contract tests for the shared IPC channel constants. Verifies that every
 * channel in `IpcChannels` has exactly one handler registration in
 * `ipc-handlers.ts` (or, for main->renderer push events, is sent via
 * `webContents.send`), and that preload exposes every channel to the
 * renderer (via `invokeChannel` or `ipcRenderer.on`).
 *
 * This is a source-text contract test rather than a runtime one: importing
 * `ipc-handlers.ts` would pull in the real `electron` module, which is not
 * available under vitest's node environment.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IpcChannels } from './ipc-channels.js';

interface ChannelEntry {
  accessPath: string[];
  channelName: string;
}

function flattenChannels(node: unknown, prefix: string[] = []): ChannelEntry[] {
  if (typeof node === 'string') {
    return [{ accessPath: prefix, channelName: node }];
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) => flattenChannels(value, [...prefix, key]));
  }
  return [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) || []).length;
}

// agent:streamEvent and agent:toolApprovalRequest are main->renderer push
// events (webContents.send / ipcRenderer.on), not invoke/handle channels.
const PUSH_EVENT_CHANNELS = new Set(['agent.streamEvent', 'agent.toolApprovalRequest']);

// The `skills` channels are reached via preload's generic, untyped
// `invoke(channel, ...args)` escape hatch rather than `invokeChannel`, so
// they have no per-channel preload exposure to verify.
const GENERIC_INVOKE_GROUPS = new Set(['skills']);

const ipcHandlersSrc = readFileSync(
  path.resolve(__dirname, '../gui/main/ipc-handlers.ts'),
  'utf-8'
);
const preloadSrc = readFileSync(path.resolve(__dirname, '../gui/preload/preload.ts'), 'utf-8');

const channels = flattenChannels(IpcChannels);

describe('IpcChannels contract', () => {
  it('has at least one channel to verify', () => {
    expect(channels.length).toBeGreaterThan(0);
  });

  for (const { accessPath, channelName } of channels) {
    const accessExpr = `IpcChannels.${accessPath.join('.')}`;
    const escapedAccessExpr = escapeRegExp(accessExpr);
    const isPushEvent = PUSH_EVENT_CHANNELS.has(accessPath.join('.'));

    if (isPushEvent) {
      it(`${channelName}: ipc-handlers.ts sends it via webContents.send`, () => {
        const pattern = new RegExp(`webContents\\.send\\(\\s*${escapedAccessExpr}\\b`, 'g');
        expect(countMatches(ipcHandlersSrc, pattern)).toBeGreaterThanOrEqual(1);
      });

      it(`${channelName}: preload subscribes via ipcRenderer.on`, () => {
        const pattern = new RegExp(`ipcRenderer\\.on\\(\\s*${escapedAccessExpr}\\b`, 'g');
        expect(countMatches(preloadSrc, pattern)).toBe(1);
      });
    } else {
      it(`${channelName}: has exactly one handleIpc registration`, () => {
        const pattern = new RegExp(`handleIpc\\(\\s*${escapedAccessExpr}\\b`, 'g');
        expect(countMatches(ipcHandlersSrc, pattern)).toBe(1);
      });

      if (!GENERIC_INVOKE_GROUPS.has(accessPath[0])) {
        it(`${channelName}: preload exposes it via invokeChannel`, () => {
          const pattern = new RegExp(`invokeChannel\\(\\s*${escapedAccessExpr}\\b`, 'g');
          expect(countMatches(preloadSrc, pattern)).toBe(1);
        });
      }
    }
  }
});
