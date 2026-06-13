/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Feature tests for ClaudeAgent's SDK message -> StreamEvent translation
 * (processQueryMessages). Feeds fixture SDKMessage sequences through the
 * real translation loop and asserts the resulting StreamEvent sequence.
 *
 * This is the highest-leverage test in the upgrade plan: it locks in the
 * current message-loop behavior so Phase 4 (SDK wrapper dedup) and Phase 7
 * (SessionAgent refactor) can proceed with a safety net.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ClaudeAgent, type ClaudeAgentConfig, type StreamEvent } from './claude-agent.js';
import { SessionManager } from '../sessions/session-manager.js';
import { ClaudeModel } from '../providers/model-list-manager.js';
import type {
  Query,
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKToolProgressMessage,
  SDKModelRefusalFallbackMessage,
  SDKTaskStartedMessage,
  SDKTaskProgressMessage,
  SDKRateLimitEvent,
} from '@anthropic-ai/claude-agent-sdk';

// --- Fixture builders -------------------------------------------------

const SESSION_ID = 'fixture-session-id';

function makeUsage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    input_tokens: 10,
    iterations: null,
    output_tokens: 5,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: 'standard',
    speed: 'standard',
    ...overrides,
  };
}

function makeAssistantMessage(
  content: Array<Record<string, unknown>>,
  overrides: {
    stop_reason?: string | null;
    stop_details?: { category?: string | null; explanation?: string | null } | null;
    usage?: Record<string, unknown>;
  } = {}
): SDKAssistantMessage {
  return {
    type: 'assistant',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: ClaudeModel.SONNET_4_6,
      content,
      stop_reason: overrides.stop_reason ?? 'end_turn',
      stop_sequence: null,
      stop_details: overrides.stop_details ?? null,
      usage: makeUsage(overrides.usage),
      container: null,
      context_management: null,
      diagnostics: null,
    },
    parent_tool_use_id: null,
    uuid: 'uuid-assistant-1',
    session_id: SESSION_ID,
  } as unknown as SDKAssistantMessage;
}

function makeToolResultUserMessage(toolUseId: string, output: string, isError = false): SDKUserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: output,
          is_error: isError,
        },
      ],
    },
    parent_tool_use_id: null,
    tool_use_result: output,
    uuid: 'uuid-user-1',
    session_id: SESSION_ID,
  } as unknown as SDKUserMessage;
}

function makeResultSuccess(overrides: Record<string, unknown> = {}): SDKResultMessage {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 100,
    duration_api_ms: 90,
    is_error: false,
    num_turns: 1,
    result: 'ok',
    stop_reason: 'end_turn',
    total_cost_usd: 0.01,
    usage: makeUsage(),
    modelUsage: {},
    permission_denials: [],
    uuid: 'uuid-result-1',
    session_id: SESSION_ID,
    ...overrides,
  } as unknown as SDKResultMessage;
}

function makeResultError(errors: string[], subtype = 'error_during_execution'): SDKResultMessage {
  return {
    type: 'result',
    subtype,
    duration_ms: 100,
    duration_api_ms: 90,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: makeUsage(),
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid: 'uuid-result-error-1',
    session_id: SESSION_ID,
  } as unknown as SDKResultMessage;
}

function makeSystemInit(slashCommands: string[]): SDKSystemMessage {
  return {
    type: 'system',
    subtype: 'init',
    apiKeySource: 'none',
    claude_code_version: '0.3.175',
    cwd: '/tmp',
    tools: [],
    mcp_servers: [],
    model: ClaudeModel.SONNET_4_6,
    permissionMode: 'default',
    slash_commands: slashCommands,
    output_style: 'default',
    skills: [],
    plugins: [],
    uuid: 'uuid-system-init-1',
    session_id: SESSION_ID,
  } as unknown as SDKSystemMessage;
}

function makeToolProgress(toolName: string, toolUseId: string, elapsedSeconds: number): SDKToolProgressMessage {
  return {
    type: 'tool_progress',
    tool_use_id: toolUseId,
    tool_name: toolName,
    parent_tool_use_id: null,
    elapsed_time_seconds: elapsedSeconds,
    uuid: 'uuid-tool-progress-1',
    session_id: SESSION_ID,
  } as unknown as SDKToolProgressMessage;
}

