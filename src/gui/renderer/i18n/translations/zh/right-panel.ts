/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Chinese translations - Right Panel (Sessions, Prompts, Workspace tabs)
 */

export const rightPanelZh = {
  context: '上下文',
  // Tab labels
  workspace: '工作区',
  prompts: '提示词',
  skills: '技能',
  browser: '浏览器',
  closePanel: '关闭面板',

  // Browser Tab
  browserTab: {
    back: '后退',
    forward: '前进',
    reload: '刷新',
    go: '转到',
    newTab: '新建标签页',
    closeTab: '关闭标签页',
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
    workspaceLabel: (index: number) => `工作区 ${index}`,
    workingDirectory: '工作目录 (cwd)',
    setDuringCreation: '在会话创建时设置',
    additionalDirectories: (count: number) => `额外目录 (${count})`,
    addDirectory: '+ 添加目录',
    noAdditionalDirectories: '未添加额外目录',
    directoryLabel: (index: number) => `目录 ${index}`,
    removeDirectory: '移除目录',
    accessNote: 'AI 可以访问工作目录和所有额外目录中的文件。',
  },

  // Skills Tab
  skillsTab: {
    title: '技能',
    enableSkills: '启用技能',
    installed: '已安装',
    marketplace: '市场',
    noSkillsInstalled: '尚未安装技能。',
    browseMarketplace: '浏览市场以查找技能。',
    selectSession: '选择会话以管理技能。',
    refreshMarketplace: '刷新市场',
    loading: '加载中...',
    clickRefresh: '点击刷新以浏览可用技能。',
    install: '安装',
    installing: '安装中...',
    uninstall: '卸载',
  },
};
