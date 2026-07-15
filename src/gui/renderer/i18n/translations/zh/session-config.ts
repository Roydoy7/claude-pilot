/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Chinese translations - Session Configuration
 */

export const sessionConfigZh = {
  title: '开始新会话',
  chooseRole: '选择角色',
  chooseRoleDescription: '选择本次对话的助手角色',
  agentLoadErrorTitle: '以下角色加载失败，暂不可用：',
  selectProviderModel: '选择提供商和模型',
  selectProviderModelDescription: '选择您的 AI 提供商和模型',
  workspaceInstruction: '若要让 AI 访问本地文件，请添加文件夹到',
  workspaceLink: '工作区',
  startConversationInstruction: '在下方发送您的第一条消息以开始对话',
  tryAsking: '试试问问',
  loadingConfiguration: '正在加载配置...',
  authMethod: '认证方式',
  oauth: 'OAuth',
  apiKey: 'API 密钥',
  authStatus: '认证状态',
  authenticated: '已认证',
  notAuthenticated: '未认证',
  authRequired: '需要认证。请配置 API 密钥或使用 OAuth。',
  authRequiredShort: '需要认证',
  noApiKey: '无 API 密钥',
  configureApiKey: '请配置 API 密钥以查看模型',
  noAuthRequired: '无需认证',
  usingProvider: (provider: string) => `使用 ${provider}`,
  usingOAuth: '使用 OAuth',
  oauthNotAuthenticated: 'OAuth 未认证',
  clickOAuthToAuthenticate: '点击 OAuth 按钮进行认证',
  apiKeyNotConfigured: (key: string) => `${key} 未配置`,
  setEnvironmentVariable: (key: string) => `请设置 ${key} 环境变量`,
  setEnvironmentVariableToUse: '请设置环境变量以使用此提供商',
  noModelsAvailable: '无可用模型',
  logout: '登出',
  selectWorkingDirectory: '选择工作目录',
  selectWorkingDirectoryDescription: 'AI 将被允许访问工作目录的文件，您可以稍后在',
  selectWorkingDirectoryDescriptionSuffix: '增加额外的目录',
  noDirectorySelected: '未选择目录',
  browseDirectory: '浏览...',
};
