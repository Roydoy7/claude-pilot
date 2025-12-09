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
 * SDK tool use result structure (from Bash, Read, etc.)
 */
interface SDKToolUseResult {
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;
  isImage?: boolean;
  // Generic output for non-Bash tools
  output?: string;
  error?: string;
}

/**
 * SDK usage structure from transcript files
 */
interface SDKUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string | null;
}

/**
 * SDK transcript entry structure
 * Matches the format from cli.js transcript files
 */
interface SDKTranscriptEntry {
  type: 'user' | 'assistant' | 'queue-operation' | 'system' | 'result' | 'stream_event';
  sessionId?: string;
  message?: {
    id?: string; // API message ID - used to merge streaming chunks
    role?: 'user' | 'assistant';
    content: string | ContentBlock[];
    model?: string;
    usage?: SDKUsage;
  };
  timestamp?: string;
  uuid?: string;
  parentUuid?: string | null; // Parent message UUID for linking
  parent_tool_use_id?: string | null;
  toolUseResult?: SDKToolUseResult; // Structured tool result from SDK
  isCompactSummary?: boolean; // Flag for compact summary messages (from /compact command)
  subtype?: string; // System message subtype (e.g., 'compact_boundary')
  isMeta?: boolean; // Flag for meta messages (e.g., "Caveat" warnings from /compact)
  error?: string; // Error type (e.g., 'rate_limit')
  isApiErrorMessage?: boolean; // Flag for API error messages (usage limit, etc.)
}

/**
 * Check if a message content is a system/internal message that should be filtered
 * These include:
 * - Meta messages (isMeta: true) - e.g., "Caveat" warnings
 * - Command messages containing <command-name> tags
 * - Command output messages containing <local-command-stdout> or <local-command-stderr> tags
 */
function isSystemMessage(content: string | ContentBlock[], isMeta?: boolean): boolean {
  // Filter meta messages
  if (isMeta) {
    return true;
  }

  // Only check string content for XML tags
  if (typeof content !== 'string') {
    return false;
  }

  // Filter command messages (e.g., /compact command)
  if (content.includes('<command-name>') || content.includes('<command-message>')) {
    return true;
  }

  // Filter command output messages
  if (content.includes('<local-command-stdout>') || content.includes('<local-command-stderr>')) {
    return true;
  }

  return false;
}

/**
 * Convert cwd path to SDK project name format
 * Examples:
 *   - Windows: 'C:\Users\Ray' -> 'C--Users-Ray'
 *   - Windows: 'C:\Code\claude-pilot' -> 'C--Code-claude-pilot'
 *   - Unix: '/workspaces/claude-pilot' -> '-workspaces-claude-pilot'
 *
 * SDK naming rules:
 *   - Drive letter case is preserved (C: stays C, c: stays c)
 *   - Colon becomes hyphen (C: -> C-)
 *   - Path separators (\ or /) become -
 */
function cwdToProjectName(cwd: string): string {
  // Normalize path separators to forward slash first
  let normalized = cwd.replace(/\\/g, '/');

  // Handle Windows drive letter: 'C:/...' -> 'C-/...' (colon becomes hyphen)
  if (/^[A-Za-z]:/.test(normalized)) {
    normalized = normalized[0] + '-' + normalized.slice(2);
  }

  // Replace all forward slashes with hyphens
  return normalized.replace(/\//g, '-');
}

/**
 * Get transcript file path for a Claude session ID
 * SDK stores transcripts at: ~/.claude/projects/{project-name}/{claude-session-id}.jsonl
 * @param claudeSessionId - The SDK's session ID (not our local UUID sessionId)
 * @param sessionCwd - The session's working directory (optional, defaults to process.cwd())
 * @returns The transcript file path, or null if not found
 */
function getTranscriptPath(claudeSessionId: string, sessionCwd?: string): string | null {
  const homeDir = os.homedir();
  const cwd = sessionCwd || process.cwd();
  const projectsDir = path.join(homeDir, '.claude', 'projects');

  const projectName = cwdToProjectName(cwd);
  const transcriptFile = `${claudeSessionId}.jsonl`;

  // Try the exact project name first
  const exactPath = path.join(projectsDir, projectName, transcriptFile);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  // On Windows, try alternate drive letter case (C vs c)
  if (/^[A-Za-z]-/.test(projectName)) {
    const altProjectName = projectName[0] === projectName[0].toUpperCase()
      ? projectName[0].toLowerCase() + projectName.slice(1)
      : projectName[0].toUpperCase() + projectName.slice(1);
    const altPath = path.join(projectsDir, altProjectName, transcriptFile);
    if (fs.existsSync(altPath)) {
      return altPath;
    }
  }

  // Not found
  return null;
}

/**
 * Convert SDK usage to our UsageMetadata format
 * Includes cache tokens for accurate context usage calculation
 */
function convertUsage(sdkUsage?: SDKUsage): UsageMetadata | undefined {
  if (!sdkUsage) return undefined;

  return {
    input_tokens: sdkUsage.input_tokens || 0,
    output_tokens: sdkUsage.output_tokens || 0,
    total_tokens: (sdkUsage.input_tokens || 0) + (sdkUsage.output_tokens || 0),
    cache_read_input_tokens: sdkUsage.cache_read_input_tokens,
    cache_creation_input_tokens: sdkUsage.cache_creation_input_tokens,
    cache_creation: sdkUsage.cache_creation,
    service_tier: sdkUsage.service_tier,
  };
}

/**
 * Extract tool calls and responses from content blocks
 * @param content - Message content (string or ContentBlock array)
 * @param toolUseResult - Optional structured tool result from SDK (contains stdout, stderr, etc.)
 */
function extractToolInfo(content: MessageContent, toolUseResult?: SDKToolUseResult): {
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
      // Use structured toolUseResult if available (has stdout, stderr, etc.)
      // This provides better output formatting for Bash and other tools
      let outputContent: string;

      if (toolUseResult) {
        // SDK provides structured result - serialize it for our format
        outputContent = JSON.stringify(toolUseResult);
      } else {
        // Fallback to content from the block
        outputContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
      }

      // When is_error is true, the content contains the actual error message
      // Put it in the error field so UI can display it correctly
      const errorContent = block.is_error
        ? (typeof block.content === 'string' ? block.content : JSON.stringify(block.content || 'Tool execution failed'))
        : undefined;

      toolResponses.push({
        tool_call_id: block.tool_use_id,
        output: block.is_error ? '' : outputContent,
        error: errorContent,
      });
    }
  }

  return { toolCalls, toolResponses };
}

