/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Auth types - Shared type definitions for authentication
 * This file contains only type definitions to avoid bundling Node.js dependencies
 */

/**
 * Login method type
 */
export type LoginMethod = 'claudeai' | 'console';

/**
 * OAuth token response from API
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope?: string;
  subscription_type?: string;
  rate_limit_tier?: string;
}

/**
 * Stored credentials structure (CLI-compatible format)
 */
export interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // Unix timestamp in milliseconds
    scopes: string[];
    subscriptionType?: string | null;
    rateLimitTier?: string | null;
  };
}

/**
 * OAuth flow result
 */
export interface OAuthResult {
  success: boolean;
  credentials?: ClaudeCredentials['claudeAiOauth'];
  error?: string;
}

/**
 * Authentication status
 */
export interface AuthStatus {
  authenticated: boolean;
  apiKeySource: 'environment' | 'claude-settings'| 'oauth' | 'none';
  error?: string;
  oauthInfo?: {
    subscriptionType?: string | null;
    expiresAt: number;
    scopes: string[];
  };
}

/**
 * OAuth login options
 */
export interface OAuthLoginOptions {
  loginMethod: LoginMethod;
  inferenceOnly?: boolean;
  orgUUID?: string;
}
