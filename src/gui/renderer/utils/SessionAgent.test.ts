/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Feature tests for SessionAgent: event queue ordering, streaming text
 * assembly, tool call lifecycle, and approval state transitions.
 *
 * SessionAgent registers listeners on window.electronAPI in its
 * constructor, so a minimal electronAPI mock is installed on globalThis
 * before any agent is constructed. Stream events and tool approval
 * requests are fed back through the captured listener callbacks - this
 * exercises the real processStreamEvent logic without changing the
 * SessionAgent design.
 */

import { describe, it, expect, vi } from 'vitest';
import { SessionAgent } from './SessionAgent.js';
import type { MessageListItem, ElectronAPI, StreamEventData, ToolApprovalRequestEvent } from '../../preload/preload-types';
import type { StreamEvent, UsageMetadata } from '../../../core/agents/claude-agent.js';

const onStreamEvent = vi.fn();
const onToolApprovalRequest = vi.fn();
const approveTool = vi.fn().mockResolvedValue({ success: true });
const rejectTool = vi.fn().mockResolvedValue({ success: true });
const getHistory = vi.fn().mockResolvedValue([]);

const mockElectronAPI = {
  agent: {
    onStreamEvent,
    onToolApprovalRequest,
    approveTool,
    rejectTool,
  },
  session: {
    getHistory,
  },
} as unknown as ElectronAPI;

(globalThis as unknown as { window: { electronAPI: ElectronAPI } }).window = { electronAPI: mockElectronAPI };

interface TestHarness {
  agent: SessionAgent;
  emit: (event: StreamEvent) => void;
  emitApproval: (toolUseId: string, toolName: string, toolInput: Record<string, unknown>) => void;
  displayItemsHistory: MessageListItem[][];
  pendingApprovalsHistory: Array<Map<string, string>>;
  rejectedToolsHistory: Array<Set<string>>;
}

function createHarness(sessionId: string): TestHarness {
  const displayItemsHistory: MessageListItem[][] = [];
  const pendingApprovalsHistory: Array<Map<string, string>> = [];
  const rejectedToolsHistory: Array<Set<string>> = [];

  const agent = new SessionAgent(sessionId, {
    onDisplayItemsChange: (items) => displayItemsHistory.push(items),
    onPendingApprovalsChange: (approvals) => pendingApprovalsHistory.push(approvals),
    onRejectedToolsChange: (rejected) => rejectedToolsHistory.push(rejected),
  });

  const streamEventCallback = onStreamEvent.mock.calls[onStreamEvent.mock.calls.length - 1][0] as (data: StreamEventData) => void;
  const toolApprovalCallback = onToolApprovalRequest.mock.calls[onToolApprovalRequest.mock.calls.length - 1][0] as (data: ToolApprovalRequestEvent) => void;

  return {
    agent,
    emit: (event) => streamEventCallback({ sessionId, event }),
    emitApproval: (toolUseId, toolName, toolInput) => toolApprovalCallback({ sessionId, toolUseId, toolName, toolInput }),
    displayItemsHistory,
    pendingApprovalsHistory,
    rejectedToolsHistory,
  };
}

function makeUsage(overrides: Partial<UsageMetadata> = {}): UsageMetadata {
  return { input_tokens: 10, output_tokens: 5, total_tokens: 15, ...overrides };
}

let sessionCounter = 0;
function nextSessionId(): string {
  sessionCounter += 1;
  return `session-${sessionCounter}`;
}

describe('SessionAgent - state events', () => {
  it('adds a status item for non-idle state and removes it when idle', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'state', state: { thinking: true } });
    let items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([
      expect.objectContaining({ type: 'status', agentState: { thinking: true } }),
    ]);

    emit({ type: 'state', state: { thinking: false } });
    items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([]);
  });

  it('keeps the status item at the end when other items are present', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'state', state: { thinking: true } });
    emit({ type: 'thinking', thinking: 'Considering...' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0].type).toBe('thinking');
    expect(items[1].type).toBe('status');
  });
});

