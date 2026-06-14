/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tool Renderers Index - Export all tool renderers
 */

// Types
export type { ToolConfig, ToolArgs } from './types';
export {
  buttonStyle,
  getButtonStyle,
  contentContainerStyle,
  codeStyle,
  isMcpToolError,
  parseMcpOutput,
} from './types';

// Code execution renderers
export { pythonRenderer } from './python-renderer';
export { typescriptRenderer } from './typescript-renderer';

// MCP tool renderers
export {
  createMcpRenderer,
  imageRenderer,
  pptxRenderer,
  xlsxRenderer,
  defaultMcpRenderer,
} from './mcp-renderer';

// PDF renderer
export { pdfRenderer, PdfIcon } from './pdf-renderer';

// Document conversion renderers
export {
  convertRenderer,
  markitdownRenderer,
  markdownToWordRenderer,
  DocumentConvertIcon,
  WordDocIcon,
} from './convert-renderer';

// DOCX tool renderer
export { docxRenderer, DocxIcon } from './docx-renderer';

// Claude Agent SDK tool renderers
export {
  readRenderer,
  writeRenderer,
  bashRenderer,
  globRenderer,
  grepRenderer,
  lsRenderer,
  FileTextIcon,
  WriteIcon,
  SearchIcon,
  GlobIcon,
  FolderIcon,
} from './sdk-tools-renderer';

// Edit tool renderer
export { editRenderer, EditIcon } from './edit-renderer';

// Web tool renderers
export {
  webFetchRenderer,
  webSearchRenderer,
} from './web-renderer';

// Task/Agent tool renderers
export {
  taskRenderer,
  todoWriteRenderer,
  taskCreateRenderer,
  taskGetRenderer,
  taskUpdateRenderer,
  taskListRenderer,
} from './task-renderer';

// Skill tool renderer
export { skillRenderer, SkillIcon } from './skill-renderer';

// Notebook/MultiEdit tool renderers
export {
  multiEditRenderer,
  notebookEditRenderer,
} from './notebook-renderer';

// Shared components
export {
  ApprovalWaitingIcon,
  AnimatedApprovalText,
  ProgressLog,
  CopyButton,
} from './shared-components';

// Python code display
export { PythonCodeDisplay } from './python-code-display';

// MCP tool result component
export { McpToolResult } from './McpToolResult';
