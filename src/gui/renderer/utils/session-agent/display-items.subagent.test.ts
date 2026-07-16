/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for subagent activity nesting in display-items reducers.
 */

import { describe, it, expect } from 'vitest';
import {
  applyToolStart,
  applyToolEnd,
  applySubagentText,
  applySubagentActivityDelta,
  applySubagentSkills,
  applyTaskNotificationEvent,
} from './display-items';
import type { MessageListItem } from '../../../preload/preload-types';

function agentCard(id: string): MessageListItem {
  return {
    type: 'tool_call',
    id: `tool-${id}`,
    timestamp: 0,
    toolCall: { id, name: 'Task', args: { subagent_type: 'office-quality-reviewer' } },
  };
}

describe('subagent activity nesting', () => {
  it('nests a tool_start with parentToolCallId into the parent Agent card', () => {
    const items = [agentCard('agent-1')];
    const next = applyToolStart(
      items,
      { toolCallId: 'read-1', toolName: 'Read', args: { file_path: '/a.png' }, parentToolCallId: 'agent-1' },
      new Map(),
    );

    expect(next).toHaveLength(1);
    expect(next[0].subagentActivity).toHaveLength(1);
    expect(next[0].subagentActivity?.[0]).toMatchObject({ kind: 'tool', toolName: 'Read', toolCallId: 'read-1' });
  });

  it('marks a nested activity entry as errored on tool_end', () => {
    const withStart = applyToolStart(
      [agentCard('agent-1')],
      { toolCallId: 'read-1', toolName: 'Read', args: {}, parentToolCallId: 'agent-1' },
      new Map(),
    );
    const next = applyToolEnd(withStart, { toolCallId: 'read-1', output: '', error: 'boom', parentToolCallId: 'agent-1' });

    expect(next[0].subagentActivity?.[0].isError).toBe(true);
    expect(next[0].subagentActivity?.[0].completedAt).toEqual(expect.any(Number));
  });

  it('falls back to flat rendering when the parent card is not found', () => {
    const next = applyToolStart(
      [],
      { toolCallId: 'read-1', toolName: 'Read', args: {}, parentToolCallId: 'missing-parent' },
      new Map(),
    );

    expect(next).toHaveLength(1);
    expect(next[0].type).toBe('tool_call');
    expect(next[0].toolCall?.id).toBe('read-1');
  });

  it('nests subagent_text into the parent card and drops it if no parent exists', () => {
    const withParent = applySubagentText([agentCard('agent-1')], { parentToolCallId: 'agent-1', text: 'hello' });
    expect(withParent[0].subagentActivity?.[0]).toMatchObject({ kind: 'text', text: 'hello' });

    const withoutParent = applySubagentText([], { parentToolCallId: 'missing', text: 'hello' });
    expect(withoutParent).toEqual([]);
  });

  it('merges streaming deltas into one stable activity entry', () => {
    const first = applySubagentActivityDelta([agentCard('agent-1')], {
      parentToolCallId: 'agent-1',
      activityId: 'stream-1',
      kind: 'thinking',
      delta: 'trace ',
    });
    const second = applySubagentActivityDelta(first, {
      parentToolCallId: 'agent-1',
      activityId: 'stream-1',
      kind: 'thinking',
      delta: 'the pipe',
    });

    expect(second[0].subagentActivity).toHaveLength(1);
    expect(second[0].subagentActivity?.[0]).toMatchObject({
      id: 'stream-1',
      kind: 'thinking',
      text: 'trace the pipe',
    });
  });

  it('shows skills as preloaded subagent metadata', () => {
    const next = applySubagentSkills([agentCard('agent-1')], {
      parentToolCallId: 'agent-1',
      skills: ['how-to-see-flowsheet', 'instrument-types'],
    });

    expect(next[0].subagentActivity?.[0]).toMatchObject({
      kind: 'skill',
      text: 'Preloaded: how-to-see-flowsheet, instrument-types',
    });
  });

  it('marks the parent Agent card complete and clears its live status on task notification', () => {
    const items: MessageListItem[] = [
      agentCard('agent-1'),
      {
        type: 'status',
        id: 'status-1',
        timestamp: 1,
        agentState: {
          thinking: true,
          subagent: { toolCallId: 'agent-1', name: 'office-quality-reviewer', lastToolName: 'Read' },
        },
      },
    ];

    const next = applyTaskNotificationEvent(items, {
      timestamp: 2,
      notification: {
        taskId: 'task-1',
        toolUseId: 'agent-1',
        status: 'completed',
        summary: 'Review completed',
      },
    }, 'session-1');

    const card = next.find((item) => item.toolCall?.id === 'agent-1');
    const status = next.find((item) => item.type === 'status');
    expect(card?.toolResponse).toMatchObject({ tool_call_id: 'agent-1', output: 'Review completed' });
    expect(status?.agentState?.subagent).toBeUndefined();
    expect(next.some((item) => item.type === 'task_notification')).toBe(true);
  });
});
