/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Japanese translations - Input Area
 */

export const inputAreaJa = {
  placeholder: 'メッセージを入力',
  browseWorkspace: 'ワークスペースファイルを参照',
  bold: '太字',
  italic: '斜体',
  code: 'コード',
  clear: 'クリア',
  uploadImage: '画像をアップロード',
  cancelRequest: 'リクエストをキャンセル',
  sendMessage: '送信 (Enter)',
  removeImage: '画像を削除',
  permissionMode: {
    label: '権限モード',
    modes: {
      default: {
        name: 'Default',
        description: 'ファイル編集や危険な操作の前に確認を求める',
      },
      acceptEdits: {
        name: 'Accept Edits',
        description: 'ファイル編集を自動承認、ただし他の危険な操作（Bashコマンドなど）は確認が必要',
      },
      bypassPermissions: {
        name: 'Bypass Permissions',
        description: 'ファイル編集やBashコマンドを含むすべての操作を自動承認（YOLOモード）',
      },
      plan: {
        name: 'Plan',
        description: '分析と計画のみ、ファイルの変更は許可されない',
      },
      dontAsk: {
        name: "Don't Ask",
        description: 'サイレントモード - すべての確認プロンプトをスキップ、自動化シナリオ用',
      },
      delegate: {
        name: 'Delegate',
        description: 'チームリーダーモード - TeammateツールとTaskツールでのみ作業を委任',
      },
    },
  },
  settingSources: {
    label: '設定ソース',
    sources: {
      user: {
        name: 'User',
        description: 'ユーザーレベル設定 (~/.claude/settings.json)',
      },
      project: {
        name: 'Project',
        description: 'プロジェクトレベル設定 (CLAUDE.md ファイル)',
      },
      local: {
        name: 'Local',
        description: 'ローカル設定 (.claude/settings.local.json)',
      },
    },
  },
  slashCommands: {
    label: 'コマンド',
  },
  promptsButton: {
    tooltip: 'クイックプロンプト',
    title: 'プロンプトテンプレート',
    noTemplates: 'テンプレートがありません',
  },
};
