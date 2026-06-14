/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Settings Dialog
 */

export const settingsJa = {
  title: '設定',
  categories: {
    account: 'アカウント',
    defaults: 'デフォルト',
    appearance: '外観',
  },
  account: {
    title: 'アカウント設定',
    authentication: '認証',
    status: '認証ステータス',
    authenticated: '認証済み',
    notAuthenticated: '未認証',
    plan: 'プラン',
    expires: '有効期限',
    loginWithClaude: 'Claudeアカウントでログイン（Pro/Max/Team）',
    loginWithConsole: 'コンソールアカウントでログイン（API課金）',
    logout: 'ログアウト',
    loggingIn: 'ログイン中...',
    loginFailed: 'ログイン失敗',
    envHint: 'または環境変数を設定',
    welcomeMessage: 'ようこそ！Claude Pilotを使用するには、まず認証してください。',
  },
  defaults: {
    title: 'デフォルト設定',
    description: '新規セッションのデフォルト値を設定',
    role: 'デフォルトロール',
    selectRole: 'ロールを選択',
    roleDescription: '新規セッション作成時に使用するロール',
    workingDirectory: 'デフォルト作業ディレクトリ',
    workingDirectoryDescription: '新規セッション作成時に使用する作業ディレクトリ',
    browse: '参照',
    noDirectory: 'ディレクトリ未選択',
  },
  appearance: {
    title: '外観設定',
    theme: 'テーマ',
    themeDescription: 'お好みのカラーテーマを選択',
    themeLight: 'ライト',
    themeDark: 'ダーク',
    language: '言語',
    languageDescription: 'お好みの言語を選択',
    languageEn: 'English',
    languageZh: '中文',
    languageJa: '日本語',
  },
};
