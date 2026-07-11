/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * i18n types - Type definitions for internationalization
 */

export type Language = 'en' | 'zh' | 'ja';

export interface Translation {
  // Common
  common: {
    appName: string;
    loading: string;
    buttons: {
      save: string;
      cancel: string;
      delete: string;
      edit: string;
      apply: string;
      close: string;
      clear: string;
      remove: string;
      approve: string;
      reject: string;
      send: string;
      upload: string;
      copyCode: string;
      copied: string;
    };
    messages: {
      success: string;
      error: string;
      confirm: string;
    };
    status: {
      pending: string;
      inProgress: string;
      completed: string;
      failed: string;
      rejected: string;
    };
    time: {
      today: string;
      yesterday: string;
      daysAgo: (days: number) => string;
    };
  };

  // Header
  header: {
    hideRightPanel: string;
    showRightPanel: string;
    sessionInfo: {
      role: string;
      model: string;
      workspace: string;
    };
    roles: {
      officeAssistant: string;
      translator: string;
    };
    providers: {
      openai: string;
      anthropic: string;
      google: string;
      lmstudio: string;
    };
  };

  // Session Configuration
  sessionConfig: {
    title: string;
    chooseRole: string;
    chooseRoleDescription: string;
    selectProviderModel: string;
    selectProviderModelDescription: string;
    workspaceInstruction: string;
    workspaceLink: string;
    startConversationInstruction: string;
    tryAsking: string;
    loadingConfiguration: string;
    authMethod: string;
    oauth: string;
    apiKey: string;
    authStatus: string;
    authenticated: string;
    notAuthenticated: string;
    authRequired: string;
    authRequiredShort: string;
    noApiKey: string;
    configureApiKey: string;
    noAuthRequired: string;
    usingProvider: (provider: string) => string;
    usingOAuth: string;
    oauthNotAuthenticated: string;
    clickOAuthToAuthenticate: string;
    apiKeyNotConfigured: (key: string) => string;
    setEnvironmentVariable: (key: string) => string;
    setEnvironmentVariableToUse: string;
    noModelsAvailable: string;
    logout: string;
    selectWorkingDirectory: string;
    selectWorkingDirectoryDescription: string;
    selectWorkingDirectoryDescriptionSuffix: string;
    noDirectorySelected: string;
    browseDirectory: string;
  };

  // Input Area
  inputArea: {
    placeholder: string;
    browseWorkspace: string;
    bold: string;
    italic: string;
    code: string;
    clear: string;
    uploadImage: string;
    cancelRequest: string;
    sendMessage: string;
    sendHint: string;
    removeImage: string;
    permissionMode: {
      label: string;
      modes: {
        default: {
          name: string;
          description: string;
        };
        acceptEdits: {
          name: string;
          description: string;
        };
        bypassPermissions: {
          name: string;
          description: string;
        };
        plan: {
          name: string;
          description: string;
        };
        dontAsk: {
          name: string;
          description: string;
        };
        auto: {
          name: string;
          description: string;
        };
      };
    };
    settingSources?: {
      label: string;
      sources: {
        user: {
          name: string;
          description: string;
        };
        project: {
          name: string;
          description: string;
        };
        local: {
          name: string;
          description: string;
        };
      };
    };
    slashCommands?: {
      label: string;
    };
    promptsButton?: {
      tooltip: string;
      title: string;
      noTemplates: string;
    };
    modelSelector?: {
      label: string;
    };
    effortLevelSelector?: {
      label: string;
      levels: {
        low: string;
        medium: string;
        high: string;
        xhigh: string;
        max: string;
      };
    };
  };

  // Message
  message: {
    saveAsTemplate: string;
    saved: string;
    attachment: (index: number) => string;
    tokens: {
      input: string;
      output: string;
      total: string;
      cacheHit: (count: number) => string;
      cacheWrite: (count: number) => string;
      /** Cache TTL labels */
      cache5min: string;
      cache1hour: string;
      /** Service tier label */
      serviceTier: (tier: string) => string;
    };
    stats: {
      duration: string;
      cost: string;
      turns: string;
      model: string;
    };
  };

  // Message List
  messageList: {
    noMessages: string;
    newMessages: string;
    scrollToBottom: string;
    usageLimitReached: string;
    assistant: string;
  };

  // Compact Summary
  compactSummary?: {
    title: string;
    continuedFrom: string;
    expand: string;
    collapse: string;
  };

  // Tool Call
  toolCall: {
    showCode: string;
    hideCode: string;
    showResult: string;
    hideResult: string;
    showDetails: string;
    hideDetails: string;
    showTasks: string;
    hideTasks: string;
    error: string;
    output: string;
    agentType: string;
    requirements: string;
    workingDirectory: string;
    file: string;
    operation: string;
    pages: string;
    query: string;
    outputFile: string;
    sources: string;
  };

