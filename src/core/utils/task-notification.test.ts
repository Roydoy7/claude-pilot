/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Unit tests for parseTaskNotifications()
 */

import { describe, it, expect } from 'vitest';
import { parseTaskNotifications } from './task-notification.js';

const SAMPLE = `<task-notification>
<task-id>adce27c3e34038287</task-id>
<tool-use-id>toolu_vrtx_015eLMHJo3DkoZzk8c1aNiJT</tool-use-id>
<output-file>C:\\Users\\ray\\.claude\\tasks\\adce27c3e34038287.output</output-file>
<status>completed</status>
<summary>Agent "Instrument naming - Sheet 014" finished</summary>
<note>A task-notification fires each time this agent stops ...</note>
<result>I now have a clear picture of all instruments</result>
<usage><subagent_tokens>15955</subagent_tokens><tool_uses>6</tool_uses><duration_ms>146421</duration_ms></usage>
</task-notification>`;

describe('parseTaskNotifications', () => {
  it('returns an empty array when there is no task-notification block', () => {
    expect(parseTaskNotifications('hello world')).toEqual([]);
  });

  it('parses a single well-formed block', () => {
    const result = parseTaskNotifications(SAMPLE);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      taskId: 'adce27c3e34038287',
      toolUseId: 'toolu_vrtx_015eLMHJo3DkoZzk8c1aNiJT',
      outputFile: 'C:\\Users\\ray\\.claude\\tasks\\adce27c3e34038287.output',
      status: 'completed',
      summary: 'Agent "Instrument naming - Sheet 014" finished',
      result: 'I now have a clear picture of all instruments',
      usage: {
        subagentTokens: 15955,
        toolUses: 6,
        durationMs: 146421,
      },
    });
  });

  it('parses multiple blocks in the same content string', () => {
    const doubled = SAMPLE + '\n' + SAMPLE.replace('adce27c3e34038287', 'other-task-id');
    const result = parseTaskNotifications(doubled);
    expect(result).toHaveLength(2);
    expect(result[0].taskId).toBe('adce27c3e34038287');
    expect(result[1].taskId).toBe('other-task-id');
  });

  it('handles a multi-line result', () => {
    const withMultilineResult = SAMPLE.replace(
      '<result>I now have a clear picture of all instruments</result>',
      '<result>Line one\nLine two\nLine three</result>',
    );
    const result = parseTaskNotifications(withMultilineResult);
    expect(result[0].result).toBe('Line one\nLine two\nLine three');
  });

  it('omits usage when the usage block is missing', () => {
    const withoutUsage = SAMPLE.replace(
      /<usage>[\s\S]*?<\/usage>/,
      '',
    );
    const result = parseTaskNotifications(withoutUsage);
    expect(result[0].usage).toBeUndefined();
  });

  it('omits result when the result tag is missing', () => {
    const withoutResult = SAMPLE.replace(
      /<result>[\s\S]*?<\/result>/,
      '',
    );
    const result = parseTaskNotifications(withoutResult);
    expect(result[0].result).toBeUndefined();
  });

  it('returns an empty array when required fields (summary/status) are missing', () => {
    const missingSummary = SAMPLE.replace(
      /<summary>[\s\S]*?<\/summary>/,
      '',
    );
    expect(parseTaskNotifications(missingSummary)).toEqual([]);

    const missingStatus = SAMPLE.replace(
      /<status>[\s\S]*?<\/status>/,
      '',
    );
    expect(parseTaskNotifications(missingStatus)).toEqual([]);

    const missingTaskId = SAMPLE.replace(
      /<task-id>[\s\S]*?<\/task-id>/,
      '',
    );
    expect(parseTaskNotifications(missingTaskId)).toEqual([]);
  });

  it('does not include the note field in the parsed result', () => {
    const result = parseTaskNotifications(SAMPLE);
    expect(result[0]).not.toHaveProperty('note');
  });
});
