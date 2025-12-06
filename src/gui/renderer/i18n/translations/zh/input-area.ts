/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Chinese translations - Input Area
 */

export const inputAreaZh = {
  placeholder: '输入消息',
  browseWorkspace: '浏览工作区文件',
  bold: '粗体',
  italic: '斜体',
  code: '代码',
  clear: '清空',
  uploadImage: '上传图片',
  cancelRequest: '取消请求',
  sendMessage: '发送 (Enter)',
  removeImage: '移除图片',
  permissionMode: {
    label: '权限模式',
    modes: {
      default: {
        name: 'Default',
        description: '在文件编辑和危险操作前询问确认',
      },
      acceptEdits: {
        name: 'Accept Edits',
        description: '自动批准文件编辑，但其他危险操作（如 Bash 命令）仍需确认',
      },
      bypassPermissions: {
        name: 'Bypass Permissions',
        description: '自动批准所有操作，包括文件编辑和 Bash 命令（YOLO 模式）',
      },
      plan: {
        name: 'Plan',
        description: '仅分析和规划，不允许修改文件',
      },
      dontAsk: {
        name: "Don't Ask",
        description: '静默模式 - 跳过所有确认提示，用于自动化场景',
      },
    },
  },
};
