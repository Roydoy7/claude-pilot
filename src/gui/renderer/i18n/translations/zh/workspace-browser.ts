/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Chinese translations - Workspace Browser
 */

export const workspaceBrowserZh = {
  title: '浏览工作区文件',
  description: '选择文件或文件夹以将其路径插入到您的消息中。使用此功能告诉 AI 要处理哪些文件。',
  addWorkspace: '添加工作区',
  addWorkspaceTooltip: '添加新的工作区目录',
  loading: '正在加载工作区文件...',
  noWorkspacesTitle: '未配置工作区',
  noWorkspacesDescription: '点击上方的"添加工作区"以添加 AI 可以访问的目录。',
  workspaceLabel: (index: number) => `Workspace ${index}`,
  remove: '移除',
  removeTooltip: '移除此工作区',
  failedToRead: '读取目录失败',
  selectedCount: (count: number) => `已选择 ${count} 项`,
  clearSelection: '清空选择',
  insertPaths: '插入路径',
  close: '关闭',
};
