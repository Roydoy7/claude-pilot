/**
 * Durable, privacy-conscious lifecycle diagnostics for Claude SDK tasks.
 * Entries are JSONL so a truncated/crashed process still leaves readable data.
 */

import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../storage/storage.js';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
let warnedAboutWriteFailure = false;

export function writeAgentLifecycleLog(entry: Record<string, unknown>): void {
  try {
    const logDir = path.join(getAppDataDir(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const logPath = path.join(logDir, 'agent-lifecycle.jsonl');
    const rotatedPath = `${logPath}.1`;
    if (fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_LOG_BYTES) {
      if (fs.existsSync(rotatedPath)) {
        fs.unlinkSync(rotatedPath);
      }
      fs.renameSync(logPath, rotatedPath);
    }

    fs.appendFileSync(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch (error) {
    if (!warnedAboutWriteFailure) {
      warnedAboutWriteFailure = true;
      console.warn('[claude-agent] Unable to write lifecycle diagnostics:', error);
    }
  }
}
