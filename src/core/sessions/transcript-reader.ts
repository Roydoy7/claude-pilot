/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Transcript Reader - Reads SDK transcript files and converts to HistoryMessage format
 * Based on Python SDK's message_parser.py implementation
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { MessageContent, ContentBlock } from '../types/message-types.js';
import type { UsageMetadata, HistoryMessage } from '../agents/claude-agent.js';

/**
 * SDK transcript entry structure
 * Matches the format from cli.js transcript files
 */
interface SDKTranscriptEntry {
  type: 'user' | 'assistant' | 'queue-operation' | 'system' | 'result' | 'stream_event';
  sessionId?: string;
  message?: {
    role?: 'user' | 'assistant';
    content: string | ContentBlock[];
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  timestamp?: string;
  uuid?: string;
  parent_tool_use_id?: string | null;
}

/**
 * Get transcript file path for a Claude session ID
 * SDK stores transcripts at: ~/.claude/projects/{project-name}/{claude-session-id}.jsonl
 * @param claudeSessionId - The SDK's session ID (not our local UUID sessionId)
 * @param sessionCwd - The session's working directory (optional, defaults to process.cwd())
 */
function getTranscriptPath(claudeSessionId: string, sessionCwd?: string): string {
  const homeDir = os.homedir();
  const cwd = sessionCwd || process.cwd();

  // Convert cwd to project name: /workspaces/claude-pilot -> -workspaces-claude-pilot
  const projectName = cwd.replace(/\//g, '-');

  return path.join(homeDir, '.claude', 'projects', projectName, `${claudeSessionId}.jsonl`);
}

/**
 * Convert SDK usage to our UsageMetadata format
 */
function convertUsage(sdkUsage?: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): UsageMetadata | undefined {
  if (!sdkUsage) return undefined;

  return {
    input_tokens: sdkUsage.input_tokens || 0,
    output_tokens: sdkUsage.output_tokens || 0,
    total_tokens: (sdkUsage.input_tokens || 0) + (sdkUsage.output_tokens || 0),
  };
}

/**
 * Extract tool calls and responses from content blocks
 */
function extractToolInfo(content: MessageContent): {
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  toolResponses: Array<{ tool_call_id: string; output: string; error?: string }>;
} {
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  const toolResponses: Array<{ tool_call_id: string; output: string; error?: string }> = [];

  if (typeof content === 'string') {
    return { toolCalls, toolResponses };
  }

  for (const block of content) {
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        args: block.input,
      });
    } else if (block.type === 'tool_result') {
      toolResponses.push({
        tool_call_id: block.tool_use_id,
        output: typeof block.content === 'string' ? block.content : JSON.stringify(block.content || ''),
        error: block.is_error ? 'Tool execution failed' : undefined,
      });
    }
  }

  return { toolCalls, toolResponses };
}

/**
 * Read transcript file and convert to HistoryMessage array
 * @param claudeSessionId - Claude SDK's session ID
 * @param cwd - Session's working directory
 */
export function readTranscript(claudeSessionId: string, cwd: string): HistoryMessage[] {
  try {
    // If no claudeSessionId, return empty (session hasn't been started)
    if (!claudeSessionId) {
      console.log(`No claudeSessionId provided (new session)`);
      return [];
    }

    const transcriptPath = getTranscriptPath(claudeSessionId, cwd);

    // Check if transcript file exists
    if (!fs.existsSync(transcriptPath)) {
      console.warn(`Transcript file not found: ${transcriptPath}`);
      return [];
    }

    const fileContent = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = fileContent.trim().split('\n');

    const history: HistoryMessage[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as SDKTranscriptEntry;

        // Skip queue operations and other non-message entries
        if (entry.type === 'queue-operation' || !entry.message) {
          continue;
        }

        const { role, content, usage } = entry.message;

        // Skip if no role or content
        if (!role || !content) continue;

        const historyMessage: HistoryMessage = {
          role,
          content,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          usage: convertUsage(usage),
        };

        // Extract tool calls and responses
        const { toolCalls, toolResponses } = extractToolInfo(content);

        if (role === 'assistant' && toolCalls.length > 0) {
          historyMessage.tool_calls = toolCalls;
        }

        if (role === 'user' && toolResponses.length > 0) {
          historyMessage.tool_responses = toolResponses;
        }

        history.push(historyMessage);
      } catch (parseError) {
        console.error('Failed to parse transcript line:', parseError);
        continue;
      }
    }

    return history;
  } catch (error) {
    console.error(`Failed to read transcript for claudeSessionId ${claudeSessionId}:`, error);
    return [];
  }
}


