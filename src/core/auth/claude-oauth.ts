/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude OAuth - Complete OAuth authentication flow for Claude
 * Based on Claude Code CLI OAuth implementation analysis
 * Saves credentials to CLI-compatible location: ~/.claude/.credentials.json
 */

import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { shell } from 'electron';
import type {
  LoginMethod,
  OAuthTokenResponse,
  ClaudeCredentials,
  OAuthResult,
} from '../types/auth-types.js';

/**
 * Re-export types for backward compatibility
 */
export type { LoginMethod, ClaudeCredentials, OAuthResult };

/**
 * OAuth configuration constants (from Claude Code CLI)
 */
const OAUTH_CONFIG = {
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  CLAUDE_AI_AUTHORIZE_URL: 'https://claude.ai/oauth/authorize',
  CONSOLE_AUTHORIZE_URL: 'https://console.anthropic.com/oauth/authorize',
  TOKEN_URL: 'https://console.anthropic.com/v1/oauth/token',
  SUCCESS_URL: 'https://console.anthropic.com/oauth/code/success?app=claude-code',
  // OAuth scopes
  INFERENCE_ONLY_SCOPE: 'user:inference',
  FULL_SCOPES: 'user:profile user:inference user:sessions:claude_code',
} as const;

/**
 * Credentials file path (CLI-compatible)
 * Windows: C:\Users\<username>\.claude\.credentials.json
 * macOS:   /Users/<username>/.claude/.credentials.json
 * Linux:   /home/<username>/.claude/.credentials.json
 */
const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

/**
 * Pending authentication state
 */
