/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Session manager - manages chat sessions using JSON files (Singleton)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { RoleType } from '../roles/role-enum.js';
import { getSessionsDir, getConfigDir } from '../storage/storage.js';
import { SessionPersistenceError } from '../errors.js';

export interface Session {
  id: string; //This is our local UUID session ID, created by frontend
  claudeSessionId?: string; // Claude SDK's session ID for resuming (from system init message)
  title: string;
  role: RoleType;
  modelName: string;
  cwd: string; // Current working directory for this session (aligns with SDK Options.cwd)
  additionalDirectories?: string[]; // Additional directories beyond cwd (aligns with SDK Options.additionalDirectories)
  // messages field removed - conversation history now stored in agent memory
  // SessionManager handles metadata only
  createdAt: number;
  updatedAt: number;
  deleted?: boolean; // Mark session as deleted (will be cleaned up later)

  // Session resumption metadata
  lastCheckpointId?: string; // Last SDK checkpoint/session ID
  lastResumeTimestamp?: number; // Last time session was resumed
  totalTurns?: number; // Total conversation turns in this session
}

export class SessionManager {
  private static instance: SessionManager;
  private sessionsDir: string;
  private currentSessionId: string | null = null;
  private lastCwd: string | null = null; // Remember last selected cwd
  private cwdConfigPath: string;

