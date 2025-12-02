/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Auth Manager - Unified authentication manager
 * Supports both API Key and OAuth authentication
 * Priority: Environment variable API Key > OAuth credentials
 */

import { ClaudeOAuth } from './claude-oauth';
import { tokenStore } from './token-store';
import type {
  LoginMethod,
  OAuthResult,
  AuthStatus,
  OAuthLoginOptions,
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
 * Auth Manager - Singleton
 * Manages both API Key and OAuth authentication
 */
class AuthManager {
  private static instance: AuthManager;
  private oauthProvider: ClaudeOAuth;

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

    // Priority 2: OAuth credentials
    const oauthCreds = ClaudeOAuth.loadCredentials();
    if (oauthCreds) {
      // Check if token is valid
      if (ClaudeOAuth.isCredentialsValid(oauthCreds)) {
        // Valid token, set it directly
        tokenStore.setToken(oauthCreds.accessToken, 'oauth', oauthCreds.expiresAt);
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
   * Refresh OAuth token in background
   * Updates tokenStore on success
   */
  private async refreshTokenInBackground(): Promise<void> {
    try {
      const refreshResult = await this.oauthProvider.refresh();
      if (refreshResult.success && refreshResult.credentials) {
        tokenStore.setToken(
          refreshResult.credentials.accessToken,
          'oauth',
          refreshResult.credentials.expiresAt
        );
      } else {
        // Refresh failed, clear invalid credentials
        ClaudeOAuth.clearCredentials();
        tokenStore.clear();
      }
    } catch (error) {
      console.error('[AuthManager] Failed to refresh token on initialization:', error);
      ClaudeOAuth.clearCredentials();
      tokenStore.clear();
    }
  }

  /**
   * Get current authentication status
   * Priority: Environment variable > OAuth
   */
  isAuthenticated(): AuthStatus {
    // Priority 1: Environment variable API Key
    const envApiKey = process.env[ANTHROPIC_API_KEY_ENV];
    if (envApiKey && this.validateApiKeyFormat(envApiKey)) {
      return {
        authenticated: true,
        apiKeySource: 'environment',
      };
    }

    // Priority 2: OAuth credentials
    const oauthCreds = ClaudeOAuth.loadCredentials();
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
    }

    return result;
  }

  /**
   * Logout - clear OAuth credentials and token store
   */
  logout(): void {
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
