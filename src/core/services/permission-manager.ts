/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Permission Manager - manages tool permissions and risk levels
 * Provides fine-grained control over tool usage
 */

/**
 * Tool risk level classification
 */
export enum ToolRiskLevel {
  SAFE = 'safe',           // Read-only tools: Read, Grep, Glob
  MODERATE = 'moderate',   // File modification: Write, Edit
  DANGEROUS = 'dangerous'  // System operations: Bash, Python execution
}

/**
 * Permission mode - controls overall permission behavior
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions';

/**
 * Tool risk classification map
 */
const TOOL_RISK_MAP: Record<string, ToolRiskLevel> = {
  // Safe - Read-only tools
  'Read': ToolRiskLevel.SAFE,
  'Grep': ToolRiskLevel.SAFE,
  'Glob': ToolRiskLevel.SAFE,
  'WebFetch': ToolRiskLevel.SAFE,
  'WebSearch': ToolRiskLevel.SAFE,

  // Moderate - File modifications
  'Write': ToolRiskLevel.MODERATE,
  'Edit': ToolRiskLevel.MODERATE,
  'TodoWrite': ToolRiskLevel.MODERATE,

  // Dangerous - System operations
  'Bash': ToolRiskLevel.DANGEROUS,
  'mcp__claude-pilot-tools__python': ToolRiskLevel.DANGEROUS,

  // MCP Tools - classified by operation type
  'mcp__claude-pilot-tools__pdf': ToolRiskLevel.MODERATE,
  'mcp__claude-pilot-tools__markitdown': ToolRiskLevel.MODERATE,
  'mcp__claude-pilot-tools__markdown_to_word': ToolRiskLevel.MODERATE,
};

/**
 * Permission configuration
 */
export interface PermissionConfig {
  mode: PermissionMode;
  allowedTools?: string[];
  deniedTools?: string[];
}

/**
 * Default permission configuration
 */
const DEFAULT_CONFIG: PermissionConfig = {
  mode: 'default',
};

/**
 * Permission Manager - Singleton
 * Manages tool permissions and risk levels
 */
export class PermissionManager {
  private static instance: PermissionManager;
  private config: PermissionConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Set permission mode
   */
  setPermissionMode(mode: PermissionMode): void {
    this.config.mode = mode;
    console.log(`Permission mode set to: ${mode}`);
  }

  /**
   * Get current permission mode
   */
  getPermissionMode(): PermissionMode {
    return this.config.mode;
  }

  /**
   * Set allowed tools
   */
  setAllowedTools(tools: string[]): void {
    this.config.allowedTools = tools;
  }

  /**
   * Set denied tools
   */
  setDeniedTools(tools: string[]): void {
    this.config.deniedTools = tools;
  }

  /**
   * Get risk level for a tool
   */
  getToolRiskLevel(toolName: string): ToolRiskLevel {
    return TOOL_RISK_MAP[toolName] || ToolRiskLevel.MODERATE;
  }

  /**
   * Check if a tool is explicitly denied
   */
  isToolDenied(toolName: string): boolean {
    if (this.config.deniedTools?.includes(toolName)) {
      return true;
    }
    return false;
  }

  /**
   * Check if a tool is explicitly allowed
   */
  isToolAllowed(toolName: string): boolean {
    // If allowedTools is not set, all tools are potentially allowed
    if (!this.config.allowedTools) {
      return true;
    }
    return this.config.allowedTools.includes(toolName);
  }

  /**
   * Check if tool requires approval based on current mode and risk level
   * Returns true if approval is needed, false if auto-approved
   */
  requiresApproval(toolName: string): boolean {
    // Explicit deny always requires approval (to show error)
    if (this.isToolDenied(toolName)) {
      return true;
    }

    // Not in allowed list
    if (!this.isToolAllowed(toolName)) {
      return true;
    }

    const mode = this.config.mode;
    const riskLevel = this.getToolRiskLevel(toolName);

    // Bypass mode - no approval needed
    if (mode === 'bypassPermissions') {
      return false;
    }

    // Accept edits mode - auto-approve safe and moderate tools
    if (mode === 'acceptEdits') {
      if (riskLevel === ToolRiskLevel.SAFE || riskLevel === ToolRiskLevel.MODERATE) {
        return false;
      }
    }

    // Default mode - only safe tools are auto-approved
    if (mode === 'default') {
      if (riskLevel === ToolRiskLevel.SAFE) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get list of tools that require approval in current mode
   */
  getToolsRequiringApproval(): string[] {
    return Object.keys(TOOL_RISK_MAP).filter(tool => this.requiresApproval(tool));
  }

  /**
   * Get configuration summary
   */
  getConfigSummary(): {
    mode: PermissionMode;
    allowedTools: string[];
    deniedTools: string[];
    autoApprovedTools: string[];
    requiresApprovalTools: string[];
  } {
    const allTools = Object.keys(TOOL_RISK_MAP);
    const autoApproved = allTools.filter(tool => !this.requiresApproval(tool));
    const requiresApproval = allTools.filter(tool => this.requiresApproval(tool));

    return {
      mode: this.config.mode,
      allowedTools: this.config.allowedTools || allTools,
      deniedTools: this.config.deniedTools || [],
      autoApprovedTools: autoApproved,
      requiresApprovalTools: requiresApproval,
    };
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }
}

/**
 * Get the singleton instance
 */
export const permissionManager = PermissionManager.getInstance();