  private constructor() {
    this.sessionsDir = getSessionsDir();
    this.cwdConfigPath = path.join(getConfigDir(), 'last-cwd.json');
    this.loadLastCwd();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Create a new session
   */
  createSession(
    title: string,
    role: RoleType,
    modelName: string,
    cwd: string
  ): Session {
    const session: Session = {
      id: this.generateSessionId(),
      title,
      role,
      modelName,
      cwd,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Create session directory for SQLite checkpoints
    const sessionDir = path.join(this.sessionsDir, session.id);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    this.saveSession(session);
    this.saveLastCwd(cwd); // Remember this cwd for next session
    this.currentSessionId = session.id;
    return session;
  }

  /**
   * Load a session by ID
   */
  loadSession(sessionId: string): Session | null {
    try {
      const sessionDir = path.join(this.sessionsDir, sessionId);
      const filePath = path.join(sessionDir, 'session.json');

      if (!fs.existsSync(filePath)) return null;

      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as Session;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save a session metadata to session.json
   */
  saveSession(session: Session): void {
    try {
      const sessionDir = path.join(this.sessionsDir, session.id);
      const filePath = path.join(sessionDir, 'session.json');

      // Ensure directory exists
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save session ${session.id}:`, error);
      throw new SessionPersistenceError(`Failed to save session ${session.id}`, 'SESSION_SAVE_FAILED', error);
    }
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    try {
      const directories = fs.readdirSync(this.sessionsDir);
      const sessions = directories
        .filter((dir) => {
          const sessionJsonPath = path.join(this.sessionsDir, dir, 'session.json');
          return fs.existsSync(sessionJsonPath);
        })
        .map((dir) => {
          try {
            const sessionJsonPath = path.join(this.sessionsDir, dir, 'session.json');
            const data = fs.readFileSync(sessionJsonPath, 'utf-8');
            return JSON.parse(data) as Session;
          } catch {
            return null;
          }
        })
        .filter((s): s is Session => s !== null);

      // Filter out deleted sessions and clean them up
      const activeSessions = sessions.filter((session) => {
        if (session.deleted) {
          // Attempt to clean up deleted session directory
          this.cleanupSessionDirectory(session.id);
          return false;
        }
        return true;
      });

      return activeSessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to get all sessions:', error);
      return [];
    }
  }

  /**
   * Message-related methods removed - conversation history now managed by SQLite checkpointer
   *
   * Previously: SessionManager stored messages in session.json
   * Now: SQLite checkpointer stores conversation state in checkpoints.db
   *
   * To access conversation history, use the DeepAgent's built-in checkpointer methods
   * with the session's thread_id
   */

  /**
   * Mark a session as deleted (will be cleaned up later)
   */
  deleteSession(sessionId: string): void {
    try {
      const session = this.loadSession(sessionId);
      if (!session) {
        throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
      }

      // Mark as deleted
      session.deleted = true;
      session.updatedAt = Date.now();
      this.saveSession(session);

      // Clear current session if deleted
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
    } catch (error) {
      console.error(`Failed to mark session ${sessionId} as deleted:`, error);
      throw error;
    }
  }

  /**
   * Cleanup a deleted session directory
   * This is called during getAllSessions() to clean up sessions marked as deleted
   */
  private cleanupSessionDirectory(sessionId: string): void {
    try {
      const sessionDir = path.join(this.sessionsDir, sessionId);

      // Try to delete the entire session directory
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        console.log(`Cleaned up deleted session: ${sessionId}`);
      }
    } catch (error) {
      // If cleanup fails (e.g., file locked), just log and continue
      // It will be retried next time getAllSessions() is called
      console.warn(`Failed to cleanup session ${sessionId}, will retry later:`, error);
    }
  }

  /**
   * Update session title
   */
  updateSessionTitle(sessionId: string, newTitle: string): void {
    const session = this.loadSession(sessionId);
    if (!session) {
      throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }

    session.title = newTitle;
    session.updatedAt = Date.now();
    this.saveSession(session);
  }

  /**
   * Touch session - update timestamp to mark as recently used
   */
  touchSession(sessionId: string): void {
    const session = this.loadSession(sessionId);
    if (!session) {
      return; // Silently ignore if session not found
    }

    session.updatedAt = Date.now();
    this.saveSession(session);
  }

  /**
   * Get current session
   */
  getCurrentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.loadSession(this.currentSessionId);
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Switch to a different session
   */
  switchSession(sessionId: string): Session {
    const session = this.loadSession(sessionId);
    if (!session) {
      throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }
    this.currentSessionId = sessionId;
    return session;
  }

  /**
   * Set current session (alias for switchSession)
   */
  setCurrentSession(sessionId: string): void {
    this.switchSession(sessionId);
  }

  /**
   * Clear current session
   */
  clearCurrentSession(): void {
    this.currentSessionId = null;
  }

  /**
   * Update Claude session ID (from SDK system init message)
   */
  updateClaudeSessionId(sessionId: string, claudeSessionId: string): void {
    try {
      const session = this.loadSession(sessionId);
      if (!session) {
        console.error(`Session ${sessionId} not found`);
        return;
      }

      session.claudeSessionId = claudeSessionId;
      session.updatedAt = Date.now();
      this.saveSession(session);
    } catch (error) {
      console.error(`Failed to update Claude session ID for ${sessionId}:`, error);
    }
  }

  /**
   * Update session checkpoint information
   */
  updateSessionCheckpoint(sessionId: string, checkpointId: string): void {
    try {
      const session = this.loadSession(sessionId);
      if (!session) {
        throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
      }

      session.lastCheckpointId = checkpointId;
      session.lastResumeTimestamp = Date.now();
      session.updatedAt = Date.now();
      session.totalTurns = (session.totalTurns || 0) + 1;

      this.saveSession(session);
    } catch (error) {
      console.error(`Failed to update checkpoint for session ${sessionId}:`, error);
    }
  }

  /**
   * Get session checkpoint ID for resumption
   */
  getSessionCheckpointId(sessionId: string): string | undefined {
    const session = this.loadSession(sessionId);
    return session?.lastCheckpointId;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    totalTurns: number;
    lastResumeTimestamp?: number;
    hasCheckpoint: boolean;
  } | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    return {
      totalTurns: session.totalTurns || 0,
      lastResumeTimestamp: session.lastResumeTimestamp,
      hasCheckpoint: !!session.lastCheckpointId,
    };
  }

  /**
   * Load last used cwd from config file
   */
  private loadLastCwd(): void {
    try {
      if (fs.existsSync(this.cwdConfigPath)) {
        const data = fs.readFileSync(this.cwdConfigPath, 'utf-8');
        const config = JSON.parse(data);
        this.lastCwd = config.lastCwd || null;
      }
    } catch (error) {
      console.error('Failed to load last cwd:', error);
      this.lastCwd = null;
    }
  }

  /**
   * Save last used cwd to config file
   */
  private saveLastCwd(cwd: string): void {
    try {
      const config = { lastCwd: cwd };
      fs.writeFileSync(this.cwdConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      this.lastCwd = cwd;
    } catch (error) {
      console.error('Failed to save last cwd:', error);
    }
  }

  /**
   * Get last used cwd, or user home directory as default
   */
  getLastCwd(): string {
    return this.lastCwd || os.homedir();
  }

  /**
   * Add additional directory to session
   */
  addAdditionalDirectory(sessionId: string, directory: string): void {
    const session = this.loadSession(sessionId);
    if (!session) {
      throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }

    if (!session.additionalDirectories) {
      session.additionalDirectories = [];
    }

    const normalizedDir = path.resolve(directory);
    if (!session.additionalDirectories.includes(normalizedDir)) {
      session.additionalDirectories.push(normalizedDir);
      session.updatedAt = Date.now();
      this.saveSession(session);
    }
  }

  /**
   * Remove additional directory from session
   */
  removeAdditionalDirectory(sessionId: string, directory: string): void {
    const session = this.loadSession(sessionId);
    if (!session) {
      throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }

    if (session.additionalDirectories) {
      const normalizedDir = path.resolve(directory);
      const index = session.additionalDirectories.indexOf(normalizedDir);
      if (index !== -1) {
        session.additionalDirectories.splice(index, 1);
        session.updatedAt = Date.now();
        this.saveSession(session);
      }
    }
  }

  /**
   * Get additional directories for session
   */
  getAdditionalDirectories(sessionId: string): string[] {
    const session = this.loadSession(sessionId);
    return session?.additionalDirectories || [];
  }

  /**
   * Clear all additional directories for session
   */
  clearAdditionalDirectories(sessionId: string): void {
    const session = this.loadSession(sessionId);
    if (!session) {
      throw new SessionPersistenceError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
    }

    session.additionalDirectories = [];
    session.updatedAt = Date.now();
    this.saveSession(session);
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
