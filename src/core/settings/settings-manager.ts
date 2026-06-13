/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Settings Manager - Manage application settings persistence
 * Stores user preferences for default role, model, working directory, theme, and language
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_MODEL } from '../providers/model-list-manager.js';

/**
 * Application settings structure
 */
export interface AppSettings {
  /** Default agent id for new sessions */
  defaultAgentId?: string;
  /** Default model name for new sessions */
  defaultModel: string;
  /** Default working directory for new sessions */
  defaultCwd: string;
  /** UI theme */
  theme: 'light' | 'dark';
  /** UI language */
  language: 'en' | 'zh' | 'ja';
}

/**
 * Default settings values
 */
const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: DEFAULT_MODEL,
  defaultCwd: os.homedir(),
  theme: 'light',
  language: 'en',
};

/**
 * Settings Manager class
 * Handles saving and loading application settings
 */
class SettingsManager {
  private static instance: SettingsManager;
  private settings: AppSettings;
  private readonly settingsDir: string;
  private readonly settingsPath: string;

  private constructor() {
    // Store settings in ~/.claude-pilot/settings.json
    this.settingsDir = path.join(os.homedir(), '.claude-pilot');
    this.settingsPath = path.join(this.settingsDir, 'settings.json');
    this.settings = { ...DEFAULT_SETTINGS };
    this.loadSettings();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  /**
   * Ensure settings directory exists
   */
  private ensureSettingsDir(): void {
    if (!fs.existsSync(this.settingsDir)) {
      fs.mkdirSync(this.settingsDir, { recursive: true });
    }
  }

  /**
   * Load settings from file
   */
  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const loaded = JSON.parse(data) as Partial<AppSettings>;
        // Merge with defaults to handle missing fields
        this.settings = { ...DEFAULT_SETTINGS, ...loaded };
        // Ensure defaultCwd is not empty (use homedir if empty)
        if (!this.settings.defaultCwd) {
          this.settings.defaultCwd = os.homedir();
        }
      }
    } catch (error) {
      console.error('[SettingsManager] Failed to load settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save settings to file
   */
  private saveSettings(): void {
    try {
      this.ensureSettingsDir();
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('[SettingsManager] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Get all settings
   */
  getSettings(): AppSettings {
    return { ...this.settings };
  }

  /**
   * Update settings (partial update)
   */
  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  /**
   * Reset settings to defaults
   */
  resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  /**
   * Check if settings file exists (first-time use detection)
   */
  hasSettings(): boolean {
    return fs.existsSync(this.settingsPath);
  }
}

// Export singleton instance
export const settingsManager = SettingsManager.getInstance();