describe('SessionAgent - text streaming', () => {
  it('accumulates text deltas into a single streaming message item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'text_delta', text: 'Hello' });
    let items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'message', role: 'assistant', content: 'Hello' });
    const streamingId = items[0].id;

    emit({ type: 'text_delta', text: ', world!' });
    items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(streamingId);
    expect(items[0].content).toBe('Hello, world!');
  });

  it('stores usage from an empty first delta and applies it once text arrives', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());
    const usage = makeUsage({ input_tokens: 123 });

    // Claude sends usage with an empty-text delta first.
    emit({ type: 'text_delta', text: '', usage });
    expect(displayItemsHistory).toHaveLength(0);

    emit({ type: 'text_delta', text: 'Hello' });
    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({ type: 'message', content: 'Hello', usage });
  });

  it('resets streaming buffers on checkpoint so the next delta starts a new item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    // Streaming message IDs are generated from Date.now(), so the two turns
    // must land in different milliseconds for the second to get a distinct ID.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      emit({ type: 'text_delta', text: 'First turn' });
      const firstId = displayItemsHistory[displayItemsHistory.length - 1][0].id;

      emit({ type: 'checkpoint' });

      vi.setSystemTime(2000);
      emit({ type: 'text_delta', text: 'Second turn' });

      const items = displayItemsHistory[displayItemsHistory.length - 1];
      expect(items).toHaveLength(2);
      expect(items[0].content).toBe('First turn');
      expect(items[0].id).toBe(firstId);
      expect(items[1].content).toBe('Second turn');
      expect(items[1].id).not.toBe(firstId);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SessionAgent - thinking', () => {
  it('adds a thinking item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'thinking', thinking: 'Let me consider this...' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([
      expect.objectContaining({ type: 'thinking', thinking: 'Let me consider this...' }),
    ]);
  });
});

describe('SessionAgent - tool call lifecycle', () => {
  it('adds a tool_call item on tool_start and attaches the response on tool_end', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'tool_start', toolCallId: 'tool_1', toolName: 'Bash', args: { command: 'ls' } });
    let items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        toolCall: { id: 'tool_1', name: 'Bash', args: { command: 'ls' } },
        needsApproval: false,
      }),
    ]);

    emit({ type: 'tool_end', toolName: 'unknown', toolCallId: 'tool_1', output: 'file1.txt' });
    items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({
      type: 'tool_call',
      toolResponse: { tool_call_id: 'tool_1', output: 'file1.txt', error: undefined },
      needsApproval: false,
    });
  });

  it('marks an existing tool_call item as needing approval when a request arrives after tool_start', () => {
    const { emit, emitApproval, displayItemsHistory, pendingApprovalsHistory } = createHarness(nextSessionId());

    emit({ type: 'tool_start', toolCallId: 'tool_2', toolName: 'Write', args: { path: 'a.txt' } });
    emitApproval('tool_2', 'Write', { path: 'a.txt' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({ type: 'tool_call', needsApproval: true });
    expect(pendingApprovalsHistory[pendingApprovalsHistory.length - 1]).toEqual(new Map([['tool_2', 'tool_2']]));
  });

  it('marks a tool_call item as needing approval when the approval request arrives before tool_start', () => {
    const { emit, emitApproval, displayItemsHistory } = createHarness(nextSessionId());

    emitApproval('tool_3', 'Write', { path: 'b.txt' });
    emit({ type: 'tool_start', toolCallId: 'tool_3', toolName: 'Write', args: { path: 'b.txt' } });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({ type: 'tool_call', needsApproval: true });
  });

  it('appends progress entries to the matching tool_call item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'tool_start', toolCallId: 'tool_4', toolName: 'Bash', args: { command: 'sleep 5' } });
    emit({ type: 'tool_progress', toolName: 'Bash', toolCallId: 'tool_4', progressType: 'stdout', message: 'Elapsed: 1s', timestamp: 1 });
    emit({ type: 'tool_progress', toolName: 'Bash', toolCallId: 'tool_4', progressType: 'stdout', message: 'Elapsed: 2s', timestamp: 2 });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0].progress).toEqual([
      { type: 'stdout', message: 'Elapsed: 1s', timestamp: 1 },
      { type: 'stdout', message: 'Elapsed: 2s', timestamp: 2 },
    ]);
  });
});

describe('SessionAgent - message, error, cancelled, usage_limit', () => {
  it('adds a compact summary message item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'message', content: 'Conversation summarized.', timestamp: 1000, isCompactSummary: true });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([
      expect.objectContaining({ type: 'message', role: 'assistant', content: 'Conversation summarized.', isCompactSummary: true }),
    ]);
  });

  it('adds an error message and clears the status item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'state', state: { thinking: true } });
    emit({ type: 'error', error: 'boom', details: 'stack trace' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('message');
    expect(items[0].content).toContain('boom');
    expect(items[0].content).toContain('stack trace');
  });

  it('adds a cancelled item and clears the status item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'state', state: { thinking: true } });
    emit({ type: 'cancelled', reason: 'Request cancelled by user' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([expect.objectContaining({ type: 'cancelled' })]);
  });

  it('adds a usage_limit item and clears the status item', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'state', state: { thinking: true } });
    emit({ type: 'usage_limit', message: 'Usage limit reached' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([
      expect.objectContaining({ type: 'usage_limit', usageLimitMessage: 'Usage limit reached' }),
    ]);
  });
});