  // Status
  status: {
    aiThinking: string;
    aiThinkingWithTokens: (tokens: number) => string;
    executingTool: (toolName: string) => string;
    waitingForApproval: string;
    messageQueued: string;
    // Slash command execution states
    commands?: {
      compact: string;
      clear: string;
      help: string;
      model: string;
      config: string;
      init: string;
      resume: string;
      memory: string;
      mcp: string;
      permissions: string;
    };
  };

  // Workspace Browser
  workspaceBrowser: {
    title: string;
    description: string;
    addWorkspace: string;
    addWorkspaceTooltip: string;
    loading: string;
    noWorkspacesTitle: string;
    noWorkspacesDescription: string;
    workspaceLabel: (index: number) => string;
    remove: string;
    removeTooltip: string;
    failedToRead: string;
    selectedCount: (count: number) => string;
    clearSelection: string;
    insertPaths: string;
    close: string;
  };

  // Left Sidebar (Sessions)
  leftSidebar: {
    newSession: string;
    newSessionFallback: string;
    noSessions: string;
    loading: string;
    collapse: string;
    expand: string;
    deleteAllTooltip: (count: number) => string;
    noSessionsToDelete: string;
    deleteAllConfirm: (count: number) => string;
    deleteSessionConfirm: string;
  };

  // Right Panel
  rightPanel: {
    workspace: string;
    prompts: string;
    skills: string;
    closePanel: string;

    // Prompts Tab
    promptsTab: {
      title: string;
      description: string;
      newTemplate: string;
      clearAll: string;
      noTemplates: string;
      editTooltip: string;
      deleteTooltip: string;
      deleteConfirm: string;
      deleteAllConfirm: (count: number) => string;
    };

    // Workspace Tab
    workspaceTab: {
      title: string;
      description: string;
      pending: (count: number) => string;
      applied: (count: number) => string;
      addWorkspace: string;
      applyToSession: string;
      removeTooltip: string;
      noSessionTooltip: string;
      addWorkspacesTooltip: string;
      applyWorkspacesTooltip: string;
      noSessionWarning: string;
      addWorkspacesInfo: string;
      workspaceLabel: (index: number) => string;
      workingDirectory: string;
      setDuringCreation: string;
      additionalDirectories: (count: number) => string;
      addDirectory: string;
      noAdditionalDirectories: string;
      directoryLabel: (index: number) => string;
      removeDirectory: string;
      accessNote: string;
    };

    // Skills Tab
    skillsTab: {
      title: string;
      enableSkills: string;
      installed: string;
      marketplace: string;
      noSkillsInstalled: string;
      browseMarketplace: string;
      selectSession: string;
      refreshMarketplace: string;
      loading: string;
      clickRefresh: string;
      install: string;
      installing: string;
      uninstall: string;
    };
  };

  // Template Editor
  templateEditor: {
    title: string;
    namePlaceholder: string;
    contentPlaceholder: string;
    edit: string;
    preview: string;
    bold: string;
    italic: string;
    codeBlock: string;
    inlineCode: string;
    link: string;
    bulletList: string;
    numberedList: string;
    heading: string;
    cancel: string;
    save: string;
    saving: string;
    noContent: string;
  };

  // Error Messages
  errors: {
    failedToCancel: string;
    failedToCreateSession: string;
    failedToLoadModels: string;
    failedToUpdateTitle: string;
    failedToSendMessage: string;
    failedToSaveTemplate: string;
    failedToDeleteTemplate: string;
    failedToDeleteAllTemplates: string;
    failedToDeleteSession: string;
    failedToLoadSessions: string;
    failedToLoadTemplates: string;
    failedToLoadWorkspaces: string;
    failedToAddWorkspace: string;
    failedToRemoveWorkspace: string;
    failedToApplyWorkspaces: string;
    failedToReadImage: string;
    failedToPasteImage: string;
  };

  // Settings Dialog
  settings?: {
    title: string;
    categories: {
      account: string;
      defaults: string;
      appearance: string;
    };
    account: {
      title: string;
      authentication: string;
      status: string;
      authenticated: string;
      notAuthenticated: string;
      plan: string;
      expires: string;
      loginWithClaude: string;
      loginWithConsole: string;
      logout: string;
      loggingIn: string;
      loginFailed: string;
      envHint: string;
      welcomeMessage: string;
      sourceLabels: {
        environment: string;
        claudeSettings: string;
        oauth: string;
        none: string;
      };
    };
    defaults: {
      title: string;
      description: string;
      role: string;
      selectRole: string;
      roleDescription: string;
      workingDirectory: string;
      workingDirectoryDescription: string;
      browse: string;
      noDirectory: string;
    };
    appearance: {
      title: string;
      theme: string;
      themeDescription: string;
      themeLight: string;
      themeDark: string;
      language: string;
      languageDescription: string;
      languageEn: string;
      languageZh: string;
      languageJa: string;
    };
  };

  // Prompt Suggestions
  suggestions?: {
    myTemplates: string;
  };
}
