/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ChatArea Component - Refactored to use SessionAgent architecture
 * Uses history-based updates instead of complex streaming state management
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { SessionConfig } from './SessionConfig';
import type { MessageListItem, MessageContent, PermissionMode, SettingSource, UsageMetadata } from '../../../preload/preload-types';
import { RoleType } from '../../../../core/roles/role-enum.js';
import { DEFAULT_MODEL, getModelContextWindow } from '../../../../core/providers/model-list-manager.js';
import { SessionAgent, SessionAgentCache } from '../../utils/SessionAgent.js';

/**
 * Get context window size based on model name.
 * Falls back to the legacy `[1m]`-suffix heuristic for models retired
 * from the supported set (e.g. historical sessions).
 */
function getContextWindowSize(modelName: string): number {
  try {
    return getModelContextWindow(modelName);
  } catch {
    return modelName.includes('[1m]') ? 1000000 : 200000;
  }
}

/**
 * Calculate input tokens from usage (for context usage calculation)
 * This represents how much of the context window is being used for input
 * Formula: input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 * Note: output_tokens are NOT included because they don't consume the context window
 */
function calculateInputTokens(usage: UsageMetadata): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

interface ChatAreaProps {
  sessionId?: string | null;
  defaultRole?: RoleType;
  defaultModel?: string;
  onSessionUpdate?: (session: import('../../../../core/sessions/session-manager.js').Session) => void;
  templateContent?: string;
  onTemplateApplied?: () => void;
}

