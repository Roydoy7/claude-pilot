/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for ClaudeAgent.processQueryMessages: SDK chunk sequences in,
 * StreamEvent sequences out. This is the core translation layer where
 * real bugs have occurred (e.g. a permission-mode-change status:null
 * message being misread as "compaction finished").
 */

import { describe, it, expect } from 'vitest';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeAgent } from './claude-agent.js';
import type { ClaudeAgentConfig, StreamEvent } from './claude-agent.js';

function createAgent(): ClaudeAgent {
  const config: ClaudeAgentConfig = {
    agentId: 'test-agent',
    agentDisplayName: 'Test Agent',
    modelName: 'claude-sonnet-4-6',
  };
  return new ClaudeAgent(config, 'stream-test-session', 'C:\\temp');
}

/**
 * Build a fake Query from a plain chunk array. processQueryMessages only
 * consumes the async iterator, so the other Query control methods are
 * never touched.
 */
function fakeQuery(chunks: unknown[]): Query {
  const generator = (async function* () {
    yield* chunks;
  })();
  return generator as unknown as Query;
}

/**
 * processQueryMessages is private by design; tests reach it through a
 * structural cast (no `any`) to avoid widening the public API.
 */
async function run(agent: ClaudeAgent, chunks: unknown[]): Promise<StreamEvent[]> {
  const invoker = agent as unknown as {
    processQueryMessages(queryInstance: Query): AsyncGenerator<StreamEvent, void, unknown>;
  };
  const events: StreamEvent[] = [];
  for await (const event of invoker.processQueryMessages(fakeQuery(chunks))) {
    events.push(event);
  }
  return events;
}

function statesOf(events: StreamEvent[]): Array<{ thinking?: boolean; command?: { name: string; status: string } }> {
  return events
    .filter((event): event is Extract<StreamEvent, { type: 'state' }> => event.type === 'state')
    .map((event) => event.state);
}

describe('processQueryMessages - lifecycle', () => {
  it('always starts with thinking:true and ends with thinking:false + done', async () => {
    const events = await run(createAgent(), []);

    expect(events[0]).toEqual({ type: 'state', state: { thinking: true } });
    expect(events[events.length - 2]).toEqual({ type: 'state', state: { thinking: false } });
    expect(events[events.length - 1]).toMatchObject({ type: 'done' });
  });

  it('yields cancelled and stops consuming chunks when the turn is cancelled', async () => {
    const agent = createAgent();
    agent.cancel();

    const events = await run(agent, [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'should never surface' }] } },
    ]);

    expect(events.some((event) => event.type === 'cancelled')).toBe(true);
    expect(events.some((event) => event.type === 'text_delta')).toBe(false);
  });
});

describe('processQueryMessages - system/status', () => {
  it('maps compacting -> null to compact running then completed', async () => {
    const events = await run(createAgent(), [
      { type: 'system', subtype: 'status', status: 'compacting' },
      { type: 'system', subtype: 'status', status: null },
    ]);

    const states = statesOf(events);
    expect(states).toContainEqual({ thinking: true, command: { name: 'compact', status: 'running' } });
    expect(states).toContainEqual({ thinking: false, command: { name: 'compact', status: 'completed' } });
  });

  it('does NOT clear thinking on a status:null without prior compacting (permission mode change)', async () => {
    // Regression test: mid-turn setPermissionMode() makes the CLI emit a
    // status:null system message. Treating it as "compaction finished"
    // wrongly cleared the thinking indicator in the UI.
    const events = await run(createAgent(), [
      { type: 'system', subtype: 'status', status: null, permissionMode: 'acceptEdits' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'still working' }] } },
    ]);

    // The only thinking:false allowed is the terminal one from the finally block.
    const clearingStates = statesOf(events).filter((state) => state.thinking === false);
    expect(clearingStates).toHaveLength(1);
    expect(events[events.length - 2]).toEqual({ type: 'state', state: { thinking: false } });
  });

  it('emits a compaction error when compacting finishes with compact_result failed', async () => {
    const events = await run(createAgent(), [
      { type: 'system', subtype: 'status', status: 'compacting' },
      { type: 'system', subtype: 'status', status: null, compact_result: 'failed', compact_error: 'context too large' },
    ]);

    expect(events).toContainEqual({ type: 'error', error: 'context too large' });
  });

  it('emits nothing for the transient requesting status', async () => {
    const events = await run(createAgent(), [
      { type: 'system', subtype: 'status', status: 'requesting' },
    ]);

    // Only the lifecycle events: initial thinking, final clear, done.
    expect(events).toHaveLength(3);
  });
});

