/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude Agent - wraps Claude Agent SDK query() function
 * Provides streaming execution with tool support via MCP
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKStatusMessage,
  SDKHookResponseMessage,
  SDKToolProgressMessage,
  SDKAuthStatusMessage,
  Options,
} from '@anthropic-ai/claude-agent-sdk';
import { RoleType, getRoleDisplayName } from '../roles/role-enum.js';
import { SessionManager } from '../sessions/session-manager.js';
import { createRequire } from 'module';
import path from 'path';
import type { ContentBlock, MessageContent } from '../types/message-types.js';

/**
 * Re-export message types for backward compatibility
 */
export type { ContentBlock, MessageContent };

/**
 * Get the path to Claude Agent SDK's cli.js
 * This is needed because when running from compiled dist/, import.meta.url
 * points to the wrong location
 */
function getClaudeCodeExecutablePath(): string {
  const require = createRequire(import.meta.url);
  const sdkPath = require.resolve('@anthropic-ai/claude-agent-sdk');
  return path.join(path.dirname(sdkPath), 'cli.js');
}

/**
 * Token usage metadata - matches SDK's usage structure
 */
export interface UsageMetadata {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_cost_usd?: number;
  service_tier?: string | null;
}

/**
 * Tool call for approval
 */
export interface ToolCallForApproval {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

/**
 * Agent execution state
 */
export interface AgentState {
  thinking: boolean;
  tool?: {
    type: 'executing' | 'waiting_approval';
    toolName?: string;
  };
}

/**
 * Todo item structure
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

/**
 * Stream event types - yielded during agent execution
 */
export type StreamEvent =
  | { type: 'state'; state: AgentState }
  | { type: 'text_delta'; text: string; usage?: UsageMetadata }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; toolCallId: string; output: string; error?: string }
  | { type: 'tool_progress'; toolName: string; toolCallId?: string; progressType: string; message: string; timestamp: number }
  | { type: 'interrupt'; interruptId: string; toolCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> }
  | { type: 'error'; error: string; details?: string }
  | { type: 'checkpoint' }
  | { type: 'done'; usage?: UsageMetadata };

/**
 * History message for conversation
 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: MessageContent;
  timestamp?: number;
  usage?: UsageMetadata;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  tool_responses?: Array<{ tool_call_id: string; output: string; error?: string }>;
}

/**
 * Agent configuration interface
 * Extends SDK Options with agent-specific metadata
 */
export interface ClaudeAgentConfig extends Options {
  // Agent metadata (not part of SDK Options)
  role: RoleType;

  // Override model to make it required via modelName alias
  model?: string;
  modelName: string;
}

/**
 * Claude Agent instance
 * Wraps Claude Agent SDK with session context
 */
export class ClaudeAgent {
  public readonly config: ClaudeAgentConfig;
  public readonly sessionId: string; //This is our local UUID session ID, created by frontend

  private abortController: AbortController | null = null;
  private turnCancelled: boolean = false;
  private conversationHistory: HistoryMessage[] = [];
  private claudeSessionId: string | undefined; // Claude SDK's session ID for resuming (from system init message)
  private cwd: string; // Session's working directory for transcript file lookup

  constructor(
    config: ClaudeAgentConfig,
    sessionId: string,
    cwd: string,
    claudeSessionId?: string
  ) {
    this.config = config;
    this.sessionId = sessionId;
    this.cwd = cwd;
    this.claudeSessionId = claudeSessionId;
  }