function makeModelRefusalFallback(): SDKModelRefusalFallbackMessage {
  return {
    type: 'system',
    subtype: 'model_refusal_fallback',
    trigger: 'refusal',
    direction: 'retry',
    original_model: ClaudeModel.SONNET_4_6,
    fallback_model: ClaudeModel.OPUS_4_8,
    request_id: 'req_1',
    content: '',
    uuid: 'uuid-model-fallback-1',
    session_id: SESSION_ID,
  } as unknown as SDKModelRefusalFallbackMessage;
}

function makeTaskStarted(): SDKTaskStartedMessage {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: 'task_1',
    description: 'Run a subagent task',
    uuid: 'uuid-task-started-1',
    session_id: SESSION_ID,
  } as unknown as SDKTaskStartedMessage;
}

function makeTaskProgress(): SDKTaskProgressMessage {
  return {
    type: 'system',
    subtype: 'task_progress',
    task_id: 'task_1',
    description: 'Working...',
    usage: { total_tokens: 100, tool_uses: 1, duration_ms: 500 },
    uuid: 'uuid-task-progress-1',
    session_id: SESSION_ID,
  } as unknown as SDKTaskProgressMessage;
}

function makeRateLimitEvent(status: 'allowed' | 'rejected', resetsAt?: number): SDKRateLimitEvent {
  return {
    type: 'rate_limit_event',
    rate_limit_info: { status, resetsAt },
    uuid: 'uuid-rate-limit-1',
    session_id: SESSION_ID,
  } as unknown as SDKRateLimitEvent;
}

// --- Test harness -------------------------------------------------------

type ProcessQueryMessages = (queryInstance: Query) => AsyncGenerator<StreamEvent, void, unknown>;

function makeQuery(messages: SDKMessage[]): Query {
  async function* gen(): AsyncGenerator<SDKMessage, void, unknown> {
    for (const message of messages) {
      yield message;
    }
  }
  return gen() as unknown as Query;
}

async function collectEvents(agent: ClaudeAgent, messages: SDKMessage[]): Promise<StreamEvent[]> {
  const processMessages = (agent as unknown as { processQueryMessages: ProcessQueryMessages }).processQueryMessages;
  const events: StreamEvent[] = [];
  for await (const event of processMessages.call(agent, makeQuery(messages))) {
    events.push(event);
  }
  return events;
}

function makeAgent(): ClaudeAgent {
  const config: ClaudeAgentConfig = {
    agentId: 'office-assist',
    agentDisplayName: 'Office Assistant',
    modelName: ClaudeModel.SONNET_4_6,
  };
  return new ClaudeAgent(config, SESSION_ID, '/tmp');
}

beforeAll(() => {
  // Pre-create the session metadata file so checkpoint/session-id updates
  // during message processing succeed silently.
  const sessionManager = SessionManager.getInstance();
  if (!sessionManager.loadSession(SESSION_ID)) {
    const session = sessionManager.createSession('Fixture session', 'office-assist', ClaudeModel.SONNET_4_6, '/tmp');
    // Re-key the generated session under our fixed SESSION_ID for reuse across tests.
    sessionManager.deleteSession(session.id);
  }
  sessionManager.createSession('Fixture session', 'office-assist', ClaudeModel.SONNET_4_6, '/tmp');
});

afterAll(() => {
  // Best-effort cleanup; fixture sessions are harmless if left behind.
});

// --- Tests ----------------------------------------------------------------

describe('processQueryMessages - text streaming', () => {
  it('yields text_delta for text content blocks and stores the turn in history', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([{ type: 'text', text: 'Hello, world!' }]),
      makeResultSuccess({ terminal_reason: 'completed' }),
    ]);

    expect(events[0]).toEqual({ type: 'state', state: { thinking: true } });
    expect(events).toContainEqual({ type: 'checkpoint' });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'text_delta', text: 'Hello, world!' })
    );
    expect(events[events.length - 2]).toEqual({ type: 'state', state: { thinking: false } });
    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({ type: 'done', terminalReason: 'completed' })
    );

    const history = await agent.getHistory();
    const assistantTurn = history.find((message) => message.role === 'assistant');
    expect(assistantTurn?.content).toBe('Hello, world!');
  });
});