interface PendingAuth {
  state: string;
  resolve: (response: OAuthTokenResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Claude OAuth Provider
 * Implements complete OAuth flow with CLI-compatible credential storage
 */
export class ClaudeOAuth {
  private codeVerifier: string | null = null;
  private server: http.Server | null = null;
  private port: number | null = null;
  private pendingAuth: PendingAuth | null = null;

  /**
   * Generate random code_verifier for PKCE
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate code_challenge from code_verifier using SHA256
   */
  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generate random state parameter
   */
  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Build OAuth authorization URL
   */
  private buildAuthorizationUrl(options: {
    loginMethod: LoginMethod;
    codeChallenge: string;
    state: string;
    port: number;
    inferenceOnly?: boolean;
    orgUUID?: string;
  }): string {
    const { loginMethod, codeChallenge, state, port, inferenceOnly, orgUUID } = options;

    const baseUrl =
      loginMethod === 'claudeai'
        ? OAUTH_CONFIG.CLAUDE_AI_AUTHORIZE_URL
        : OAUTH_CONFIG.CONSOLE_AUTHORIZE_URL;

    const scope = inferenceOnly ? OAUTH_CONFIG.INFERENCE_ONLY_SCOPE : OAUTH_CONFIG.FULL_SCOPES;

    const params = new URLSearchParams({
      code: 'true',
      client_id: OAUTH_CONFIG.CLIENT_ID,
      response_type: 'code',
      redirect_uri: `http://localhost:${port}/callback`,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    if (orgUUID) {
      params.append('org_uuid', orgUUID);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Start local HTTP server to receive OAuth callback
   */
  private async startCallbackServer(expectedState: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        try {
          const url = new URL(req.url, `http://localhost`);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                  <h1>Authentication Failed</h1>
                  <p>Error: ${error}</p>
                  <p>${errorDescription || 'Unknown error occurred'}</p>
                  <p style="color: #666;">You can close this window.</p>
                </body>
              </html>
            `);
            this.pendingAuth?.reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
            this.cleanup();
            return;
          }

          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('State mismatch - possible CSRF attack');
            this.pendingAuth?.reject(new Error('State mismatch'));
            this.cleanup();
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing authorization code');
            this.pendingAuth?.reject(new Error('Missing authorization code'));
            this.cleanup();
            return;
          }

          // Redirect to success page
          res.writeHead(302, { Location: OAUTH_CONFIG.SUCCESS_URL });
          res.end();

          // Exchange code for tokens
          try {
            const tokenResponse = await this.exchangeCodeForToken(code, state);
            this.pendingAuth?.resolve(tokenResponse);
          } catch (err) {
            this.pendingAuth?.reject(err as Error);
          } finally {
            this.cleanup();
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
          this.pendingAuth?.reject(err as Error);
          this.cleanup();
        }
      });

      this.server.listen(0, 'localhost', () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string, state: string): Promise<OAuthTokenResponse> {
    if (!this.codeVerifier || !this.port) {
      throw new Error('OAuth flow not initialized');
    }

    const response = await fetch(OAUTH_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `http://localhost:${this.port}/callback`,
        client_id: OAUTH_CONFIG.CLIENT_ID,
        code_verifier: this.codeVerifier,
        state,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const response = await fetch(OAUTH_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: OAUTH_CONFIG.CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Save credentials to CLI-compatible file
   */
  private saveCredentials(tokenResponse: OAuthTokenResponse): void {
    const credentials: ClaudeCredentials['claudeAiOauth'] = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scopes: tokenResponse.scope?.split(' ') || ['user:inference'],
      subscriptionType: tokenResponse.subscription_type || null,
      rateLimitTier: tokenResponse.rate_limit_tier || null,
    };

    // Ensure .claude directory exists
    const claudeDir = path.dirname(CREDENTIALS_PATH);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Load existing credentials (may contain other OAuth like mcpOAuth)
    let existingData: ClaudeCredentials = {};
    if (fs.existsSync(CREDENTIALS_PATH)) {
      try {
        existingData = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      } catch (e) {
        console.warn('[ClaudeOAuth] Failed to parse existing credentials, will overwrite');
      }
    }

    // Merge with new credentials
    const mergedCredentials: ClaudeCredentials = {
      ...existingData,
      claudeAiOauth: credentials,
    };

    // Write to file
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(mergedCredentials, null, 2), 'utf8');

    // Set file permissions (owner read/write only)
    if (process.platform !== 'win32') {
      fs.chmodSync(CREDENTIALS_PATH, 0o600);
    }
  }

  /**
   * Load credentials from file
   */
  static loadCredentials(): ClaudeCredentials['claudeAiOauth'] | null {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      return null;
    }

    try {
      const data: ClaudeCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      return data.claudeAiOauth || null;
    } catch (e) {
      console.error('[ClaudeOAuth] Failed to load credentials:', e);
      return null;
    }
  }

  /**
   * Check if credentials are valid (not expired)
   */
  static isCredentialsValid(credentials: ClaudeCredentials['claudeAiOauth'] | null): boolean {
    if (!credentials?.accessToken || !credentials?.expiresAt) {
      return false;
    }
    // Consider expired if within 5 minutes of expiry (buffer for refresh)
    return credentials.expiresAt > Date.now() + 5 * 60 * 1000;
  }

  /**
   * Clear stored credentials
   */
  static clearCredentials(): void {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      try {
        const data: ClaudeCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        delete data.claudeAiOauth;
        if (Object.keys(data).length === 0) {
          fs.unlinkSync(CREDENTIALS_PATH);
        } else {
          fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), 'utf8');
        }
      } catch (e) {
        console.error('[ClaudeOAuth] Failed to clear credentials:', e);
      }
    }
  }

  /**
   * Start OAuth login flow
   */
  async login(options: {
    loginMethod: LoginMethod;
    inferenceOnly?: boolean;
    orgUUID?: string;
  }): Promise<OAuthResult> {
    this.cleanup();

    try {
      // 1. Generate PKCE parameters
      this.codeVerifier = this.generateCodeVerifier();
      const state = this.generateState();
      const codeChallenge = this.generateCodeChallenge(this.codeVerifier);

      // 2. Start callback server
      const port = await this.startCallbackServer(state);

      // 3. Build authorization URL
      const authUrl = this.buildAuthorizationUrl({
        loginMethod: options.loginMethod,
        codeChallenge,
        state,
        port,
        inferenceOnly: options.inferenceOnly,
        orgUUID: options.orgUUID,
      });

      // 4. Open browser and wait for callback
      const tokenResponse = await new Promise<OAuthTokenResponse>((resolve, reject) => {
        this.pendingAuth = { state, resolve, reject };
        shell.openExternal(authUrl).catch((err) => {
          reject(new Error(`Failed to open browser: ${err.message}`));
          this.cleanup();
        });
      });

      // 5. Save credentials to CLI-compatible file
      this.saveCredentials(tokenResponse);

      // 6. Load and return saved credentials
      const credentials = ClaudeOAuth.loadCredentials();
      return {
        success: true,
        credentials: credentials || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Refresh stored credentials
   */
  async refresh(): Promise<OAuthResult> {
    const credentials = ClaudeOAuth.loadCredentials();
    if (!credentials?.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
      };
    }

    try {
      const tokenResponse = await this.refreshToken(credentials.refreshToken);
      this.saveCredentials(tokenResponse);

      const newCredentials = ClaudeOAuth.loadCredentials();
      return {
        success: true,
        credentials: newCredentials || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * Clean up server and pending auth
   */
  private cleanup(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.port = null;
    this.pendingAuth = null;
    this.codeVerifier = null;
  }

  /**
   * Cancel ongoing OAuth flow
   */
  cancel(): void {
    if (this.pendingAuth) {
      this.pendingAuth.reject(new Error('OAuth flow cancelled by user'));
    }
    this.cleanup();
  }
}
