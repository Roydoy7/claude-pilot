/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Workspace Browser
 */

export const workspaceBrowserJa = {
  title: 'ワークスペースファイルを参照',
  description: 'ファイルまたはフォルダを選択してメッセージにパスを挿入します。これを使用してAIにどのファイルを操作するか指示します。',
  addWorkspace: 'ワークスペースを追加',
  addWorkspaceTooltip: '新しいワークスペースディレクトリを追加',
  loading: 'ワークスペースファイルを読み込み中...',
  noWorkspacesTitle: 'ワークスペースが設定されていません',
  noWorkspacesDescription: '上の「ワークスペースを追加」をクリックして、AIがアクセスできるディレクトリを追加してください。',
  workspaceLabel: (index: number) => `Workspace ${index}`,
  remove: '削除',
  removeTooltip: 'このワークスペースを削除',
  failedToRead: 'ディレクトリの読み取りに失敗しました',
  selectedCount: (count: number) => `${count}個のアイテムを選択中`,
  clearSelection: '選択をクリア',
  insertPaths: 'パスを挿入',
  close: '閉じる',
};
