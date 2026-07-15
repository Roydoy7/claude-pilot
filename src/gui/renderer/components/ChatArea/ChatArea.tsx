/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ChatArea Component - Refactored to use SessionAgent architecture
 * Uses history-based updates instead of complex streaming state management
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { SessionConfig } from './SessionConfig';
import type { MessageListItem, MessageContent, PermissionMode, SettingSource, UsageMetadata } from '../../../preload/preload-types';
import { useAgentDefinitions } from '../../hooks/useAgentDefinitions.js';
import { DEFAULT_MODEL, DEFAULT_EFFORT_LEVEL, getModelContextWindow, getSupportedEffortLevels, type EffortLevel, type ModelInfo } from '../../../../core/providers/model-list-manager.js';
import { getErrorMessage } from '../../../../core/errors.js';
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
 * Get supported effort levels for a model.
 * Returns an empty array for models retired from the supported set
 * (e.g. historical sessions), hiding the effort level selector.
 */
function getSupportedEffortLevelsSafe(modelName: string): EffortLevel[] {
  try {
    return getSupportedEffortLevels(modelName);
  } catch {
    return [];
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
  defaultAgentId?: string;
  defaultModel?: string;
  defaultEffortLevel?: EffortLevel;
  onSessionUpdate?: (session: import('../../../../core/sessions/session-manager.js').Session) => void;
  templateContent?: string;
  onTemplateApplied?: () => void;
}

export function ChatArea({ sessionId, defaultAgentId, defaultModel, defaultEffortLevel, onSessionUpdate, templateContent, onTemplateApplied }: ChatAreaProps) {
  const agentDefinitions = useAgentDefinitions();
  const [items, setItems] = useState<MessageListItem[]>([]); // Display items from SessionAgent
  const [sessionStarted, setSessionStarted] = useState<boolean>(!!sessionId);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [pendingApprovals, setPendingApprovals] = useState<Map<string, string>>(new Map());
  const [rejectedTools, setRejectedTools] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [settingSources, setSettingSources] = useState<SettingSource[]>(['user', 'project', 'local']);
  const [slashCommands, setSlashCommands] = useState<string[]>(['/compact','/init','/clear']);
  const [suggestionContent, setSuggestionContent] = useState<string | undefined>(undefined);

  // Session configuration state (for new sessions)
  const [sessionConfig, setSessionConfig] = useState<{
    agentId: string;
    modelName: string;
    effortLevel: EffortLevel;
    cwd: string;
  }>({
    agentId: defaultAgentId || '',
    modelName: defaultModel || DEFAULT_MODEL,
    effortLevel: defaultEffortLevel || DEFAULT_EFFORT_LEVEL,
    cwd: '', // Will be loaded from settings or getLastCwd
  });

  // Models available for selection in the InputArea toolbar
  const [models, setModels] = useState<ModelInfo[]>([]);

  // Load default configuration from settings
  useEffect(() => {
    async function loadDefaultConfig() {
      try {
        const settings = await window.electronAPI.settings.get();
        // Only use settings if no defaults were provided via props
        setSessionConfig(prev => ({
          agentId: defaultAgentId || settings.defaultAgentId || prev.agentId,
          modelName: defaultModel || prev.modelName,
          effortLevel: defaultEffortLevel || prev.effortLevel,
          cwd: settings.defaultCwd || prev.cwd,
        }));
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
    loadDefaultConfig();
  }, [defaultAgentId, defaultModel, defaultEffortLevel]);

  // Load available models for the model selector
  useEffect(() => {
    window.electronAPI.models.list().then(setModels).catch((error) => {
      console.error('Failed to load models:', error);
    });
  }, []);

  // Fall back to the first available agent definition once it loads, if
  // nothing else (props/settings) resolved an agent yet.
  useEffect(() => {
    if (sessionConfig.agentId || agentDefinitions.length === 0) {
      return;
    }
    setSessionConfig(prev => ({ ...prev, agentId: agentDefinitions[0].id }));
  }, [agentDefinitions, sessionConfig.agentId]);

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

    // Sync permission mode from backend for this session
    window.electronAPI.agent.getPermissionMode(sessionId).then((result) => {
      if (result.success) {
        setPermissionMode(result.mode);
      }
    });
  }, [sessionId]);

  // Handle tool approval - delegate to SessionAgent
  // Stable identity (useCallback) so memoized message rows skip re-renders
  const handleToolApprove = useCallback(async (toolCallId: string) => {
    if (!currentAgentRef.current) {
      return;
    }

    await currentAgentRef.current.approveTools([toolCallId]);
  }, []);

  // Handle tool rejection - delegate to SessionAgent
  const handleToolReject = useCallback(async (toolCallId: string, reason?: string) => {
    if (!currentAgentRef.current) {
      return;
    }

    await currentAgentRef.current.rejectTools([toolCallId], reason);
  }, []);

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
    // If no session exists yet, buffer the selection locally; it will be
    // applied to the backend when the session is created (see handleSendMessage).
    if (!currentSessionId) {
      setPermissionMode(mode);
      return;
    }
    try {
      const result = await window.electronAPI.agent.setPermissionMode(mode, currentSessionId);
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

  // Stable callback for SessionConfig - avoids re-triggering its
  // onConfigChange effect on every ChatArea render
  const handleSessionConfigChange = useCallback((config: { agentId: string; modelName: string; cwd: string }) => {
    setSessionConfig(prev => ({ ...prev, ...config }));
  }, []);

  // Handle model change - takes effect immediately for an active session,
  // persisted to the session record by the backend
  const handleModelChange = async (model: string) => {
    const supportedLevels = getSupportedEffortLevelsSafe(model);
    const fallbackEffortLevel = supportedLevels.includes(sessionConfig.effortLevel)
      ? sessionConfig.effortLevel
      : supportedLevels[0];

    if (sessionStarted && currentSessionId) {
      try {
        const result = await window.electronAPI.agent.setModel(model);
        if (!result.success) {
          console.error('Failed to set model:', result.error);
          return;
        }
        if (fallbackEffortLevel && fallbackEffortLevel !== sessionConfig.effortLevel) {
          const effortResult = await window.electronAPI.agent.setEffortLevel(fallbackEffortLevel);
          if (!effortResult.success) {
            console.error('Failed to set effort level:', effortResult.error);
          }
        }
      } catch (error) {
        console.error('Failed to set model:', error);
        return;
      }
    }

    setSessionConfig(prev => ({
      ...prev,
      modelName: model,
      effortLevel: fallbackEffortLevel ?? prev.effortLevel,
    }));
  };

  // Handle thinking effort level change - takes effect immediately for an
  // active session, persisted to the session record by the backend
  const handleEffortLevelChange = async (level: EffortLevel) => {
    if (sessionStarted && currentSessionId) {
      try {
        const result = await window.electronAPI.agent.setEffortLevel(level);
        if (!result.success) {
          console.error('Failed to set effort level:', result.error);
          return;
        }
      } catch (error) {
        console.error('Failed to set effort level:', error);
        return;
      }
    }

    setSessionConfig(prev => ({ ...prev, effortLevel: level }));
  };

  // Handle slash command selection - send as message
  const handleSlashCommandSelect = async (command: string) => {
    if (command === '/clear') {
      setItems([]);
      return;
    }
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
          agentId: sessionConfig.agentId,
          modelName: sessionConfig.modelName,
          effortLevel: sessionConfig.effortLevel,
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

        // If a non-default permission mode was selected before the session existed, apply it now
        if (permissionMode !== 'default') {
          window.electronAPI.agent.setPermissionMode(permissionMode, result.session.id).catch((error) => {
            console.error('Failed to apply buffered permission mode:', error);
          });
        }
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
        content: `Error: ${getErrorMessage(error)}`,
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
          // Remount per session so the list re-runs its scroll-to-bottom
          // initialization and drops the previous session's scroll state
          key={currentSessionId ?? 'new-session'}
          items={items}
          assistantLabel={agentDefinitions.find(agent => agent.id === sessionConfig.agentId)?.displayName}
          onToolApprove={handleToolApprove}
          onToolReject={handleToolReject}
        />
      ) : (
        <SessionConfig
          defaultAgentId={sessionConfig.agentId}
          defaultModel={sessionConfig.modelName}
          defaultCwd={sessionConfig.cwd}
          onConfigChange={handleSessionConfigChange}
          onSuggestionClick={handleSuggestionClick}
        />
      )}
      <InputArea
        sessionId={sessionId || undefined}
        cwd={sessionConfig.cwd || undefined}
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
        modelName={sessionConfig.modelName}
        models={models}
        onModelChange={handleModelChange}
        effortLevel={sessionConfig.effortLevel}
        supportedEffortLevels={getSupportedEffortLevelsSafe(sessionConfig.modelName)}
        onEffortLevelChange={handleEffortLevelChange}
      />
    </div>
  );
}