describe('processQueryMessages - assistant messages', () => {
  it('yields checkpoint, text_delta with usage, and thinking blocks', async () => {
    const events = await run(createAgent(), [
      {
        type: 'assistant',
        message: {
          usage: { input_tokens: 100, output_tokens: 20 },
          content: [
            { type: 'thinking', thinking: 'pondering...' },
            { type: 'text', text: 'Hello!' },
          ],
        },
      },
    ]);

    expect(events).toContainEqual({ type: 'checkpoint' });
    expect(events).toContainEqual({ type: 'thinking', thinking: 'pondering...' });
    const textDelta = events.find((event) => event.type === 'text_delta');
    expect(textDelta).toMatchObject({
      text: 'Hello!',
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    });
  });

  it('yields tool_start with complete args from a tool_use block', async () => {
    const events = await run(createAgent(), [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: 'a.txt' } }],
        },
      },
    ]);

    expect(events).toContainEqual({
      type: 'tool_start',
      toolCallId: 'toolu_01',
      toolName: 'Read',
      args: { file_path: 'a.txt' },
    });
  });

  it('updates tool state from a stream_event content_block_start', async () => {
    const events = await run(createAgent(), [
      {
        type: 'stream_event',
        event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Bash' } },
      },
    ]);

    expect(statesOf(events)).toContainEqual({
      thinking: true,
      tool: { type: 'executing', toolName: 'Bash' },
    });
  });

  it('terminates with an error when a text block carries an API error', async () => {
    const events = await run(createAgent(), [
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'API Error: 500 overloaded' }] },
      },
      // Must never be reached - the generator returns on API error.
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'unreachable' }] },
      },
    ]);

    expect(events).toContainEqual({ type: 'error', error: 'API Error: 500 overloaded' });
    expect(events.filter((event) => event.type === 'text_delta')).toHaveLength(0);
  });
});

describe('processQueryMessages - tool results (user messages)', () => {
  it('yields tool_end for each tool_result block and returns to thinking', async () => {
    const events = await run(createAgent(), [
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'file contents' },
            { type: 'tool_result', tool_use_id: 'toolu_02', content: 'oops', is_error: true },
          ],
        },
      },
    ]);

    expect(events).toContainEqual({
      type: 'tool_end',
      toolName: 'unknown',
      toolCallId: 'toolu_01',
      output: 'file contents',
      error: undefined,
    });
    expect(events).toContainEqual({
      type: 'tool_end',
      toolName: 'unknown',
      toolCallId: 'toolu_02',
      output: '',
      error: 'oops',
    });
    // After tool results the turn continues - state goes back to thinking.
    const lastToolEndIndex = events.map((event) => event.type).lastIndexOf('tool_end');
    const followingState = events
      .slice(lastToolEndIndex + 1)
      .find((event) => event.type === 'state');
    expect(followingState).toEqual({ type: 'state', state: { thinking: true } });
  });
});

describe('processQueryMessages - result messages', () => {
  it('merges turn-level stats into final usage on success', async () => {
    const events = await run(createAgent(), [
      {
        type: 'assistant',
        message: {
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [{ type: 'text', text: 'answer' }],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0.01,
        duration_ms: 1234,
        num_turns: 1,
        modelUsage: { 'claude-sonnet-4-6': {} },
      },
    ]);

    const done = events.find((event) => event.type === 'done');
    expect(done).toMatchObject({
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_cost_usd: 0.01,
        duration_ms: 1234,
        num_turns: 1,
        model: 'claude-sonnet-4-6',
      },
    });
  });

  it('yields an error event for a non-success result', async () => {
    const events = await run(createAgent(), [
      { type: 'result', subtype: 'error_during_execution', errors: ['boom'] },
    ]);

    expect(events).toContainEqual({ type: 'error', error: 'Execution error_during_execution: boom' });
  });
});

describe('processQueryMessages - system/init', () => {
  it('yields available slash commands from the init message', async () => {
    const events = await run(createAgent(), [
      { type: 'system', subtype: 'init', session_id: 'claude-sess-1', slash_commands: ['/compact', '/init'] },
    ]);

    expect(events).toContainEqual({ type: 'slashCommands', commands: ['/compact', '/init'] });
  });
});