describe('processQueryMessages - thinking', () => {
  it('yields a thinking event for thinking content blocks', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([{ type: 'thinking', thinking: 'Let me consider this...', signature: 'sig' }]),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual({ type: 'thinking', thinking: 'Let me consider this...' });
  });

  it('yields a placeholder thinking event for redacted_thinking blocks', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([{ type: 'redacted_thinking', data: 'opaque' }]),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual({ type: 'thinking', thinking: '[Thinking content redacted]' });
  });
});

describe('processQueryMessages - tool use', () => {
  it('yields tool_start for tool_use blocks and tool_end for matching tool_result', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([
        { type: 'tool_use', id: 'tool_1', name: 'Bash', input: { command: 'ls' } },
      ]),
      makeToolResultUserMessage('tool_1', 'file1.txt\nfile2.txt'),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual({
      type: 'tool_start',
      toolCallId: 'tool_1',
      toolName: 'Bash',
      args: { command: 'ls' },
    });
    expect(events).toContainEqual({
      type: 'tool_end',
      toolName: 'unknown',
      toolCallId: 'tool_1',
      output: 'file1.txt\nfile2.txt',
      error: undefined,
    });
  });

  it('yields tool_end with error for a failed tool_result', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([
        { type: 'tool_use', id: 'tool_2', name: 'Bash', input: { command: 'false' } },
      ]),
      makeToolResultUserMessage('tool_2', 'command failed', true),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual({
      type: 'tool_end',
      toolName: 'unknown',
      toolCallId: 'tool_2',
      output: '',
      error: 'command failed',
    });
  });
});

describe('processQueryMessages - tool_progress', () => {
  it('yields a tool_progress event', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeToolProgress('Bash', 'tool_1', 3),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tool_progress',
        toolName: 'Bash',
        toolCallId: 'tool_1',
        message: 'Elapsed: 3s',
      })
    );
  });
});

describe('processQueryMessages - Task tool system messages', () => {
  it('does not emit visible events for task_started/task_progress (handled by Task UI renderers)', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeTaskStarted(),
      makeTaskProgress(),
      makeResultSuccess(),
    ]);

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toEqual(['state', 'state', 'done']);
  });
});

describe('processQueryMessages - result', () => {
  it('propagates terminal_reason from a success result', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([{ type: 'text', text: 'Done.' }]),
      makeResultSuccess({ terminal_reason: 'max_turns' }),
    ]);

    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({ type: 'done', terminalReason: 'max_turns' })
    );
  });

  it('yields an error event for a non-success result', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeResultError(['Something went wrong']),
    ]);

    expect(events).toContainEqual({
      type: 'error',
      error: 'Execution error_during_execution: Something went wrong',
    });
  });
});

describe('processQueryMessages - refusal', () => {
  it('yields an error event when stop_reason is refusal', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeAssistantMessage([{ type: 'text', text: 'partial output' }], {
        stop_reason: 'refusal',
        stop_details: { category: 'cyber', explanation: 'policy violation' },
      }),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual({
      type: 'error',
      error: 'Response refused (cyber: policy violation)',
    });
  });
});

describe('processQueryMessages - system/init', () => {
  it('yields slashCommands from the init message', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeSystemInit(['/compact', '/init', '/usage']),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual({
      type: 'slashCommands',
      commands: ['/compact', '/init', '/usage'],
    });
  });
});

describe('processQueryMessages - model_refusal_fallback', () => {
  it('does not emit a visible event (fallback content arrives via the next assistant message)', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeModelRefusalFallback(),
      makeResultSuccess(),
    ]);

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toEqual(['state', 'state', 'done']);
  });
});

describe('processQueryMessages - rate_limit_event', () => {
  it('yields usage_limit when the rate limit is rejected', async () => {
    const agent = makeAgent();
    const resetsAt = Date.now() + 60_000;
    const events = await collectEvents(agent, [
      makeRateLimitEvent('rejected', resetsAt),
      makeResultSuccess(),
    ]);

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'usage_limit' })
    );
  });

  it('does not yield usage_limit when the rate limit is allowed', async () => {
    const agent = makeAgent();
    const events = await collectEvents(agent, [
      makeRateLimitEvent('allowed'),
      makeResultSuccess(),
    ]);

    expect(events.find((event) => event.type === 'usage_limit')).toBeUndefined();
  });
});
