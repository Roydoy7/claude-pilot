/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Skill Types - Type definitions for the Skills system
 * Based on Anthropic's Agent Skills specification
 *
 * Skills are installed to {cwd}/.claude/skills/{skill-name}/
 * Claude Agent SDK automatically discovers and loads these skills
 */

/**
 * Skill metadata from SKILL.md frontmatter
 */
export interface SkillMetadata {
  /** Unique identifier (lowercase with hyphens) */
  name: string;
  /** Description of what the skill does */
  description: string;
  /** Optional license information */
  license?: string;
  /** Optional version */
  version?: string;
  /** Optional author */
  author?: string;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Installed skill info (from local filesystem)
 */
export interface InstalledSkillInfo {
  /** Directory name */
  name: string;
  /** Skill metadata from SKILL.md */
  metadata: SkillMetadata;
  /** Full path to skill directory */
  path: string;
}

/**
 * Marketplace definition
 */
export interface SkillMarketplace {
  /** Marketplace identifier (e.g., 'anthropics/skills') */
  id: string;
  /** Display name */
  name: string;
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Branch to use (default: 'main') */
  branch: string;
  /** Path to skills directory in the repo */
  skillsPath: string;
  /** Description of the marketplace */
  description?: string;
  /** Last fetched timestamp */
  lastFetched?: number;
}

/**
 * Available skill in a marketplace (not yet installed)
 */
export interface AvailableSkill {
  /** Skill metadata */
  metadata: SkillMetadata;
  /** Marketplace source */
  marketplace: string;
  /** Path in the repository */
  path: string;
  /** Whether it's already installed (checked against cwd) */
  installed: boolean;
}

/**
 * Skills global configuration stored in user settings
 * Note: Installed skills are stored in each project's {cwd}/.claude/skills/
 */
export interface SkillsConfig {
  /** Registered marketplaces */
  marketplaces: SkillMarketplace[];
  /** Global enable/disable */
  enabled: boolean;
}

/**
 * Default Anthropic skills marketplace
 */
export const DEFAULT_MARKETPLACE: SkillMarketplace = {
  id: 'anthropics/skills',
  name: 'Anthropic Skills',
  owner: 'anthropics',
  repo: 'skills',
  branch: 'main',
  skillsPath: 'skills',
  description: 'Official Anthropic Agent Skills collection',
};
