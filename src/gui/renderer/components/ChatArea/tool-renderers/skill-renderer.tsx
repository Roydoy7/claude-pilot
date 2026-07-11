/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Skill Tool Renderer - Displays skill invocation with custom styling
 */

import type { ReactNode } from 'react';
import type { ToolConfig, ToolArgs } from './types';
import { getButtonStyle, contentContainerStyle, isMcpToolError } from './types';
import type { ToolResponse } from '../../../../preload/preload-types';
import { McpToolResult } from './McpToolResult';

// ============================================
// Skill Icon Component
// ============================================

export function SkillIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--accent)' }}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

// ============================================
// Skill Tool Renderer
// ============================================

export const skillRenderer: ToolConfig = {
  icon: <SkillIcon />,

  getInlineText: (args: ToolArgs): string => {
    const skillName = String(args.skill || '');
    const skillArgs = args.args ? ` ${String(args.args)}` : '';
    return skillName ? `/${skillName}${skillArgs}` : '';
  },

  hasDetails: (_args: ToolArgs, response?: ToolResponse): boolean => {
    return !!response;
  },

  renderButton: (
    _args: ToolArgs,
    _showDetails: boolean,
    _setShowDetails: (show: boolean) => void,
    response?: ToolResponse,
    showResult?: boolean,
    setShowResult?: (show: boolean) => void
  ) => {
    if (!response || !setShowResult) return null;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowResult(!showResult);
        }}
        style={getButtonStyle(showResult ?? false)}
      >
        {showResult ? 'Hide' : 'Result'}
      </button>
    );
  },

  renderContent: (
    args: ToolArgs,
    showResult?: boolean,
    response?: ToolResponse
  ) => {
    const elements: ReactNode[] = [];

    // Show skill info
    const skillName = String(args.skill || '');
    const skillArgs = args.args ? String(args.args) : '';

    if (skillName) {
      elements.push(
        <div key="skill-info" style={{
          ...contentContainerStyle,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          borderLeft: '3px solid var(--accent)',
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: '600' }}>
            /{skillName}
          </span>
          {skillArgs && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
              {skillArgs}
            </span>
          )}
        </div>
      );
    }

    // Show result
    if (showResult && response) {
      elements.push(
        <McpToolResult
          key="result"
          output={response.output}
          error={response.error}
          isError={isMcpToolError(response)}
        />
      );
    }

    return elements.length > 0 ? <>{elements}</> : null;
  },
};
