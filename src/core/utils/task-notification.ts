/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Task Notification Parser - Parses <task-notification> XML blocks injected into
 * the conversation when a background subagent (Agent tool) finishes.
 */

export interface TaskNotification {
  taskId: string;
  toolUseId?: string;
  outputFile?: string;
  status: string; // 'completed' | 'failed' | ... kept as-is from the source XML
  summary: string;
  result?: string; // may be multi-line / contain markdown
  usage?: {
    subagentTokens?: number;
    toolUses?: number;
    durationMs?: number;
  };
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : undefined;
}

function parseUsage(block: string): TaskNotification['usage'] {
  const usageBlock = extractTag(block, 'usage');
  if (!usageBlock) return undefined;

  const subagentTokensStr = extractTag(usageBlock, 'subagent_tokens');
  const toolUsesStr = extractTag(usageBlock, 'tool_uses');
  const durationMsStr = extractTag(usageBlock, 'duration_ms');

  const usage: TaskNotification['usage'] = {};
  if (subagentTokensStr !== undefined) usage.subagentTokens = Number(subagentTokensStr);
  if (toolUsesStr !== undefined) usage.toolUses = Number(toolUsesStr);
  if (durationMsStr !== undefined) usage.durationMs = Number(durationMsStr);

  return Object.keys(usage).length > 0 ? usage : undefined;
}

/** Parses 0~N <task-notification> blocks out of a raw message content string. */
export function parseTaskNotifications(content: string): TaskNotification[] {
  if (!content.includes('<task-notification>')) {
    return [];
  }

  const notifications: TaskNotification[] = [];
  const blockRegex = /<task-notification>([\s\S]*?)<\/task-notification>/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const block = match[1];

    const taskId = extractTag(block, 'task-id');
    const status = extractTag(block, 'status');
    const summary = extractTag(block, 'summary');

    // Required fields missing - skip this block rather than showing raw XML
    if (!taskId || !status || !summary) {
      continue;
    }

    notifications.push({
      taskId,
      toolUseId: extractTag(block, 'tool-use-id'),
      outputFile: extractTag(block, 'output-file'),
      status,
      summary,
      result: extractTag(block, 'result'),
      usage: parseUsage(block),
    });
  }

  return notifications;
}
