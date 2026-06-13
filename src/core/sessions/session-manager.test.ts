/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for SessionManager: creation, persistence, checkpoint/claudeSessionId
 * mapping, deletion, and additional-directory management.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionManager } from './session-manager.js';
import { getSessionsDir } from '../storage/storage.js';
import { ClaudeModel } from '../providers/model-list-manager.js';

const sessionManager = SessionManager.getInstance();
const createdSessionIds: string[] = [];

function createTestSession(title: string): ReturnType<SessionManager['createSession']> {
  const session = sessionManager.createSession(title, 'office-assist', ClaudeModel.SONNET_4_6, '/tmp');
  createdSessionIds.push(session.id);
  return session;
}

afterAll(() => {
  for (const sessionId of createdSessionIds) {
    const sessionDir = path.join(getSessionsDir(), sessionId);
    fs.rmSync(sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('createSession / loadSession', () => {
  it('creates a session with the expected metadata and persists it to disk', () => {
    const session = createTestSession('Test session');

    expect(session.title).toBe('Test session');
    expect(session.agentId).toBe('office-assist');
    expect(session.modelName).toBe(ClaudeModel.SONNET_4_6);
    expect(session.cwd).toBe('/tmp');
    expect(session.id).toBeTruthy();

    const loaded = sessionManager.loadSession(session.id);
    expect(loaded).toEqual(session);
  });

  it('returns null for a session that does not exist', () => {
    expect(sessionManager.loadSession('does-not-exist')).toBeNull();
  });
});

describe('updateClaudeSessionId', () => {
  it('persists the Claude SDK session ID for the session', () => {
    const session = createTestSession('Claude session id test');

    sessionManager.updateClaudeSessionId(session.id, 'claude-session-abc');

    const loaded = sessionManager.loadSession(session.id);
    expect(loaded?.claudeSessionId).toBe('claude-session-abc');
  });

  it('does not throw when the session does not exist', () => {
    expect(() => sessionManager.updateClaudeSessionId('does-not-exist', 'claude-session-xyz')).not.toThrow();
  });
});

describe('updateSessionCheckpoint', () => {
  it('persists the checkpoint ID and increments totalTurns', () => {
    const session = createTestSession('Checkpoint test');

    sessionManager.updateSessionCheckpoint(session.id, 'checkpoint-1');
    let loaded = sessionManager.loadSession(session.id);
    expect(loaded?.lastCheckpointId).toBe('checkpoint-1');
    expect(loaded?.totalTurns).toBe(1);
    expect(loaded?.lastResumeTimestamp).toBeTypeOf('number');

    sessionManager.updateSessionCheckpoint(session.id, 'checkpoint-2');
    loaded = sessionManager.loadSession(session.id);
    expect(loaded?.lastCheckpointId).toBe('checkpoint-2');
    expect(loaded?.totalTurns).toBe(2);

    expect(sessionManager.getSessionCheckpointId(session.id)).toBe('checkpoint-2');
  });

  it('does not throw when the session does not exist', () => {
    expect(() => sessionManager.updateSessionCheckpoint('does-not-exist', 'checkpoint-1')).not.toThrow();
  });
});

describe('getSessionStats', () => {
  it('returns null for a session that does not exist', () => {
    expect(sessionManager.getSessionStats('does-not-exist')).toBeNull();
  });

  it('reflects checkpoint state for an existing session', () => {
    const session = createTestSession('Stats test');
    sessionManager.updateSessionCheckpoint(session.id, 'checkpoint-1');

    expect(sessionManager.getSessionStats(session.id)).toEqual({
      totalTurns: 1,
      lastResumeTimestamp: expect.any(Number),
      hasCheckpoint: true,
    });
  });
});

describe('updateSessionTitle / touchSession', () => {
  it('updates the session title', () => {
    const session = createTestSession('Old title');
    sessionManager.updateSessionTitle(session.id, 'New title');

    expect(sessionManager.loadSession(session.id)?.title).toBe('New title');
  });

  it('throws when updating the title of a session that does not exist', () => {
    expect(() => sessionManager.updateSessionTitle('does-not-exist', 'New title')).toThrow();
  });

  it('updates updatedAt without throwing for an existing session, and silently ignores a missing one', () => {
    const session = createTestSession('Touch test');
    const before = sessionManager.loadSession(session.id)?.updatedAt;

    sessionManager.touchSession(session.id);
    const after = sessionManager.loadSession(session.id)?.updatedAt;
    expect(after).toBeGreaterThanOrEqual(before ?? 0);

    expect(() => sessionManager.touchSession('does-not-exist')).not.toThrow();
  });
});

describe('switchSession / getCurrentSession', () => {
  it('switches the current session and exposes it via getCurrentSession', () => {
    const session = createTestSession('Switch test');

    sessionManager.switchSession(session.id);
    expect(sessionManager.getCurrentSessionId()).toBe(session.id);
    expect(sessionManager.getCurrentSession()?.id).toBe(session.id);

    sessionManager.clearCurrentSession();
    expect(sessionManager.getCurrentSessionId()).toBeNull();
    expect(sessionManager.getCurrentSession()).toBeNull();
  });

  it('throws when switching to a session that does not exist', () => {
    expect(() => sessionManager.switchSession('does-not-exist')).toThrow();
  });
});

describe('deleteSession / getAllSessions', () => {
  it('marks a session as deleted so it no longer appears in getAllSessions', () => {
    const session = createTestSession('Delete test');
    expect(sessionManager.getAllSessions().map((s) => s.id)).toContain(session.id);

    sessionManager.deleteSession(session.id);
    expect(sessionManager.getAllSessions().map((s) => s.id)).not.toContain(session.id);

    // getAllSessions cleans up the directory for deleted sessions; loadSession now returns null.
    expect(sessionManager.loadSession(session.id)).toBeNull();
  });

  it('throws when deleting a session that does not exist', () => {
    expect(() => sessionManager.deleteSession('does-not-exist')).toThrow();
  });

  it('clears the current session if the deleted session was current', () => {
    const session = createTestSession('Delete current test');
    sessionManager.switchSession(session.id);
    expect(sessionManager.getCurrentSessionId()).toBe(session.id);

    sessionManager.deleteSession(session.id);
    expect(sessionManager.getCurrentSessionId()).toBeNull();
  });
});

describe('additional directories', () => {
  it('adds, lists, removes, and clears additional directories', () => {
    const session = createTestSession('Additional directories test');
    expect(sessionManager.getAdditionalDirectories(session.id)).toEqual([]);

    sessionManager.addAdditionalDirectory(session.id, '/tmp/extra');
    const added = sessionManager.getAdditionalDirectories(session.id);
    expect(added).toHaveLength(1);
    expect(added[0]).toBe(path.resolve('/tmp/extra'));

    // Adding the same directory again does not duplicate it.
    sessionManager.addAdditionalDirectory(session.id, '/tmp/extra');
    expect(sessionManager.getAdditionalDirectories(session.id)).toHaveLength(1);

    sessionManager.removeAdditionalDirectory(session.id, '/tmp/extra');
    expect(sessionManager.getAdditionalDirectories(session.id)).toEqual([]);

    sessionManager.addAdditionalDirectory(session.id, '/tmp/another');
    sessionManager.clearAdditionalDirectories(session.id);
    expect(sessionManager.getAdditionalDirectories(session.id)).toEqual([]);
  });
});

describe('getLastCwd', () => {
  it('remembers the cwd used by the most recently created session', () => {
    createTestSession('Last cwd test');
    expect(sessionManager.getLastCwd()).toBe('/tmp');
  });
});