  /**
   * Cancel the ongoing request
   */
  cancel(): void {
    this.turnCancelled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if current request is cancelled
   */
  isCancelled(): boolean {
    return this.turnCancelled || this.abortController?.signal.aborted || false;
  }

  /**
   * Process SDK messages and yield StreamEvents
   */
  private async *processQueryMessages(
    queryInstance: Query
  ): AsyncGenerator<StreamEvent, void, unknown> {
    yield { type: 'state', state: { thinking: true } };

    let accumulatedText = '';
    let currentToolUseId: string | undefined;
    let finalUsage: UsageMetadata | undefined;

    try {
      for await (const chunk of queryInstance) {
        if (this.isCancelled()) {
          yield { type: 'error', error: 'Request cancelled by user' };
          break;
        }

        switch (chunk.type) {
          case 'stream_event': {
            const partialMessage = chunk as SDKPartialAssistantMessage;
            const event = partialMessage.event;

            // Note: Don't yield text_delta or tool_start here - wait for complete assistant message
            // stream_event is for partial updates, assistant message has the complete content
            // Only update state here to show tool is being used

            if (event.type === 'content_block_start') {
              const contentBlock = (event as { content_block?: { type?: string; id?: string; name?: string } }).content_block;
              if (contentBlock?.type === 'tool_use' && contentBlock.name) {
                // Only update state - tool_start will be sent from assistant message with complete args
                yield {
                  type: 'state',
                  state: { thinking: true, tool: { type: 'executing', toolName: contentBlock.name } },
                };
              }
            }
            break;
          }

          case 'assistant': {
            const assistantMessage = chunk as SDKAssistantMessage;
            yield { type: 'checkpoint' };

            // Update session checkpoint metadata
            if (assistantMessage.session_id) {
              const sessionManager = SessionManager.getInstance();
              sessionManager.updateSessionCheckpoint(this.sessionId, assistantMessage.session_id);
            }

            // Extract and yield message content from assistant message
            if (assistantMessage.message?.content) {
              const content = assistantMessage.message.content;

              if (Array.isArray(content)) {
                for (const block of content) {
                  switch (block.type) {
                    case 'thinking': {
                      // Extended thinking content
                      if ('thinking' in block) {
                        const thinkingBlock = block as { type: 'thinking'; thinking: string };
                        yield { type: 'thinking', thinking: thinkingBlock.thinking };
                      }
                      break;
                    }

                    case 'redacted_thinking': {
                      // Redacted thinking - inform user that thinking was redacted
                      yield { type: 'thinking', thinking: '[Thinking content redacted]' };
                      break;
                    }

                    case 'text': {
                      // Text content
                      if (block.text) {
                        // Check for API error in response
                        if (block.text.startsWith('API Error:')) {
                          yield { type: 'error', error: block.text };
                          yield { type: 'state', state: { thinking: false } };
                          yield { type: 'done' };
                          return;
                        }
                        accumulatedText += block.text;
                        yield { type: 'text_delta', text: block.text };
                      }
                      break;
                    }

                    case 'tool_use': {
                      // Tool use block - contains complete tool call with args
                      // Note: tool_start was already sent from stream_event with empty args
                      // Here we have the complete args, so update the tool call
                      const toolUseBlock = block as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
                      currentToolUseId = toolUseBlock.id;
                      // Yield tool_start with complete args (overwrites the earlier empty-args version)
                      yield {
                        type: 'tool_start',
                        toolCallId: toolUseBlock.id,
                        toolName: toolUseBlock.name,
                        args: toolUseBlock.input,
                      };
                      break;
                    }

                    case 'server_tool_use': {
                      // Server-managed tools (e.g., web_search)
                      const serverToolBlock = block as { type: 'server_tool_use'; id: string; name: string; input: Record<string, unknown> };
                      yield {
                        type: 'tool_start',
                        toolCallId: serverToolBlock.id,
                        toolName: `server:${serverToolBlock.name}`,
                        args: serverToolBlock.input,
                      };
                      break;
                    }

                    case 'web_search_tool_result': {
                      // Web search results - treat as tool end
                      const webSearchBlock = block as { type: 'web_search_tool_result'; tool_use_id: string; content: unknown };
                      yield {
                        type: 'tool_end',
                        toolName: 'server:web_search',
                        toolCallId: webSearchBlock.tool_use_id,
                        output: JSON.stringify(webSearchBlock.content),
                      };
                      break;
                    }

                    // Unknown block types are silently ignored
                  }
                }
              }
            }
            break;
          }

          case 'user': {
            const userMessage = chunk as SDKUserMessage;
            if (userMessage.tool_use_result !== undefined && currentToolUseId) {
              const output = typeof userMessage.tool_use_result === 'string'
                ? userMessage.tool_use_result
                : JSON.stringify(userMessage.tool_use_result);

              yield {
                type: 'tool_end',
                toolName: 'unknown',
                toolCallId: currentToolUseId,
                output,
              };
              yield { type: 'state', state: { thinking: true } };
              currentToolUseId = undefined;
            }
            break;
          }

          case 'tool_progress': {
            const progressMessage = chunk as SDKToolProgressMessage;
            yield {
              type: 'tool_progress',
              toolName: progressMessage.tool_name,
              toolCallId: progressMessage.tool_use_id,
              progressType: 'progress',
              message: `Elapsed: ${progressMessage.elapsed_time_seconds}s`,
              timestamp: Date.now(),
            };
            break;
          }

          case 'result': {
            const resultMessage = chunk as SDKResultMessage;

            // Update session checkpoint metadata on result
            if (resultMessage.session_id) {
              const sessionManager = SessionManager.getInstance();
              sessionManager.updateSessionCheckpoint(this.sessionId, resultMessage.session_id);
            }

            // Build comprehensive usage from result (authoritative totals)
            const usage: UsageMetadata = {
              input_tokens: resultMessage.usage.input_tokens,
              output_tokens: resultMessage.usage.output_tokens,
              total_tokens: resultMessage.usage.input_tokens + resultMessage.usage.output_tokens,
              cache_read_input_tokens: resultMessage.usage.cache_read_input_tokens,
              cache_creation_input_tokens: resultMessage.usage.cache_creation_input_tokens,
              total_cost_usd: resultMessage.total_cost_usd,
              service_tier: resultMessage.usage.service_tier,
            };

            if (resultMessage.subtype === 'success') {
              if (accumulatedText) {
                this.conversationHistory.push({
                  role: 'assistant',
                  content: accumulatedText,
                  timestamp: Date.now(),
                  usage,
                });
              }
              // Store usage for done event
              finalUsage = usage;
            } else {
              const errors = 'errors' in resultMessage ? resultMessage.errors : [];
              yield {
                type: 'error',
                error: `Execution ${resultMessage.subtype}: ${errors.join(', ')}`,
              };
            }
            break;
          }

          case 'system': {
            // Handle system messages (init, compact_boundary, status, hook_response)
            const systemMessage = chunk as SDKSystemMessage | SDKCompactBoundaryMessage | SDKStatusMessage | SDKHookResponseMessage;

            if (systemMessage.subtype === 'init') {
              // System initialization - store session_id for resume
              this.claudeSessionId = systemMessage.session_id;

              // Save Claude session ID to SessionManager for persistence
              if (systemMessage.session_id) {
                const sessionManager = SessionManager.getInstance();
                sessionManager.updateClaudeSessionId(this.sessionId, systemMessage.session_id);
              }
            } else if (systemMessage.subtype === 'compact_boundary') {
              // Conversation compaction boundary - checkpoint event
              yield { type: 'checkpoint' };
            } else if (systemMessage.subtype === 'status') {
              // Status update (e.g., 'compacting')
              const statusMsg = systemMessage as SDKStatusMessage;
              if (statusMsg.status === 'compacting') {
                yield { type: 'state', state: { thinking: true } };
              }
            }
            // hook_response: Hook responses are internal, no need to yield to frontend
            break;
          }

          case 'auth_status': {
            // Authentication status message
            const authMessage = chunk as SDKAuthStatusMessage;
            if (authMessage.error) {
              yield {
                type: 'error',
                error: `Authentication error: ${authMessage.error}`,
              };
            }
            break;
          }

          // user message replay is same structure as user, handled by 'user' case
          // The SDK sends it with type: 'user' and isReplay: true flag
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield {
        type: 'error',
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      };
    } finally {
      yield { type: 'state', state: { thinking: false } };
      yield { type: 'done', usage: finalUsage };
    }
  }

  /**
   * Create message generator for streaming input mode
   * Returns AsyncIterable<SDKUserMessage> as required by SDK
   */
  private async *generateMessages(content: MessageContent): AsyncIterable<SDKUserMessage> {
    // Convert MessageContent to SDK's expected format
    let messageContent: string | Array<{ type: string; text?: string; source?: unknown }>;

    if (typeof content === 'string') {
      messageContent = content;
    } else {
      // Convert content blocks to SDK format
      messageContent = content.map(block => {
        if (block.type === 'image') {
          return {
            type: 'image',
            source: block.source,
          };
        } else if (block.type === 'text') {
          return {
            type: 'text',
            text: block.text || '',
          };
        } else {
          // For other types (tool_use, tool_result, thinking), convert to text representation
          return {
            type: 'text',
            text: JSON.stringify(block),
          };
        }
      });
    }

    // Yield SDK-compatible user message
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: messageContent,
      },
      parent_tool_use_id: null,
    } as SDKUserMessage;
  }

  /**
   * Run agent with user input (using streaming input mode)
   */
  async *run(input: MessageContent): AsyncGenerator<StreamEvent, void, unknown> {
    this.abortController = new AbortController();
    this.turnCancelled = false;

    this.conversationHistory.push({
      role: 'user',
      content: input,
      timestamp: Date.now(),
    });

    try {
      // Get session to access cwd and additionalDirectories
      const sessionManager = SessionManager.getInstance();
      const session = sessionManager.loadSession(this.sessionId);

      // Build Options from config, excluding agent-specific metadata
      const { role, modelName, ...sdkOptions } = this.config;
      const options: Options = {
        ...sdkOptions,
        model: modelName,
        cwd: this.cwd, // Set current working directory from session
        additionalDirectories: session?.additionalDirectories, // Set additional directories from session
        abortController: this.abortController,
        maxTurns: 50,
        resume: this.claudeSessionId,
        // includePartialMessages: true,  // Removed: requires --print flag which SDK doesn't pass
        pathToClaudeCodeExecutable: getClaudeCodeExecutablePath(),
        settingSources: sdkOptions.settingSources || ['local'],
        stderr: (message: string) => {
          console.error('[Claude SDK stderr]', message);
        },
      };

      // Use streaming input mode with async generator
      const queryInstance = query({
        prompt: this.generateMessages(input),
        options,
      });

      yield* this.processQueryMessages(queryInstance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', error: errorMessage };
      yield { type: 'state', state: { thinking: false } };
      yield { type: 'done' };
    } finally {
      this.abortController = null;
      this.turnCancelled = false;
    }
  }

  /**
   * Resume execution - not needed with canUseTool callback
   */
  async *resume(
    _decisions: Array<{ decision: 'approve' | 'reject' | 'edit'; args?: Record<string, unknown>; feedback?: string }>
  ): AsyncGenerator<StreamEvent, void, unknown> {
    yield { type: 'error', error: 'Resume not needed - use canUseTool callback for approvals' };
    yield { type: 'done' };
  }

  /**
   * Get conversation history from SDK transcript file
   * SDK stores conversation history in transcript files, we read them directly for UI display
   */
  async getHistory(): Promise<HistoryMessage[]> {
    // Read history from SDK transcript file if claudeSessionId is available
    if (this.claudeSessionId) {
      const { readTranscript } = await import('../sessions/transcript-reader.js');
      return readTranscript(this.claudeSessionId, this.cwd);
    }

    // Fallback to in-memory history if no claudeSessionId yet
    return this.conversationHistory;
  }

  /**
   * Get agent role
   */
  getRole(): RoleType {
    return this.config.role;
  }

  /**
   * Get role display name
   */
  getRoleDisplayName(): string {
    return getRoleDisplayName(this.config.role);
  }

  /**
   * Get model name
   */
  getModelName(): string {
    return this.config.modelName;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.claudeSessionId = undefined;
  }
}
