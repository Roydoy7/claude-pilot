/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Storage manager - provides centralized storage paths
 */

import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Get the application data directory
 */
export function getAppDataDir(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  let appDataDir: string;

  switch (platform) {
    case 'darwin': // macOS
      appDataDir = path.join(homeDir, 'Library', 'Application Support', 'claude-pilot');
      break;
    case 'win32': // Windows
      appDataDir = path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'claude-pilot');
      break;
    default: // Linux and others
      appDataDir = path.join(process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), 'claude-pilot');
      break;
  }

  // Ensure directory exists
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }

  return appDataDir;
}

/**
 * Get the sessions directory
 */
export function getSessionsDir(): string {
  const dataDir = getAppDataDir();
  const sessionsDir = path.join(dataDir, 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  return sessionsDir;
}

/**
 * Get the agent workspace directory
 */
export function getAgentWorkspaceDir(): string {
  const dataDir = getAppDataDir();
  const workspaceDir = path.join(dataDir, 'workspace');

  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  return workspaceDir;
}

/**
 * Get the configuration directory
 */
export function getConfigDir(): string {
  const dataDir = getAppDataDir();
  const configDir = path.join(dataDir, 'config');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  return configDir;
}
