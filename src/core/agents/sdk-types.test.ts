/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Sentinel for an upstream @anthropic-ai/claude-agent-sdk packaging bug
 * (present in 0.3.199 through at least 0.3.201): the shipped sdk.d.ts
 * references ~25 type names that do not exist in the file (e.g.
 * SDKControlRequestProgressMessage, SDKConversationResetMessage), so the
 * SDKMessage union collapses to `any`.
 *
 * Because of this, claude-agent.ts carries 4 workarounds marked with
 * "upstream packaging bug" comments (explicit chunk casts and disabled
 * exhaustiveness checks).
 *
 * When an SDK upgrade fixes the d.ts, the assignment below becomes a
 * compile error. That is the signal to:
 *   1. remove the 4 workarounds in claude-agent.ts
 *   2. delete this test file
 */

import { describe, it, expect } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

type IsAny<T> = 0 extends 1 & T ? true : false;

// Compile-time sentinel: only assignable while SDKMessage is `any`.
const sdkMessageIsStillAny: IsAny<SDKMessage> = true;

describe('claude-agent-sdk type health', () => {
  it('documents that SDKMessage currently collapses to any (upstream d.ts bug)', () => {
    expect(sdkMessageIsStillAny).toBe(true);
  });
});
