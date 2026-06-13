/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Shared helpers for Claude Agent SDK query() call sites
 * (ClaudeAgent and SuggestionsManager).
 */

import { createRequire } from 'module';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

/**
 * Get the path to the native Claude CLI binary shipped in the platform-specific
 * @anthropic-ai/claude-agent-sdk-{platform}-{arch} optional dependency.
 * In Electron asar environment, the path needs to be adjusted to use the unpacked version
 * because spawn() cannot execute a binary that lives inside an asar archive.
 */
export function resolveClaudeExecutablePath(): string {
  const require = createRequire(import.meta.url);
  const ext = process.platform === 'win32' ? '.exe' : '';
  const packageName = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  let binaryPath = require.resolve(`${packageName}/claude${ext}`);

  // In Electron asar environment, replace app.asar with app.asar.unpacked
  // because the native binary can't run from inside asar
  if (binaryPath.includes('app.asar')) {
    binaryPath = binaryPath.replace('app.asar', 'app.asar.unpacked');
  }

  return binaryPath;
}

/**
 * Build the Options fields shared by every query() call site: the resolved
 * native CLI path plus the caller's working directory and abort controller.
 */
export function buildBaseQueryOptions(
  cwd: string,
  abortController: AbortController
): Pick<Options, 'cwd' | 'abortController' | 'pathToClaudeCodeExecutable'> {
  return {
    cwd,
    abortController,
    pathToClaudeCodeExecutable: resolveClaudeExecutablePath(),
  };
}
