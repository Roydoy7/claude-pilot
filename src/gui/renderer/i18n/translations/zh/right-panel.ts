/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Chinese translations - Right Panel (Sessions, Prompts, Workspace tabs)
 */

export const rightPanelZh = {
  // Tab labels
  sessions: '会话',
  workspace: '工作区',
  prompts: '提示词',
  closePanel: '关闭面板',

  // Sessions Tab
  sessionsTab: {
    loading: '正在加载会话...',
    newSession: '+ 新建会话',
    noSessions: '还没有会话。创建一个开始吧！',
    newSessionFallback: '新会话',
    deleteAllTooltip: (count: number) => `删除全部 ${count} 个会话`,
    noSessionsToDelete: '没有可删除的会话',
    deleteAllConfirm: (count: number) =>
      `确定要删除全部 ${count} 个会话吗？此操作无法撤销。`,
    deleteSessionConfirm: '确定要删除此会话吗？',
  },

  // Prompts Tab
  promptsTab: {
    title: '提示词模板',
    description: '点击模板将其应用到输入框',
    newTemplate: '新建模板',
    clearAll: '清空全部',
    noTemplates: '还没有模板',
    editTooltip: '编辑模板',
    deleteTooltip: '删除模板',
    deleteConfirm: '确定要删除此模板吗？',
    deleteAllConfirm: (count: number) =>
      `确定要删除全部 ${count} 个模板吗？此操作无法撤销。`,
  },

  // Workspace Tab
  workspaceTab: {
    title: '工作区',
    description: '添加工作区文件夹以允许 AI 访问和处理您的本地文件',
    pending: (count: number) => `待应用 (${count})`,
    applied: (count: number) => `已应用 (${count})`,
    addWorkspace: '+ 添加工作区',
    applyToSession: '应用到会话',
    removeTooltip: '移除工作区',
    noSessionTooltip: '无活动会话 - 请先开始新会话',
    addWorkspacesTooltip: '在上方添加工作区以应用',
    applyWorkspacesTooltip: '将待应用的工作区应用到当前会话',
    noSessionWarning: '⚠️ 无活动会话。开始新会话以应用工作区。',
    addWorkspacesInfo: 'ℹ️ 在上方添加新工作区以应用到当前会话。',
    workspaceLabel: (index: number) => `Workspace ${index}`,
  },
};
