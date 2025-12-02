/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * ChatArea Component - Refactored to use SessionAgent architecture
 * Uses history-based updates instead of complex streaming state management
 */

import { useState, useRef, useEffect } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { SessionConfig } from './SessionConfig';
import type { MessageListItem, MessageContent } from '../../../preload/preload-types';
import { RoleType } from '../../../../core/roles/role-enum.js';
import { SessionAgent, SessionAgentCache } from '../../utils/SessionAgent.js';

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

  // Session configuration state (for new sessions)
  const [sessionConfig, setSessionConfig] = useState<{
    role: RoleType;
    modelName: string;
    cwd: string;
  }>({
    role: defaultRole || RoleType.OFFICE_ASSISTANT,
    modelName: defaultModel || 'claude-sonnet-4-20250514',
    cwd: '', // Will be loaded from getLastCwd in SessionConfig
  });

  // SessionAgent cache - persists across session switches
  const sessionAgentCacheRef = useRef<SessionAgentCache>(new SessionAgentCache());
  const currentAgentRef = useRef<SessionAgent | null>(null);

  // Callbacks ref - stable reference, registered ONCE per agent
  const callbacksRef = useRef({
    onDisplayItemsChange: setItems,
    onPendingApprovalsChange: setPendingApprovals,
    onRejectedToolsChange: setRejectedTools,
  });

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
    setItems(agent.getDisplayItems());
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
      if (items.length === 0 && currentSessionId) {
        try {
          const textContent = extractTextFromMessage(message);
          const title = textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;
          const result = await window.electronAPI.session.updateTitle(currentSessionId, title);
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
          onConfigChange={setSessionConfig}
        />
      )}
      <InputArea
        sessionId={sessionId || undefined}
        onSend={handleSendMessage}
        onCancel={handleCancelRequest}
        isProcessing={isProcessing}
        templateContent={templateContent}
        onTemplateApplied={onTemplateApplied}
      />
    </div>
  );
}
