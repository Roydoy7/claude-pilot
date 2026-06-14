/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ToolCallItem Component - Standalone tool call display item
 * Displays tool calls as independent items in the message list
 * Features: No avatar, left indentation
 */

import { useState } from 'react';
import type { MessageListItem } from '../../../preload/preload-types';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  pythonRenderer,
  typescriptRenderer,
  imageRenderer,
  pptxRenderer,
  xlsxRenderer,
  defaultMcpRenderer,
  pdfRenderer,
  convertRenderer,
  markitdownRenderer,
  markdownToWordRenderer,
  docxRenderer,
  readRenderer,
  writeRenderer,
  editRenderer,
  bashRenderer,
  globRenderer,
  grepRenderer,
  lsRenderer,
  webFetchRenderer,
  webSearchRenderer,
  taskRenderer,
  todoWriteRenderer,
  taskCreateRenderer,
  taskGetRenderer,
  taskUpdateRenderer,
  taskListRenderer,
  multiEditRenderer,
  notebookEditRenderer,
  skillRenderer,
  isMcpToolError,
  ApprovalWaitingIcon,
  AnimatedApprovalText,
  PythonCodeDisplay,
} from './tool-renderers';
import type { ToolConfig } from './tool-renderers';

interface ToolCallItemProps {
  item: MessageListItem;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string, reason?: string) => void;
}


/**
 * Tool configurations registry - all imported from tool-renderers
 */
const TOOL_CONFIGS: Record<string, ToolConfig> = {
  // Code execution tools
  python: pythonRenderer,
  typescript: typescriptRenderer,

  // Document tools
  pdf: pdfRenderer,
  convert: convertRenderer,
  markitdown: markitdownRenderer,
  markdown_to_word: markdownToWordRenderer,

  // Claude Agent SDK tools
  Read: readRenderer,
  Write: writeRenderer,
  Bash: bashRenderer,
  Glob: globRenderer,
  Grep: grepRenderer,
  LS: lsRenderer,

  Edit: editRenderer,

  // Web tools
  WebFetch: webFetchRenderer,
  WebSearch: webSearchRenderer,

  // Task/Agent tools
  Task: taskRenderer,
  TodoWrite: todoWriteRenderer, // Legacy renderer kept for compatibility with historical sessions
  TaskCreate: taskCreateRenderer,
  TaskGet: taskGetRenderer,
  TaskUpdate: taskUpdateRenderer,
  TaskList: taskListRenderer,

  // Notebook tools
  MultiEdit: multiEditRenderer,
  NotebookEdit: notebookEditRenderer,

  // Skill tool
  Skill: skillRenderer,

  // MCP tools
  image: imageRenderer,
  pptx: pptxRenderer,
  xlsx: xlsxRenderer,
  docx: docxRenderer,
};

/**
 * Tool name aliases - maps MCP tool names to canonical names
 */
const TOOL_ALIASES: Record<string, string> = {
  'mcp__python__run': 'python',
  'mcp__pdf__process': 'pdf',
  'mcp__convert__convert': 'convert',
  'mcp__typescript__execute': 'typescript',
  'mcp__image__process': 'image',
  'mcp__pptx__process': 'pptx',
  'mcp__xlsx__process': 'xlsx',
  'mcp__docx__docx': 'docx',
};

/**
 * Get tool config, checking aliases first
 */
function getToolConfig(toolName: string): ToolConfig {
  // Check for exact match first
  if (TOOL_CONFIGS[toolName]) {
    return TOOL_CONFIGS[toolName];
  }
  // Check aliases
  const aliasedName = TOOL_ALIASES[toolName];
  if (aliasedName && TOOL_CONFIGS[aliasedName]) {
    return TOOL_CONFIGS[aliasedName];
  }
  // Return default
  return DEFAULT_TOOL_CONFIG;
}

/**
 * Default tool config for unknown tools - uses defaultMcpRenderer
 */
const DEFAULT_TOOL_CONFIG: ToolConfig = defaultMcpRenderer;