export function ChatArea({ sessionId, defaultRole, defaultModel, onSessionUpdate, templateContent, onTemplateApplied }: ChatAreaProps) {
  const [items, setItems] = useState<MessageListItem[]>([]); // Display items from SessionAgent
  const [sessionStarted, setSessionStarted] = useState<boolean>(!!sessionId);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [pendingApprovals, setPendingApprovals] = useState<Map<string, string>>(new Map());
  const [rejectedTools, setRejectedTools] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [settingSources, setSettingSources] = useState<SettingSource[]>(['user', 'project', 'local']);
  const [slashCommands, setSlashCommands] = useState<string[]>(['/compact','/init']);
  const [suggestionContent, setSuggestionContent] = useState<string | undefined>(undefined);

  // Session configuration state (for new sessions)
  const [sessionConfig, setSessionConfig] = useState<{
    role: RoleType;
    modelName: string;
    cwd: string;
  }>({
    role: defaultRole || RoleType.OFFICE_ASSISTANT,
    modelName: defaultModel || DEFAULT_MODEL,
    cwd: '', // Will be loaded from settings or getLastCwd
  });

  // Load default configuration from settings
  useEffect(() => {
    async function loadDefaultConfig() {
      try {
        const settings = await window.electronAPI.settings.get();
        // Only use settings if no defaults were provided via props
        setSessionConfig(prev => ({
          role: defaultRole || settings.defaultRole || prev.role,
          modelName: defaultModel || settings.defaultModel || prev.modelName,
          cwd: settings.defaultCwd || prev.cwd,
        }));
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
    loadDefaultConfig();
  }, [defaultRole, defaultModel]);

  // SessionAgent cache - persists across session switches
  const sessionAgentCacheRef = useRef<SessionAgentCache>(new SessionAgentCache());
  const currentAgentRef = useRef<SessionAgent | null>(null);

  // Callbacks ref - stable reference, registered ONCE per agent
  const callbacksRef = useRef({
    onDisplayItemsChange: setItems,
    onPendingApprovalsChange: setPendingApprovals,
    onRejectedToolsChange: setRejectedTools,
  });

  // Load permission mode, setting sources, and slash commands on mount
  useEffect(() => {
    window.electronAPI.agent.getPermissionMode().then((result) => {
      if (result.success) {
        setPermissionMode(result.mode);
      }
    });
    window.electronAPI.agent.getSettingSources().then((result) => {
      if (result.success) {
        setSettingSources(result.sources);
      }
    });
  }, []);

  // Simple session switching - just read data from agent and update UI
  useEffect(() => {

    if (!sessionId) {
      currentAgentRef.current = null;
      setCurrentSessionId(null);
      setSessionStarted(false);
      setItems([]);
      setPendingApprovals(new Map());
      setRejectedTools(new Set());
      return;
    }

    // Skip if already on this session
    if (currentAgentRef.current?.getSessionId() === sessionId) {
      return;
    }

    // Get or create agent
    const agent = sessionAgentCacheRef.current.getOrCreate(sessionId, callbacksRef.current);
    currentAgentRef.current = agent;

    // Activate (loads history if needed, but doesn't block)
    sessionAgentCacheRef.current.switchTo(sessionId);

    // Immediately read and display current data from agent
    // This includes pending approvals and rejected tools for proper tool approval UI restoration
    setItems(agent.getDisplayItems());
    setPendingApprovals(agent.getPendingApprovals());
    setRejectedTools(agent.getRejectedTools());
    setCurrentSessionId(sessionId);
    setSessionStarted(true);
  }, [sessionId]);

  // Handle tool approval - delegate to SessionAgent
  const handleToolApprove = async (toolCallId: string) => {
    if (!currentAgentRef.current) {
      return;
    }

    await currentAgentRef.current.approveTools([toolCallId]);
  };

  // Handle tool rejection - delegate to SessionAgent
  const handleToolReject = async (toolCallId: string, reason?: string) => {
    if (!currentAgentRef.current) {
      return;
    }

    await currentAgentRef.current.rejectTools([toolCallId], reason);
  };

  const handleCancelRequest = async () => {
    if (!currentSessionId) {
      return;
    }

    try {
      const result = await window.electronAPI.agent.cancelRequest(currentSessionId);
      if (!result.success) {
        console.error('Failed to cancel request:', result.error);
      }
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to cancel request:', error);
      setIsProcessing(false);
    }
  };

  // Handle permission mode change
  const handlePermissionModeChange = async (mode: PermissionMode) => {
    try {
      const result = await window.electronAPI.agent.setPermissionMode(mode);
      if (result.success) {
        setPermissionMode(mode);
      } else {
        console.error('Failed to set permission mode:', result.error);
      }
    } catch (error) {
      console.error('Failed to set permission mode:', error);
    }
  };

  // Handle setting sources change
  const handleSettingSourcesChange = async (sources: SettingSource[]) => {
    try {
      const result = await window.electronAPI.agent.setSettingSources(sources);
      if (result.success) {
        setSettingSources(sources);
      } else {
        console.error('Failed to set setting sources:', result.error);
      }
    } catch (error) {
      console.error('Failed to set setting sources:', error);
    }
  };

  // Handle slash command selection - send as message
  const handleSlashCommandSelect = async (command: string) => {
    // Send the slash command as a message
    await handleSendMessage(command);
  };

  // Handle suggestion click - fill input with suggestion prompt
  const handleSuggestionClick = (prompt: string) => {
    setSuggestionContent(prompt);
  };

  // Clear suggestion content after it's been applied
  const handleSuggestionApplied = () => {
    setSuggestionContent(undefined);
  };

  // Helper function to extract text from MessageContent for titles
  const extractTextFromMessage = (message: MessageContent): string => {
    if (typeof message === 'string') {
      return message;
    }

    // Extract text from ContentBlock array
    let text = '';
    for (const block of message) {
      if (block.type === 'text' && 'text' in block) {
        text += block.text;
      }
    }
    return text;
  };

  const handleSendMessage = async (message: MessageContent) => {
    let effectiveSessionId = currentSessionId;

    // If session hasn't started, create it first
    if (!sessionStarted || !currentSessionId) {
      try {
        const textContent = extractTextFromMessage(message);
        const title = textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;

        const result = await window.electronAPI.session.create({
          title,
          role: sessionConfig.role,
          modelName: sessionConfig.modelName,
          cwd: sessionConfig.cwd,
        });

        if (!result.success || !result.session) {
          console.error('Failed to create session:', result.error);
          return;
        }

        effectiveSessionId = result.session.id;

        // Notify parent component BEFORE setting state to avoid race conditions
        if (onSessionUpdate) {
          onSessionUpdate(result.session);
        }

        // Manually create SessionAgent immediately for first message
        // This ensures currentAgentRef.current is available when we call addUserMessage below
        // We do this BEFORE setCurrentSessionId to avoid useEffect race condition
        const agent = sessionAgentCacheRef.current.getOrCreate(result.session.id, {
          onDisplayItemsChange: (displayItems) => {
            setItems(displayItems);
          },
          onPendingApprovalsChange: (approvals) => {
            setPendingApprovals(approvals);
          },
          onRejectedToolsChange: (rejected) => {
            setRejectedTools(rejected);
          },
        });

        sessionAgentCacheRef.current.switchTo(result.session.id);
        currentAgentRef.current = agent;

        // Set state AFTER SessionAgent is ready
        // This will trigger useEffect, but getOrCreate will return the same agent (from cache)
        setCurrentSessionId(result.session.id);
        setSessionStarted(true);
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      }
    }

    // Add user message immediately to SessionAgent's displayItems
    const userMessageItem: MessageListItem = {
      type: 'message',
      id: `user-${Date.now()}`,
      timestamp: Date.now(),
      role: 'user',
      content: message,
    };

    // Add to SessionAgent so it's part of displayItems
    if (currentAgentRef.current) {
      currentAgentRef.current.addUserMessage(userMessageItem);
    } else {
      console.error('[ChatArea handleSendMessage] ERROR: currentAgentRef.current is null!');
    }

    // Set processing state
    setIsProcessing(true);

    try {
      // Send message - backend will handle streaming and history updates
      const response = await window.electronAPI.agent.chat({
        message,
        sessionId: effectiveSessionId || undefined,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to get response');
      }

      // History update event will trigger and update items
      // No need to manually update items here

      // Update session ID if this was a new session
      if (response.sessionId && response.sessionId !== currentSessionId) {
        setCurrentSessionId(response.sessionId);
      }

      // If this was the first message, update title
      const sessionIdToUse = currentSessionId || response.sessionId;
      if (items.length === 0 && sessionIdToUse) {
        try {
          const textContent = extractTextFromMessage(message);
          const title = textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;
          const result = await window.electronAPI.session.updateTitle(sessionIdToUse, title);
          if (result.success && result.session && onSessionUpdate) {
            onSessionUpdate(result.session);
          }
        } catch (error) {
          console.error('Failed to update session title:', error);
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);

      // Add error message to UI
      const errorMessageItem: MessageListItem = {
        type: 'message',
        id: `error-${Date.now()}`,
        timestamp: Date.now(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      setItems((prev) => [...prev, errorMessageItem]);
    } finally {
      // Clear processing state when request completes or fails
      setIsProcessing(false);
    }
  };

  // Calculate context usage from the last assistant message with usage data
  const contextUsage = useMemo(() => {
    // Find the last assistant message with usage data
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.type === 'message' && item.role === 'assistant' && item.usage) {
        const modelName = sessionConfig.modelName;
        const contextWindowSize = getContextWindowSize(modelName);
        // Calculate input tokens used (excluding output tokens)
        // This represents actual context window consumption
        const usedInputTokens = calculateInputTokens(item.usage);
        const percentUsed = Math.min(100, Math.round((usedInputTokens / contextWindowSize) * 100));

        return {
          usedTokens: usedInputTokens,
          totalTokens: contextWindowSize,
          percentUsed,
        };
      }
    }
    return undefined;
  }, [items, sessionConfig.modelName]);

  return (
    <div className="chat-area">
      {sessionStarted ? (
        <MessageList
          items={items}
          onToolApprove={handleToolApprove}
          onToolReject={handleToolReject}
        />
      ) : (
        <SessionConfig
          defaultRole={sessionConfig.role}
          defaultModel={sessionConfig.modelName}
          defaultCwd={sessionConfig.cwd}
          onConfigChange={setSessionConfig}
          onSuggestionClick={handleSuggestionClick}
        />
      )}
      <InputArea
        sessionId={sessionId || undefined}
        cwd={sessionConfig.cwd || undefined}
        role={sessionConfig.role}
        onSend={handleSendMessage}
        onCancel={handleCancelRequest}
        isProcessing={isProcessing}
        templateContent={suggestionContent || templateContent}
        onTemplateApplied={suggestionContent ? handleSuggestionApplied : onTemplateApplied}
        permissionMode={permissionMode}
        onPermissionModeChange={handlePermissionModeChange}
        settingSources={settingSources}
        onSettingSourcesChange={handleSettingSourcesChange}
        contextUsage={contextUsage}
        slashCommands={slashCommands}
        onSlashCommandSelect={handleSlashCommandSelect}
      />
    </div>
  );
}
