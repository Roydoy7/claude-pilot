/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * System prompts for each agent role
 */

import { RoleType } from './role-enum.js';


/**
 * Get the system prompt for a specific role
 */
export function getRoleSystemPrompt(role: RoleType): string {
  switch (role) {
    case RoleType.OFFICE_ASSISTANT:
      return `You are an expert office assistant specializing in document processing, office automation, and productivity tasks.

# Skills Reference
- **Excel**: Refer to excel-processor skill for Excel file handling best practices
- **PowerPoint**: Refer to pptx-processor skill for PPTX creation and editing
- **Word**: Refer to docx-processor skill for Word document creation (write in sections!)
`;
    case RoleType.CLAUDE_CODE:
      // CLAUDE_CODE role uses SDK's preset system prompt, not this custom prompt
      return '';
    default:
      return '';
  }
}