export function ToolCallItem({
  item,
  onApprove,
  onReject
}: ToolCallItemProps) {
  // Validate item type
  if (item.type !== 'tool_call' || !item.toolCall) {
    return null;
  }

  const { toolCall, toolResponse: response, needsApproval, wasRejected, progress } = item;

  // Get tool configuration first (needed for defaultExpanded)
  const toolConfig = getToolConfig(toolCall.name);

  // Initialize state with tool's defaultExpanded setting
  const [showDetails, setShowDetails] = useState(toolConfig.defaultExpanded ?? false);
  const [showResult, setShowResult] = useState(false);

  const { t } = useLanguage();

  // Resolve tool name (handle MCP aliases like mcp__python__run -> python)
  const canonicalToolName = TOOL_ALIASES[toolCall.name] || toolCall.name;

  const icon = toolConfig.icon;
  const inlineText = toolConfig.getInlineText(toolCall.args);
  const hasDetails = toolConfig.hasDetails(toolCall.args, response);

  return (
    <div className="chat-item chat-item-ai" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
      {/* AI Avatar */}
      <div className="chat-item-avatar">
        <div className="avatar-icon ai-avatar">
          {/* AI icon - bot/robot face */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <path d="M12 2v4" />
            <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
          </svg>
        </div>
      </div>

      {/* Tool call content */}
      <div className="chat-item-content">
        {/* Tool call - first line: icon, name, inline text, and status for Bash */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.25rem',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {typeof icon === 'string' ? icon : icon}
          </span>
          <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
            {toolCall.name}
          </span>
          {inlineText && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {inlineText}
            </span>
          )}
          {/* Bash status on the same line */}
          {canonicalToolName === 'Bash' && response && ((): React.ReactNode => {
            const isError = isMcpToolError(response);
            return (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: isError ? '#ef4444' : '#10b981',
                  padding: '0.05rem 0.075rem',
                  borderRadius: '3px',
                }}
              >
                {isError ? 'FAIL' : 'SUCCESS'}
              </span>
            );
          })()}
          {canonicalToolName === 'Bash' && wasRejected && !response && (
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: '600',
                color: '#f59e0b',
                padding: '0.05rem 0.075rem',
                borderRadius: '3px',
              }}
            >
              REJECTED
            </span>
          )}
        </div>

        {/* Second line: status + action buttons (skip for Bash - status shown after content) */}
        {canonicalToolName !== 'Bash' && (response || wasRejected || hasDetails) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
              marginLeft: '1.5rem',
            }}
          >
            {/* Status badge */}
            {wasRejected && !response && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: '#f59e0b',
                  padding: '0.05rem 0.075rem',
                  borderRadius: '3px',
                }}
              >
                REJECTED
              </span>
            )}
            {response && ((): React.ReactNode => {
              const isError = isMcpToolError(response);
              return (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    color: isError ? '#ef4444' : '#10b981',
                    padding: '0.05rem 0.075rem',
                    borderRadius: '3px',
                  }}
                >
                  {isError ? 'FAIL' : 'SUCCESS'}
                </span>
              );
            })()}
            {/* Tool-specific action buttons */}
            {hasDetails && toolConfig.renderButton(toolCall.args, showDetails, setShowDetails, response, showResult, setShowResult)}
          </div>
        )}

      {/* Tool-specific details content (below the header) */}
      {canonicalToolName === 'python' && showDetails ? (
        // Special rendering for Python tool - use PythonCodeDisplay component
        <PythonCodeDisplay
          args={toolCall.args}
          response={response}
          progress={progress}
          showResult={showResult}
          translations={{
            copyCode: t.common.buttons.copyCode,
            copied: t.common.buttons.copied,
          }}
        />
      ) : (toolCall.name === 'pdf' || toolCall.name === 'markitdown') ? (
        // Specialized rendering for pdf, markitdown, and python tools - separate details and result
        <>
          {showDetails && toolConfig.renderContent(toolCall.args, false, undefined, showDetails)}
          {showResult && response && toolConfig.renderContent(toolCall.args, true, response, showDetails)}
        </>
      ) : canonicalToolName === 'Bash' ? (
        // Bash - command always visible, click command line to expand/collapse output
        toolConfig.renderContent(toolCall.args, showResult, response, showDetails, setShowDetails)
      ) : (
        // Default rendering for other tools
        hasDetails && (showDetails || showResult) && toolConfig.renderContent(toolCall.args, showResult, response, showDetails)
      )}

      {/* Approval buttons (if needed) - with animated text */}
      {needsApproval && !response && (onApprove || onReject) && (
        <div
          className="tool-approval-container"
          style={{ marginTop: '0.5rem', marginBottom: '0.5rem', marginLeft: '1.5rem' }}
        >
          <ApprovalWaitingIcon />
          <AnimatedApprovalText text={t.status.waitingForApproval} />
          {onReject && (
            <button
              className="tool-approval-btn-reject"
              onClick={() => onReject(toolCall.id)}
            >
              {t.common.buttons.reject}
            </button>
          )}
          {onApprove && (
            <button
              className="tool-approval-btn-approve"
              onClick={() => onApprove(toolCall.id)}
            >
              {t.common.buttons.approve}
            </button>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
