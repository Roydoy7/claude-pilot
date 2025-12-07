/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Message types - Shared type definitions for messages and content blocks
 * This file contains only type definitions to avoid bundling Node.js dependencies
 */

/**
 * Content block types (compatible with Anthropic SDK and transcript format)
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content?: string | unknown; is_error?: boolean }
  | { type: 'thinking'; thinking: string; signature?: string };

/**
 * Message content type
 * Supports text strings and content blocks (text, images, tool_use, tool_result, thinking)
 */
export type MessageContent = string | ContentBlock[];