/**
 * Merge content blocks from multiple entries with the same message ID
 * SDK stores streaming responses as separate entries, we need to merge them
 */
function mergeContentBlocks(existing: MessageContent, incoming: MessageContent): ContentBlock[] {
  const existingBlocks = typeof existing === 'string'
    ? [{ type: 'text' as const, text: existing }]
    : existing;
  const incomingBlocks = typeof incoming === 'string'
    ? [{ type: 'text' as const, text: incoming }]
    : incoming;

  return [...existingBlocks, ...incomingBlocks];
}

/**
 * Delete transcript file for a Claude session ID
 * @param claudeSessionId - Claude SDK's session ID
 * @param cwd - Session's working directory
 * @returns true if deleted successfully or file didn't exist, false on error
 */
export function deleteTranscript(claudeSessionId: string, cwd: string): boolean {
  try {
    if (!claudeSessionId) {
      return true; // No transcript to delete
    }

    const transcriptPath = getTranscriptPath(claudeSessionId, cwd);

    if (!transcriptPath) {
      return true; // File doesn't exist, nothing to delete
    }

    fs.unlinkSync(transcriptPath);
    console.log(`Deleted transcript file: ${transcriptPath}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete transcript for claudeSessionId ${claudeSessionId}:`, error);
    return false;
  }
}

/**
 * Read transcript file and convert to HistoryMessage array
 * Merges streaming chunks that have the same message.id into single messages
 * Also merges tool_responses from user messages back into corresponding assistant messages
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

    // Check if transcript file was found
    if (!transcriptPath) {
      console.warn(`Transcript file not found for claudeSessionId: ${claudeSessionId}, cwd: ${cwd}`);
      return [];
    }

    const fileContent = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = fileContent.trim().split('\n');

    // Map to track messages by their API message ID for merging streaming chunks
    const messageMap = new Map<string, HistoryMessage>();
    // Map to track tool_call_id -> assistant message for merging tool responses
    const toolCallToMessageMap = new Map<string, HistoryMessage>();
    const history: HistoryMessage[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as SDKTranscriptEntry;

        // Skip queue operations and other non-message entries
        if (entry.type === 'queue-operation' || !entry.message) {
          continue;
        }

        const { id: messageId, role, content, usage } = entry.message;

        // Skip if no role or content
        if (!role || !content) continue;

        // Skip system/internal messages (meta messages, command messages, command output)
        if (isSystemMessage(content, entry.isMeta)) {
          continue;
        }

        // For assistant messages with same message ID, merge content blocks
        // This handles the case where thinking and text are streamed separately
        if (role === 'assistant' && messageId) {
          const existingMessage = messageMap.get(messageId);

          if (existingMessage) {
            // Merge content blocks
            existingMessage.content = mergeContentBlocks(existingMessage.content, content);

            // Update usage if available (later chunks may have updated usage)
            if (usage) {
              existingMessage.usage = convertUsage(usage);
            }

            // Update tool calls and track them
            const { toolCalls } = extractToolInfo(content);
            if (toolCalls.length > 0) {
              existingMessage.tool_calls = [
                ...(existingMessage.tool_calls || []),
                ...toolCalls,
              ];
              // Track each tool_call_id -> this assistant message
              for (const tc of toolCalls) {
                toolCallToMessageMap.set(tc.id, existingMessage);
              }
            }
            continue; // Skip adding as new message
          }
        }

        // Extract tool calls and responses
        // Pass toolUseResult for user messages with tool_result content
        const { toolCalls, toolResponses } = extractToolInfo(content, entry.toolUseResult);

        // For user messages with tool_responses, merge them into the corresponding assistant message
        if (role === 'user' && toolResponses.length > 0) {
          for (const response of toolResponses) {
            const assistantMsg = toolCallToMessageMap.get(response.tool_call_id);
            if (assistantMsg) {
              // Add tool_response to the assistant message that has this tool_call
              if (!assistantMsg.tool_responses) {
                assistantMsg.tool_responses = [];
              }
              assistantMsg.tool_responses.push(response);
            }
          }
          // Skip adding user messages that only contain tool_result
          // (they are internal SDK messages, not real user input)
          continue;
        }

        const historyMessage: HistoryMessage = {
          role,
          content,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          usage: convertUsage(usage),
          isCompactSummary: entry.isCompactSummary, // Preserve compact summary flag
          isUsageLimitError: entry.isApiErrorMessage && entry.error === 'rate_limit', // Flag for usage limit errors
        };

        if (role === 'assistant' && toolCalls.length > 0) {
          historyMessage.tool_calls = toolCalls;
          // Track each tool_call_id -> this assistant message
          for (const tc of toolCalls) {
            toolCallToMessageMap.set(tc.id, historyMessage);
          }
        }

        // Track assistant messages by ID for potential merging
        if (role === 'assistant' && messageId) {
          messageMap.set(messageId, historyMessage);
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


