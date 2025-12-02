/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Session Configuration
 */

export const sessionConfigJa = {
  title: 'セッション設定',
  chooseRole: '役割を選択',
  chooseRoleDescription: 'この会話におけるアシスタントの役割を選択してください',
  selectProviderModel: 'プロバイダーとモデルを選択',
  selectProviderModelDescription: 'AIプロバイダーとモデルを選択してください',
  workspaceInstruction: 'AIにローカルファイルへのアクセスを許可するには、フォルダを追加してください',
  workspaceLink: 'ワークスペース',
  startConversationInstruction: '以下から最初のメッセージを送信して会話を開始してください',
  loadingConfiguration: '設定を読み込み中...',
  authMethod: '認証方法',
  oauth: 'OAuth',
  apiKey: 'APIキー',
  authStatus: '認証状態',
  authenticated: '認証済み',
  notAuthenticated: '未認証',
  authRequired: '認証が必要です。APIキーを設定するか、OAuthを使用してください。',
  authRequiredShort: '認証が必要',
  noApiKey: 'APIキーなし',
  configureApiKey: 'モデルを表示するにはAPIキーを設定してください',
  noAuthRequired: '認証は不要です',
  usingProvider: (provider: string) => `${provider}を使用中`,
  usingOAuth: 'OAuthを使用中',
  oauthNotAuthenticated: 'OAuth未認証',
  clickOAuthToAuthenticate: 'OAuthボタンをクリックして認証してください',
  apiKeyNotConfigured: (key: string) => `${key}が設定されていません`,
  setEnvironmentVariable: (key: string) => `${key}環境変数を設定してください`,
  setEnvironmentVariableToUse: 'このプロバイダーを使用するには環境変数を設定してください',
  noModelsAvailable: '利用可能なモデルがありません',
  logout: 'ログアウト',
  selectWorkingDirectory: '作業ディレクトリを選択',
  selectWorkingDirectoryDescription: 'このセッションの主要なディレクトリを選択してください',
  noDirectorySelected: 'ディレクトリが選択されていません',
  browseDirectory: '参照...',
};
