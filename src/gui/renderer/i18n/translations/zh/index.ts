/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Chinese translations - Index
 */

import type { Translation } from '../../types';
import { commonZh } from './common';
import { headerZh } from './header';
import { sessionConfigZh } from './session-config';
import { inputAreaZh } from './input-area';
import { leftSidebarZh } from './left-sidebar';
import { rightPanelZh } from './right-panel';
import { workspaceBrowserZh } from './workspace-browser';
import { settingsZh } from './settings';
import { suggestionsZh } from './suggestions';

export const zhTranslations: Translation = {
  common: commonZh,
  header: headerZh,
  sessionConfig: sessionConfigZh,
  inputArea: inputAreaZh,

  // Message
  message: {
    saveAsTemplate: '保存为模板',
    saved: '已保存！',
    attachment: (index: number) => `附件 ${index + 1}`,
    tokens: {
      input: '输入 tokens（新增）',
      output: '输出 tokens',
      total: '总 tokens',
      cacheHit: (count: number) => `缓存命中：从缓存读取 ${count} tokens（节省 90% 成本）`,
      cacheWrite: (count: number) => `缓存写入：向缓存写入 ${count} tokens（增加 25% 成本）`,
      cache5min: '5 分钟缓存',
      cache1hour: '1 小时缓存（Max 订阅）',
      serviceTier: (tier: string) => `服务层级：${tier}`,
    },
    stats: {
      duration: '耗时',
      cost: '本轮花费（美元）',
      turns: '对话轮数',
      model: '使用的模型',
    },
  },

  // Message List
  messageList: {
    noMessages: '还没有消息。开始对话吧！',
    newMessages: '新消息',
    scrollToBottom: '滚动到底部',
    usageLimitReached: '已达到使用限额',
    assistant: '助手',
  },

  // Compact Summary
  compactSummary: {
    title: '对话摘要',
    continuedFrom: '从上一轮上下文继续',
    expand: '展开完整摘要',
    collapse: '收起',
  },

  taskNotification: {
    outputFile: '输出文件',
    tokens: 'tokens',
    toolUses: '工具调用',
    duration: '耗时',
  },

  // Tool Call
  toolCall: {
    showCode: '显示代码',
    hideCode: '隐藏代码',
    showResult: '显示结果',
    hideResult: '隐藏结果',
    showDetails: '显示详情',
    hideDetails: '隐藏详情',
    showTasks: '显示任务',
    hideTasks: '隐藏任务',
    error: '❌ 错误：',
    output: '✅ 输出：',
    agentType: '🎯 代理类型：',
    requirements: '📦 **依赖：**',
    workingDirectory: '📁 **工作目录：**',
    file: '文件：',
    operation: '操作：',
    pages: '页面：',
    query: '查询：',
    outputFile: '输出：',
    sources: '来源：',
  },

  // Status
  status: {
    aiThinking: 'AI 正在思考...',
    aiThinkingWithTokens: (tokens: number) => `AI 正在思考...（约 ${tokens} tokens）`,
    executingTool: (toolName: string) => `正在执行 ${toolName}...`,
    waitingForApproval: '等待工具审批',
    messageQueued: '消息已排队，请等待...',
    commands: {
      compact: '正在压缩对话...',
      clear: '正在清除对话...',
      help: '正在加载帮助...',
      model: '正在切换模型...',
      config: '正在加载配置...',
      init: '正在初始化项目...',
      resume: '正在恢复会话...',
      memory: '正在管理记忆...',
      mcp: '正在管理 MCP 服务器...',
      permissions: '正在管理权限...',
    },
  },

  // Workspace Browser
  workspaceBrowser: workspaceBrowserZh,

  // Left Sidebar
  leftSidebar: leftSidebarZh,

  // Right Panel - Including all tab translations
  rightPanel: {
    context: rightPanelZh.context,
    workspace: rightPanelZh.workspace,
    prompts: rightPanelZh.prompts,
    skills: rightPanelZh.skills,
    browser: rightPanelZh.browser,
    closePanel: rightPanelZh.closePanel,
    browserTab: rightPanelZh.browserTab,
    promptsTab: rightPanelZh.promptsTab,
    workspaceTab: rightPanelZh.workspaceTab,
    skillsTab: rightPanelZh.skillsTab,
  },

  // Template Editor
  templateEditor: {
    title: '编辑模板',
    namePlaceholder: '模板名称...',
    contentPlaceholder: '在此输入您的提示词模板内容...\n\n支持 Markdown：\n- **粗体**、*斜体*\n- # 标题\n- - 列表\n- ```代码块```\n- [链接](url)',
    edit: '编辑',
    preview: '预览',
    bold: '粗体',
    italic: '斜体',
    codeBlock: '代码块',
    inlineCode: '行内代码',
    link: '链接',
    bulletList: '无序列表',
    numberedList: '有序列表',
    heading: '标题',
    cancel: '取消',
    save: '保存',
    saving: '正在保存...',
    noContent: '暂无内容',
  },

  // Error Messages
  errors: {
    failedToCancel: '取消请求失败',
    failedToCreateSession: '创建会话失败',
    failedToLoadModels: '加载模型和认证失败',
    failedToUpdateTitle: '更新会话标题失败',
    failedToSendMessage: '发送消息失败',
    failedToSaveTemplate: '保存模板失败',
    failedToDeleteTemplate: '删除模板失败',
    failedToDeleteAllTemplates: '删除全部模板失败',
    failedToDeleteSession: '删除会话失败',
    failedToLoadSessions: '加载会话失败',
    failedToLoadTemplates: '加载模板失败',
    failedToLoadWorkspaces: '加载工作区树失败',
    failedToAddWorkspace: '添加工作区失败',
    failedToRemoveWorkspace: '移除工作区失败',
    failedToApplyWorkspaces: '应用工作区失败',
    failedToReadImage: '读取图片文件失败',
    failedToPasteImage: '读取粘贴的图片失败',
  },

  // Settings Dialog
  settings: settingsZh,

  // Prompt Suggestions
  suggestions: suggestionsZh,
};
