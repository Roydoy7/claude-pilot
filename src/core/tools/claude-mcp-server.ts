/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Claude MCP Server - Lets an agent delegate an isolated sub-task to a fresh
 * Claude API call (via @anthropic-ai/sdk), for sub-tasks that need language
 * understanding or judgment rather than deterministic code logic (e.g.
 * rewriting, summarizing, translating, classifying). The call is stateless -
 * it has no access to the calling agent's conversation, files, or other tools.
 *
 * Tools:
 * - ask_claude: Send a self-contained prompt to Claude and get back its text reply
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { tokenStore } from '../auth/token-store.js';
import { ClaudeModel } from '../providers/model-list-manager.js';
import { getErrorMessage } from '../errors.js';

const READ_ONLY = { annotations: { readOnlyHint: true } };

const ASK_CLAUDE_MODELS = [ClaudeModel.HAIKU_4_5, ClaudeModel.SONNET_4_6, ClaudeModel.OPUS_4_8] as const;

function ok(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function fail(context: string, err: unknown): CallToolResult {
  const message = getErrorMessage(err);
  console.error(`[claude tool error] ${context}: ${message}`);
  return { content: [{ type: 'text', text: `Error (${context}): ${message}` }], isError: true };
}

/**
 * Build an Anthropic client from whatever credentials claude-pilot itself is
 * using - environment/claude-settings API keys go through `apiKey` (x-api-key
 * header), OAuth access tokens go through `authToken` (Bearer auth), matching
 * how @anthropic-ai/sdk distinguishes the two.
 */
function createAnthropicClient(): Anthropic {
  const token = tokenStore.getToken();
  if (!token || !tokenStore.isTokenValid()) {
    throw new Error('No valid Anthropic credentials available (set ANTHROPIC_API_KEY or login with OAuth)');
  }
  const baseURL = tokenStore.getBaseUrl();
  const isOAuth = tokenStore.getTokenSource() === 'oauth';
  return new Anthropic(isOAuth ? { authToken: token, baseURL } : { apiKey: token, baseURL });
}

function textOf(content: Anthropic.Message['content']): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

const askClaude = tool(
  'ask_claude',
  'Delegate an isolated sub-task to a fresh Claude API call - for sub-tasks that need language ' +
    'understanding or judgment rather than deterministic code logic (e.g. rewriting, summarizing, ' +
    'translating, classifying, extracting). This call is stateless and has NO access to the calling ' +
    "agent's conversation, files, or other tools - put everything Claude needs directly in `prompt`.",
  {
    prompt: z.string().describe('The complete, self-contained task and all context/content Claude needs to complete it.'),
    system: z.string().optional().describe('Optional system prompt to constrain role, tone, or output format.'),
    model: z
      .enum(ASK_CLAUDE_MODELS)
      .default(ClaudeModel.HAIKU_4_5)
      .describe('Model for this sub-task. Defaults to Haiku 4.5 (fast, cheap) - use Sonnet/Opus only for sub-tasks that need stronger reasoning.'),
    maxTokens: z.number().int().min(1).max(8192).default(1024).describe('Maximum output tokens.'),
  },
  async (args) => {
    try {
      const client = createAnthropicClient();
      const message = await client.messages.create({
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: [{ role: 'user', content: args.prompt }],
      });
      const text = textOf(message.content);
      if (!text) {
        return fail('ask_claude', `Claude returned no text content (stop_reason: ${message.stop_reason ?? 'unknown'})`);
      }
      return ok(text);
    } catch (err) {
      return fail('ask_claude', err);
    }
  },
  READ_ONLY,
);

/**
 * Claude MCP server instance (direct Anthropic API access for sub-task delegation)
 */
export const claudeMcpServer = createSdkMcpServer({
  name: 'claude',
  version: '1.0.0',
  tools: [askClaude],
});
