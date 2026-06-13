/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Structured error types for claude-pilot. Each error carries a stable
 * `code` string (for renderer-side branching and IPC error reporting) and
 * an optional `cause` (the underlying error, if any). Kept as a minimal,
 * flat set with no deep inheritance.
 */

export class AgentQueryError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'AgentQueryError';
    this.code = code;
    this.cause = cause;
  }
}

export class AuthError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.cause = cause;
  }
}

export class SessionPersistenceError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'SessionPersistenceError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Extracts a human-readable message from an unknown caught value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return 'Failed to get error details';
  }
}
