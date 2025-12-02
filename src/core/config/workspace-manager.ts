/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Workspace Manager - Manages workspace directories for agents
 * Singleton pattern for centralized workspace configuration
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../storage/storage';

/**
 * Workspace configuration file path
 */
const CONFIG_FILE = path.join(getConfigDir(), 'workspaces.json');

/**
 * Workspace Manager - Singleton
 * Manages workspace directories with persistence
 */
export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private workspaces: string[] = [];

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.load();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  /**
   * Load workspaces from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data);
        this.workspaces = config.workspaces || [];
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      this.workspaces = [];
    }
  }

  /**
   * Save workspaces to disk
   */
  private save(): void {
    try {
      // Config directory is ensured by getConfigDir()
      // Write config file
      const config = { workspaces: this.workspaces };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save workspaces:', error);
    }
  }

  /**
   * Add a workspace directory
   * @param dir - Absolute path to workspace directory
   * @returns true if added, false if already exists
   */
  addWorkspace(dir: string): boolean {
    const normalizedDir = path.resolve(dir);

    if (this.workspaces.includes(normalizedDir)) {
      return false;
    }

    this.workspaces.push(normalizedDir);
    this.save();
    return true;
  }

  /**
   * Remove a workspace directory
   * @param dir - Absolute path to workspace directory
   * @returns true if removed, false if not found
   */
  removeWorkspace(dir: string): boolean {
    const normalizedDir = path.resolve(dir);
    const index = this.workspaces.indexOf(normalizedDir);

    if (index === -1) {
      return false;
    }

    this.workspaces.splice(index, 1);
    this.save();
    return true;
  }

  /**
   * Get all workspace directories
   * @returns Array of workspace directory paths
   */
  getWorkspaces(): string[] {
    return [...this.workspaces];
  }

  /**
   * Clear all workspaces
   */
  clearWorkspaces(): void {
    this.workspaces = [];
    this.save();
  }

  /**
   * Check if a directory is a workspace
   * @param dir - Directory path to check
   * @returns true if directory is in workspaces
   */
  hasWorkspace(dir: string): boolean {
    const normalizedDir = path.resolve(dir);
    return this.workspaces.includes(normalizedDir);
  }
}

/**
 * Get the singleton instance
 * Convenience export for easy access
 */
export const workspaceManager = WorkspaceManager.getInstance();
