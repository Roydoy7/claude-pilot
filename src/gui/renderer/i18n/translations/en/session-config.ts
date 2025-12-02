/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * English translations - Session Configuration
 */

export const sessionConfigEn = {
  title: 'Configure Session',
  chooseRole: 'Choose Role',
  chooseRoleDescription: "Select the assistant's role for this conversation",
  selectProviderModel: 'Select Provider & Model',
  selectProviderModelDescription: 'Choose your AI provider and model',
  workspaceInstruction: 'To let AI access local files, add folders to',
  workspaceLink: 'Workspace',
  startConversationInstruction: 'Send your first message below to start the conversation',
  loadingConfiguration: 'Loading configuration...',
  authMethod: 'Authentication Method',
  oauth: 'OAuth',
  apiKey: 'API Key',
  authStatus: 'Authentication Status',
  authenticated: 'Authenticated',
  notAuthenticated: 'Not Authenticated',
  authRequired: 'Authentication required. Please configure API key or use OAuth.',
  authRequiredShort: 'Auth Required',
  noApiKey: 'No API Key',
  configureApiKey: 'Please configure API key to view models',
  noAuthRequired: 'No authentication required',
  usingProvider: (provider: string) => `Using ${provider}`,
  usingOAuth: 'Using OAuth',
  oauthNotAuthenticated: 'OAuth not authenticated',
  clickOAuthToAuthenticate: 'Click OAuth button to authenticate',
  apiKeyNotConfigured: (key: string) => `${key} not configured`,
  setEnvironmentVariable: (key: string) => `Please set ${key} environment variable`,
  setEnvironmentVariableToUse: 'Please set the environment variable to use this provider',
  noModelsAvailable: 'No models available',
  logout: 'Logout',
  selectWorkingDirectory: 'Select Working Directory',
  selectWorkingDirectoryDescription: 'Choose the primary directory for this session',
  noDirectorySelected: 'No directory selected',
  browseDirectory: 'Browse...',
};
