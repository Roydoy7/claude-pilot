/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Token Store - Global access token storage (singleton pattern)
 * Similar to C# static class - provides centralized token management
 *
 * This file contains NO Node.js imports, safe for renderer process
 */

/**
 * Token store state
 */
interface TokenState {
  accessToken: string | null;
  expiresAt: number | null;
  source: 'environment' | 'oauth' | 'none';
}

/**
 * Global token store - similar to C# static class
 * Provides centralized access to authentication token
 */
class TokenStore {
  private static instance: TokenStore;
  private state: TokenState = {
    accessToken: null,
    expiresAt: null,
    source: 'none',
  };

  private constructor() {}

  static getInstance(): TokenStore {
    if (!TokenStore.instance) {
      TokenStore.instance = new TokenStore();
    }
    return TokenStore.instance;
  }

  /**
   * Set access token (called by auth-manager)
   */
  setToken(token: string | null, source: 'environment' | 'oauth' | 'none', expiresAt?: number): void {
    this.state.accessToken = token;
    this.state.source = source;
    this.state.expiresAt = expiresAt || null;
  }

  /**
   * Get access token (can be called from anywhere, including renderer)
   */
  getToken(): string | null {
    return this.state.accessToken;
  }

  /**
   * Get token source
   */
  getTokenSource(): 'environment' | 'oauth' | 'none' {
    return this.state.source;
  }

  /**
   * Check if token is valid (not expired)
   */
  isTokenValid(): boolean {
    if (!this.state.accessToken) {
      return false;
    }
    if (this.state.source === 'environment') {
      // Environment tokens don't expire
      return true;
    }
    if (!this.state.expiresAt) {
      return false;
    }
    // Check if token is expired (with 5 minute buffer)
    return this.state.expiresAt > Date.now() + 5 * 60 * 1000;
  }

  /**
   * Clear token
   */
  clear(): void {
    this.state.accessToken = null;
    this.state.expiresAt = null;
    this.state.source = 'none';
  }

  /**
   * Get full token state (for debugging)
   */
  getState(): Readonly<TokenState> {
    return { ...this.state };
  }
}

/**
 * Export singleton instance - similar to C# static class usage
 */
export const tokenStore = TokenStore.getInstance();
