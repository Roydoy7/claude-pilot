/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Right Panel (Sessions, Prompts, Workspace tabs)
 */

export const rightPanelJa = {
  // Tab labels
  sessions: 'セッション',
  workspace: 'ワークスペース',
  prompts: 'プロンプト',
  closePanel: 'パネルを閉じる',

  // Sessions Tab
  sessionsTab: {
    loading: 'セッションを読み込み中...',
    newSession: '+ 新しいセッション',
    noSessions: 'まだセッションがありません。新しいセッションを作成して始めましょう！',
    newSessionFallback: '新しいセッション',
    deleteAllTooltip: (count: number) => `すべての${count}件のセッションを削除`,
    noSessionsToDelete: '削除するセッションがありません',
    deleteAllConfirm: (count: number) =>
      `本当にすべての${count}件のセッションを削除しますか？この操作は元に戻せません。`,
    deleteSessionConfirm: '本当にこのセッションを削除しますか？',
  },

  // Prompts Tab
  promptsTab: {
    title: 'プロンプトテンプレート',
    description: 'テンプレートをクリックして入力に適用',
    newTemplate: '新しいテンプレート',
    clearAll: 'すべてクリア',
    noTemplates: 'まだテンプレートがありません',
    editTooltip: 'テンプレートを編集',
    deleteTooltip: 'テンプレートを削除',
    deleteConfirm: '本当にこのテンプレートを削除しますか？',
    deleteAllConfirm: (count: number) =>
      `本当にすべての${count}件のテンプレートを削除しますか？この操作は元に戻せません。`,
  },

  // Workspace Tab
  workspaceTab: {
    title: 'ワークスペース',
    description: 'AIがローカルファイルにアクセスして作業できるようにワークスペースフォルダを追加します',
    pending: (count: number) => `保留中 (${count})`,
    applied: (count: number) => `適用済み (${count})`,
    addWorkspace: '+ ワークスペースを追加',
    applyToSession: 'セッションに適用',
    removeTooltip: 'ワークスペースを削除',
    noSessionTooltip: 'アクティブなセッションがありません - 先に新しいセッションを開始してください',
    addWorkspacesTooltip: '適用するには上記でワークスペースを追加してください',
    applyWorkspacesTooltip: '保留中のワークスペースを現在のセッションに適用',
    noSessionWarning: '⚠️ アクティブなセッションがありません。ワークスペースを適用するには新しいセッションを開始してください。',
    addWorkspacesInfo: 'ℹ️ 現在のセッションに適用するには、上記で新しいワークスペースを追加してください。',
    workspaceLabel: (index: number) => `Workspace ${index}`,
  },
};