describe('SessionAgent - done', () => {
  it('removes empty assistant messages and applies final usage to the last assistant message', () => {
    const { emit, displayItemsHistory } = createHarness(nextSessionId());

    // A streaming turn that produced visible text.
    emit({ type: 'text_delta', text: 'Final answer' });
    // An empty assistant message (e.g. a turn that only called tools).
    emit({ type: 'message', content: '', timestamp: 2000 });

    const usage = makeUsage({ output_tokens: 42 });
    emit({ type: 'done', usage, terminalReason: 'completed' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'message', content: 'Final answer', usage });
  });
});

describe('SessionAgent - addUserMessage', () => {
  it('adds a regular user message and sets status to thinking', () => {
    const { agent, displayItemsHistory } = createHarness(nextSessionId());

    agent.addUserMessage({ type: 'message', id: 'user-1', timestamp: 1, role: 'user', content: 'Hello there' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({ type: 'message', role: 'user', content: 'Hello there' });
    expect(items[1]).toMatchObject({ type: 'status', agentState: { thinking: true } });
  });

  it('does not display a slash command as a user message, only as a running command status', () => {
    const { agent, displayItemsHistory } = createHarness(nextSessionId());

    agent.addUserMessage({ type: 'message', id: 'user-2', timestamp: 1, role: 'user', content: '/compact' });

    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([
      expect.objectContaining({ type: 'status', agentState: { thinking: false, command: { name: 'compact', status: 'running' } } }),
    ]);
  });
});

describe('SessionAgent - approve/reject tools', () => {
  it('approveTools clears the approval flag and notifies the backend', async () => {
    const { agent, emit, emitApproval, displayItemsHistory, pendingApprovalsHistory } = createHarness(nextSessionId());

    emit({ type: 'tool_start', toolCallId: 'tool_5', toolName: 'Write', args: { path: 'c.txt' } });
    emitApproval('tool_5', 'Write', { path: 'c.txt' });

    await agent.approveTools(['tool_5']);

    expect(pendingApprovalsHistory[pendingApprovalsHistory.length - 1]).toEqual(new Map());
    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({ type: 'tool_call', needsApproval: false });
    expect(approveTool).toHaveBeenCalledWith('tool_5');
  });

  it('rejectTools marks the tool as rejected and notifies the backend with feedback', async () => {
    const { agent, emit, emitApproval, displayItemsHistory, pendingApprovalsHistory, rejectedToolsHistory } = createHarness(nextSessionId());

    emit({ type: 'tool_start', toolCallId: 'tool_6', toolName: 'Write', args: { path: 'd.txt' } });
    emitApproval('tool_6', 'Write', { path: 'd.txt' });

    await agent.rejectTools(['tool_6'], 'not needed');

    expect(pendingApprovalsHistory[pendingApprovalsHistory.length - 1]).toEqual(new Map());
    expect(rejectedToolsHistory[rejectedToolsHistory.length - 1]).toEqual(new Set(['tool_6']));
    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items[0]).toMatchObject({ type: 'tool_call', needsApproval: false, wasRejected: true });
    expect(rejectTool).toHaveBeenCalledWith('tool_6', 'not needed');
  });
});

describe('SessionAgent - getters', () => {
  it('exposes session id, display items, pending approvals and rejected tools', async () => {
    const sessionId = nextSessionId();
    const { agent, emit, emitApproval } = createHarness(sessionId);

    expect(agent.getSessionId()).toBe(sessionId);
    expect(agent.isActiveSession()).toBe(true);

    emit({ type: 'tool_start', toolCallId: 'tool_7', toolName: 'Bash', args: {} });
    emitApproval('tool_7', 'Bash', {});
    expect(agent.getPendingApprovals()).toEqual(new Map([['tool_7', 'tool_7']]));

    await agent.rejectTools(['tool_7']);
    expect(agent.getRejectedTools()).toEqual(new Set(['tool_7']));

    expect(agent.getDisplayItems()).toHaveLength(1);
  });
});

describe('SessionAgent - deactivate', () => {
  it('marks the agent inactive and clears the status item', () => {
    const { agent, emit, displayItemsHistory } = createHarness(nextSessionId());

    emit({ type: 'state', state: { thinking: true } });
    agent.deactivate();

    expect(agent.isActiveSession()).toBe(false);
    const items = displayItemsHistory[displayItemsHistory.length - 1];
    expect(items).toEqual([]);
  });
});
