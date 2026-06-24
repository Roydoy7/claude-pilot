/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Auth Manager - Unified authentication manager
 * Supports both API Key and OAuth authentication
 * Priority: Environment variable API Key > ~/.claude/settings.json API Key > OAuth credentials
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClaudeOAuth } from './claude-oauth';
import { tokenStore } from './token-store';
import type {
  LoginMethod,
  OAuthResult,
  AuthStatus,
  OAuthLoginOptions,
  ClaudeCredentials,
} from '../types/auth-types.js';

/**
 * Re-export types for backward compatibility
 */
export type { AuthStatus, OAuthLoginOptions };

/**
 * Environment variable name for Anthropic API key
 */
const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';

/**
 * Path to Claude Code settings file
 */
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

/**
 * Refresh the OAuth access token this many ms before it actually expires
 */
const OAUTH_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Auth Manager - Singleton
 * Manages both API Key and OAuth authentication
 */
class AuthManager {
  private static instance: AuthManager;
  private oauthProvider: ClaudeOAuth;
  private refreshTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.oauthProvider = new ClaudeOAuth();
    // Initialize tokenStore on construction (async initialization happens in background)
    this.initializeTokenStore();
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Read env values from ~/.claude/settings.json
   */
  private loadClaudeSettingsEnv(): Record<string, string> {
    try {
      const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(raw) as { env?: Record<string, string> };
      return settings?.env ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Read ANTHROPIC_API_KEY from ~/.claude/settings.json env section
   */
  private loadApiKeyFromClaudeSettings(): string | null {
    const key = this.loadClaudeSettingsEnv()[ANTHROPIC_API_KEY_ENV];
    return typeof key === 'string' ? key : null;
  }

  /**
   * Get ANTHROPIC_BASE_URL from ~/.claude/settings.json (for proxy setups)
   * Returns undefined if not configured (use Anthropic default)
   */
  getApiBaseUrl(): string | undefined {
    const url = this.loadClaudeSettingsEnv()['ANTHROPIC_BASE_URL'];
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  }

  /**
   * Initialize tokenStore with current credentials
   * Called during construction to ensure tokenStore is always populated
   * Handles token refresh if needed
   */
  private initializeTokenStore(): void {
    // Priority 1: Environment variable API Key
    const envApiKey = process.env[ANTHROPIC_API_KEY_ENV];
    if (envApiKey && this.validateApiKeyFormat(envApiKey)) {
      tokenStore.setToken(envApiKey, 'environment');
      return;
    }

    // Priority 2: ~/.claude/settings.json env.ANTHROPIC_API_KEY
    const settingsApiKey = this.loadApiKeyFromClaudeSettings();
    if (settingsApiKey && this.validateSettingsApiKey(settingsApiKey)) {
      tokenStore.setToken(settingsApiKey, 'claude-settings');
      tokenStore.setBaseUrl(this.getApiBaseUrl() ?? null);
      return;
    }

    // Priority 3: OAuth credentials
    const oauthCreds = ClaudeOAuth.loadCredentials();
    if (oauthCreds) {
      // Check if token is valid
      if (ClaudeOAuth.isCredentialsValid(oauthCreds)) {
        // Valid token, set it directly and schedule the next refresh
        tokenStore.setToken(oauthCreds.accessToken, 'oauth', oauthCreds.expiresAt);
        this.scheduleRefresh(oauthCreds.expiresAt);
      } else {
        // Token expired, try to refresh in background
        this.refreshTokenInBackground();
      }
      return;
    }

    // No valid credentials
    tokenStore.clear();
  }

  /**
   * Refresh OAuth token in background (fire-and-forget)
   */
  private refreshTokenInBackground(): void {
    void this.tryRefreshOAuth();
  }

  /**
   * Attempt to refresh OAuth credentials using the stored refresh token.
   * Updates tokenStore and schedules the next refresh on success.
   * Clears credentials on failure, since the refresh token is no longer usable.
   */
  private async tryRefreshOAuth(): Promise<ClaudeCredentials['claudeAiOauth'] | null> {
    try {
      const refreshResult = await this.oauthProvider.refresh();
      if (refreshResult.success && refreshResult.credentials) {
        tokenStore.setToken(
          refreshResult.credentials.accessToken,
          'oauth',
          refreshResult.credentials.expiresAt
        );
        this.scheduleRefresh(refreshResult.credentials.expiresAt);
        return refreshResult.credentials;
      }
    } catch (error) {
      console.error('[AuthManager] OAuth token refresh failed:', error);
    }

    ClaudeOAuth.clearCredentials();
    tokenStore.clear();
    return null;
  }

  /**
   * Schedule the next proactive OAuth refresh, timed to fire
   * OAUTH_REFRESH_BUFFER_MS before the access token expires.
   * Without this, the token only ever gets refreshed once at startup,
   * so a long-running session eventually finds itself unauthenticated
   * even though the refresh token is still perfectly valid.
   */
  private scheduleRefresh(expiresAt: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    const delay = Math.max(0, expiresAt - Date.now() - OAUTH_REFRESH_BUFFER_MS);
    this.refreshTimer = setTimeout(() => this.refreshTokenInBackground(), delay);
  }

  /**
   * Get current authentication status
   * Priority: Environment variable > ~/.claude/settings.json > OAuth
   */
  async isAuthenticated(): Promise<AuthStatus> {
    // Priority 1: Environment variable API Key
    const envApiKey = process.env[ANTHROPIC_API_KEY_ENV];
    if (envApiKey && this.validateApiKeyFormat(envApiKey)) {
      return {
        authenticated: true,
        apiKeySource: 'environment',
      };
    }

    // Priority 2: ~/.claude/settings.json env.ANTHROPIC_API_KEY
    const settingsApiKey = this.loadApiKeyFromClaudeSettings();
    if (settingsApiKey && this.validateSettingsApiKey(settingsApiKey)) {
      return {
        authenticated: true,
        apiKeySource: 'claude-settings',
      };
    }

    // Priority 3: OAuth credentials - if the access token expired, try a
    // transparent refresh before reporting failure (the refresh token may
    // still be perfectly valid even though nothing proactively refreshed it).
    let oauthCreds = ClaudeOAuth.loadCredentials();
    if (oauthCreds && !ClaudeOAuth.isCredentialsValid(oauthCreds)) {
      oauthCreds = await this.tryRefreshOAuth();
    }
    if (oauthCreds && ClaudeOAuth.isCredentialsValid(oauthCreds)) {
      return {
        authenticated: true,
        apiKeySource: 'oauth',
        oauthInfo: {
          subscriptionType: oauthCreds.subscriptionType,
          expiresAt: oauthCreds.expiresAt,
          scopes: oauthCreds.scopes,
        },
      };
    }

    // No valid authentication
    return {
      authenticated: false,
      apiKeySource: 'none',
      error: `No API key. Set ${ANTHROPIC_API_KEY_ENV} environment variable or login with OAuth.`,
    };
  }

  /**
   * Validate API key format
   */
  private validateApiKeyFormat(key: string): boolean {
    return key.startsWith('sk-ant-') && key.length >= 40;
  }

  /**
   * Validate API key from trusted config file (lenient — allows proxy keys)
   */
  private validateSettingsApiKey(key: string): boolean {
    return key.length >= 8;
  }

  /**
   * Start OAuth login flow
   */
  async loginWithOAuth(options: OAuthLoginOptions): Promise<OAuthResult> {
    const result = await this.oauthProvider.login(options);

    // Update tokenStore if login successful
    if (result.success && result.credentials) {
      tokenStore.setToken(
        result.credentials.accessToken,
        'oauth',
        result.credentials.expiresAt
      );
      this.scheduleRefresh(result.credentials.expiresAt);
    }

    return result;
  }

  /**
   * Logout - clear OAuth credentials and token store
   */
  logout(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    ClaudeOAuth.clearCredentials();
    this.oauthProvider.cancel();
    tokenStore.clear();
  }

  /**
   * Get OAuth credentials info (for UI display)
   */
  getOAuthInfo(): {
    authenticated: boolean;
    subscriptionType?: string | null;
    expiresAt?: number;
    scopes?: string[];
  } {
    const creds = ClaudeOAuth.loadCredentials();
    if (!creds || !ClaudeOAuth.isCredentialsValid(creds)) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      subscriptionType: creds.subscriptionType,
      expiresAt: creds.expiresAt,
      scopes: creds.scopes,
    };
  }
}

/**
 * Export singleton instance
 */
export const authManager = AuthManager.getInstance();
