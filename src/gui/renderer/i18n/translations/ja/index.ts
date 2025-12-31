/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Index
 */

import type { Translation } from '../../types';
import { commonJa } from './common.js';
import { headerJa } from './header.js';
import { sessionConfigJa } from './session-config.js';
import { inputAreaJa } from './input-area.js';
import { rightPanelJa } from './right-panel.js';
import { workspaceBrowserJa } from './workspace-browser.js';
import { settingsJa } from './settings.js';

export const jaTranslations: Translation = {
  common: commonJa,
  header: headerJa,
  sessionConfig: sessionConfigJa,
  inputArea: inputAreaJa,

  // Message
  message: {
    saveAsTemplate: 'テンプレートとして保存',
    saved: '保存しました！',
    attachment: (index: number) => `添付ファイル ${index + 1}`,
    tokens: {
      input: '入力トークン（新規）',
      output: '出力トークン',
      total: '合計トークン',
      cacheHit: (count: number) => `キャッシュヒット: ${count}トークンをキャッシュから読み取り（コスト90%削減）`,
      cacheWrite: (count: number) => `キャッシュ書き込み: ${count}トークンをキャッシュに書き込み（コスト25%増加）`,
      cache5min: '5分キャッシュ',
      cache1hour: '1時間キャッシュ（Max契約）',
      serviceTier: (tier: string) => `サービス層: ${tier}`,
    },
  },

  // Message List
  messageList: {
    noMessages: 'まだメッセージがありません。会話を始めましょう！',
    newMessages: '新着メッセージ',
    scrollToBottom: '最下部へスクロール',
    usageLimitReached: '使用制限に達しました',
  },

  // Compact Summary
  compactSummary: {
    title: '会話サマリー',
    continuedFrom: '前のコンテキストから継続',
    expand: '全文を表示',
    collapse: '折りたたむ',
  },

  // Tool Call
  toolCall: {
    showCode: 'コードを表示',
    hideCode: 'コードを非表示',
    showResult: '結果を表示',
    hideResult: '結果を非表示',
    showDetails: '詳細を表示',
    hideDetails: '詳細を非表示',
    showTasks: 'タスクを表示',
    hideTasks: 'タスクを非表示',
    error: '❌ エラー:',
    output: '✅ 出力:',
    agentType: '🎯 エージェントタイプ:',
    requirements: '📦 **必要条件:**',
    workingDirectory: '📁 **作業ディレクトリ:**',
    file: 'ファイル:',
    operation: '操作:',
    pages: 'ページ:',
    query: 'クエリ:',
    outputFile: '出力:',
    sources: 'ソース:',
  },

  // Status
  status: {
    aiThinking: 'AIが考え中...',
    executingTool: (toolName: string) => `${toolName}を実行中...`,
    waitingForApproval: 'ツールの承認待ち',
    messageQueued: 'メッセージがキュー中...',
    commands: {
      compact: '会話を圧縮中...',
      clear: '会話をクリア中...',
      help: 'ヘルプを読み込み中...',
      model: 'モデルを切り替え中...',
      config: '設定を読み込み中...',
      init: 'プロジェクトを初期化中...',
      resume: 'セッションを再開中...',
      memory: 'メモリを管理中...',
      mcp: 'MCPサーバーを管理中...',
      permissions: '権限を管理中...',
    },
  },

  // Workspace Browser
  workspaceBrowser: workspaceBrowserJa,

  // Right Panel - Including all tab translations
  rightPanel: {
    sessions: rightPanelJa.sessions,
    workspace: rightPanelJa.workspace,
    prompts: rightPanelJa.prompts,
    skills: rightPanelJa.skills,
    closePanel: rightPanelJa.closePanel,
    sessionsTab: rightPanelJa.sessionsTab,
    promptsTab: rightPanelJa.promptsTab,
    workspaceTab: rightPanelJa.workspaceTab,
    skillsTab: rightPanelJa.skillsTab,
  },

  // Template Editor
  templateEditor: {
    title: 'テンプレートを編集',
    namePlaceholder: 'テンプレート名...',
    contentPlaceholder: 'プロンプトテンプレートの内容をここに入力してください...\n\nMarkdownをサポート:\n- **太字**、*斜体*\n- # 見出し\n- - リスト\n- ```コードブロック```\n- [リンク](url)',
    edit: '編集',
    preview: 'プレビュー',
    bold: '太字',
    italic: '斜体',
    codeBlock: 'コードブロック',
    inlineCode: 'インラインコード',
    link: 'リンク',
    bulletList: '箇条書きリスト',
    numberedList: '番号付きリスト',
    heading: '見出し',
    cancel: 'キャンセル',
    save: '保存',
    saving: '保存中...',
    noContent: 'まだ内容がありません',
  },

  // Error Messages
  errors: {
    failedToCancel: 'リクエストのキャンセルに失敗しました',
    failedToCreateSession: 'セッションの作成に失敗しました',
    failedToLoadModels: 'モデルと認証の読み込みに失敗しました',
    failedToUpdateTitle: 'セッションタイトルの更新に失敗しました',
    failedToSendMessage: 'メッセージの送信に失敗しました',
    failedToSaveTemplate: 'テンプレートの保存に失敗しました',
    failedToDeleteTemplate: 'テンプレートの削除に失敗しました',
    failedToDeleteAllTemplates: 'すべてのテンプレートの削除に失敗しました',
    failedToDeleteSession: 'セッションの削除に失敗しました',
    failedToLoadSessions: 'セッションの読み込みに失敗しました',
    failedToLoadTemplates: 'テンプレートの読み込みに失敗しました',
    failedToLoadWorkspaces: 'ワークスペースツリーの読み込みに失敗しました',
    failedToAddWorkspace: 'ワークスペースの追加に失敗しました',
    failedToRemoveWorkspace: 'ワークスペースの削除に失敗しました',
    failedToApplyWorkspaces: 'ワークスペースの適用に失敗しました',
    failedToReadImage: '画像ファイルの読み取りに失敗しました',
    failedToPasteImage: '貼り付けた画像の読み取りに失敗しました',
  },

  // Settings Dialog
  settings: settingsJa,
};
