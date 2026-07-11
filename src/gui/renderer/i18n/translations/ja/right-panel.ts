/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Right Panel (Sessions, Prompts, Workspace tabs)
 */

export const rightPanelJa = {
  context: 'コンテキスト',
  // Tab labels
  workspace: 'ワークスペース',
  prompts: 'プロンプト',
  skills: 'スキル',
  closePanel: 'パネルを閉じる',

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
    workspaceLabel: (index: number) => `ワークスペース ${index}`,
    workingDirectory: '作業ディレクトリ (cwd)',
    setDuringCreation: 'セッション作成時に設定',
    additionalDirectories: (count: number) => `追加ディレクトリ (${count})`,
    addDirectory: '+ ディレクトリを追加',
    noAdditionalDirectories: '追加ディレクトリはありません',
    directoryLabel: (index: number) => `ディレクトリ ${index}`,
    removeDirectory: 'ディレクトリを削除',
    accessNote: 'AIは作業ディレクトリとすべての追加ディレクトリ内のファイルにアクセスできます。',
  },

  // Skills Tab
  skillsTab: {
    title: 'スキル',
    enableSkills: 'スキルを有効化',
    installed: 'インストール済み',
    marketplace: 'マーケットプレイス',
    noSkillsInstalled: 'まだスキルがインストールされていません。',
    browseMarketplace: 'マーケットプレイスでスキルを探す。',
    selectSession: 'スキルを管理するにはセッションを選択してください。',
    refreshMarketplace: 'マーケットプレイスを更新',
    loading: '読み込み中...',
    clickRefresh: '更新をクリックして利用可能なスキルを表示します。',
    install: 'インストール',
    installing: 'インストール中...',
    uninstall: 'アンインストール',
  },
};
