/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Skill Manager - Manages skill marketplaces and installation
 *
 * Skill sources:
 * 1. Built-in marketplace: src/core/custom-skills/ (virtual marketplace, local files)
 * 2. GitHub marketplaces: Remote repositories (e.g., anthropics/skills)
 *
 * All skills are installed to: {cwd}/.claude/skills/{skill-name}/
 * Claude Agent SDK automatically discovers and loads these skills.
 */

import type {
  SkillMetadata,
  SkillMarketplace,
  SkillsConfig,
  AvailableSkill,
  InstalledSkillInfo,
} from './skill-types.js';
import { DEFAULT_MARKETPLACE } from './skill-types.js';
import * as fs from 'fs/promises';
import { existsSync, cpSync } from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getAgentDefinition } from '../agents/agent-loader.js';

/** Built-in marketplace ID */
export const BUILTIN_MARKETPLACE_ID = 'builtin';

/**
 * Built-in skills marketplace (virtual, from local files)
 */
export const BUILTIN_MARKETPLACE: SkillMarketplace = {
  id: BUILTIN_MARKETPLACE_ID,
  name: 'Built-in Skills',
  owner: 'local',
  repo: 'custom-skills',
  branch: 'main',
  skillsPath: '',
  description: 'Skills shipped with Claude Pilot',
};

/**
 * Get the path to built-in custom-skills directory
 * In development: src/core/custom-skills
 * In production: resources/custom-skills (copied during build)
 */
function getBuiltinSkillsPath(): string {
  // Check if running in packaged app
  if (app?.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, 'custom-skills');
  }
  // Development mode - try multiple possible locations
  const possiblePaths = [
    path.join(__dirname, 'custom-skills'),
    path.join(__dirname, '..', 'custom-skills'),
    path.join(process.cwd(), 'src', 'core', 'custom-skills'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return path.join(process.cwd(), 'src', 'core', 'custom-skills');
}

/**
 * GitHub API response for directory contents
 */
interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  sha: string;
}

/**
 * Parse SKILL.md frontmatter to extract metadata
 * Supports YAML multi-line strings (| and >)
 */
function parseSkillFrontmatter(content: string): SkillMetadata {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const frontmatter = match[1];
  const metadata: SkillMetadata = { name: '', description: '' };

  const lines = frontmatter.split('\n');
  let currentKey: string | null = null;
  let multiLineValue: string[] = [];
  let multiLineIndent = 0;

  const saveMultiLineValue = () => {
    if (currentKey && multiLineValue.length > 0) {
      const value = multiLineValue.join(' ').trim();
      if (currentKey === 'name') metadata.name = value;
      else if (currentKey === 'description') metadata.description = value;
      else if (currentKey === 'license') metadata.license = value;
      else if (currentKey === 'version') metadata.version = value;
      else if (currentKey === 'author') metadata.author = value;
    }
    currentKey = null;
    multiLineValue = [];
    multiLineIndent = 0;
  };

  for (const line of lines) {
    // Check if this is a continuation of multi-line value
    if (currentKey && line.match(/^\s+\S/)) {
      const indentMatch = line.match(/^(\s+)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      if (multiLineIndent === 0) multiLineIndent = indent;
      if (indent >= multiLineIndent) {
        multiLineValue.push(line.trim());
        continue;
      }
    }

    // Save previous multi-line value if any
    if (currentKey) {
      saveMultiLineValue();
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && !line.startsWith(' ')) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Check for multi-line indicator (| or >)
      if (value === '|' || value === '>') {
        currentKey = key;
        multiLineValue = [];
        multiLineIndent = 0;
        continue;
      }

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key === 'name') metadata.name = value;
      else if (key === 'description') metadata.description = value;
      else if (key === 'license') metadata.license = value;
      else if (key === 'version') metadata.version = value;
      else if (key === 'author') metadata.author = value;
      else if (key === 'tags') {
        // Parse array format: [tag1, tag2] or comma-separated
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata.tags = value.slice(1, -1).split(',').map((t) => t.trim().replace(/['"]/g, ''));
        } else {
          metadata.tags = value.split(',').map((t) => t.trim());
        }
      }
    }
  }

  // Save any remaining multi-line value
  saveMultiLineValue();

  if (!metadata.name) {
    throw new Error('Invalid SKILL.md: missing name field');
  }

  return metadata;
}

/**
 * Skills Manager class
 * Manages marketplace config globally, but installs skills to session's cwd
 * Uses singleton pattern for global access
 */
export class SkillManager {
  private static instance: SkillManager;
  private config: SkillsConfig;
  private configPath: string;
  private initialized = false;

  private constructor() {
    const userDataPath = app?.getPath('userData') || process.cwd();
    this.configPath = path.join(userDataPath, 'skills-config.json');
    this.config = {
      marketplaces: [DEFAULT_MARKETPLACE],
      enabled: true,
    };
  }

  /**
   * Get the singleton instance of SkillManager
   */
  public static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager();
    }
    return SkillManager.instance;
  }

  /**
   * Initialize the skill manager - load global config
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const loaded = JSON.parse(configData) as Partial<SkillsConfig>;
      this.config = {
        marketplaces: loaded.marketplaces || [DEFAULT_MARKETPLACE],
        enabled: loaded.enabled ?? true,
      };
    } catch {
      // Config doesn't exist yet, use defaults
      await this.saveConfig();
    }

    this.initialized = true;
  }

  /**
   * Save configuration to disk
   */
  private async saveConfig(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * Get all registered marketplaces (including built-in)
   */
  getMarketplaces(): SkillMarketplace[] {
    // Always include built-in marketplace first
    return [BUILTIN_MARKETPLACE, ...this.config.marketplaces];
  }

  /**
   * Add a new marketplace
   */
  async addMarketplace(marketplace: SkillMarketplace): Promise<void> {
    const existing = this.config.marketplaces.find((m) => m.id === marketplace.id);
    if (!existing) {
      this.config.marketplaces.push(marketplace);
      await this.saveConfig();
    }
  }

  /**
   * Remove a marketplace
   */
  async removeMarketplace(marketplaceId: string): Promise<void> {
    this.config.marketplaces = this.config.marketplaces.filter((m) => m.id !== marketplaceId);
    await this.saveConfig();
  }

  /**
   * Fetch available skills from built-in marketplace (local files)
   */
  private async fetchBuiltinSkills(cwd?: string): Promise<AvailableSkill[]> {
    const builtinDir = getBuiltinSkillsPath();
    const skills: AvailableSkill[] = [];

    try {
      const entries = await fs.readdir(builtinDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(builtinDir, entry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');

          try {
            const content = await fs.readFile(skillMdPath, 'utf-8');
            const metadata = parseSkillFrontmatter(content);

            // Check if installed in the given cwd
            const installed = cwd ? await this.isSkillInstalled(cwd, entry.name) : false;

            skills.push({
              metadata,
              marketplace: BUILTIN_MARKETPLACE_ID,
              path: entry.name,  // Just the directory name for builtin
              installed,
            });
          } catch {
            // Skip invalid skills
          }
        }
      }
    } catch {
      // Built-in skills directory doesn't exist
    }

    return skills;
  }

  /**
   * Fetch available skills from a marketplace
   * @param marketplaceId - The marketplace ID to fetch from
   * @param cwd - Optional cwd to check installed status
   */
  async fetchMarketplaceSkills(marketplaceId: string, cwd?: string): Promise<AvailableSkill[]> {
    // Handle built-in marketplace specially
    if (marketplaceId === BUILTIN_MARKETPLACE_ID) {
      return this.fetchBuiltinSkills(cwd);
    }

    const marketplace = this.config.marketplaces.find((m) => m.id === marketplaceId);
    if (!marketplace) {
      throw new Error(`Marketplace not found: ${marketplaceId}`);
    }

    const apiUrl = `https://api.github.com/repos/${marketplace.owner}/${marketplace.repo}/contents/${marketplace.skillsPath}?ref=${marketplace.branch}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Pilot-Skills',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch marketplace: ${response.statusText}`);
    }

    const contents = (await response.json()) as GitHubContent[];
    const skills: AvailableSkill[] = [];

    // Filter directories (each is a skill)
    const skillDirs = contents.filter((item) => item.type === 'dir');

    for (const dir of skillDirs) {
      try {
        // Fetch SKILL.md for this skill
        const skillMdUrl = `https://raw.githubusercontent.com/${marketplace.owner}/${marketplace.repo}/${marketplace.branch}/${dir.path}/SKILL.md`;
        const skillResponse = await fetch(skillMdUrl);

        if (skillResponse.ok) {
          const skillContent = await skillResponse.text();
          const metadata = parseSkillFrontmatter(skillContent);

          // Check if installed in the given cwd
          const installed = cwd ? await this.isSkillInstalled(cwd, dir.name) : false;

          skills.push({
            metadata,
            marketplace: marketplaceId,
            path: dir.path,
            installed,
          });
        }
      } catch {
        // Skip skills that can't be parsed
        console.warn(`Failed to parse skill: ${dir.name}`);
      }
    }

    // Update last fetched timestamp
    marketplace.lastFetched = Date.now();
    await this.saveConfig();

    return skills;
  }

  /**
   * Get installed skills for a specific cwd
   */
  async getInstalledSkills(cwd: string): Promise<InstalledSkillInfo[]> {
    const skillsDir = path.join(cwd, '.claude', 'skills');
    const installed: InstalledSkillInfo[] = [];

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(skillsDir, entry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');

          try {
            const content = await fs.readFile(skillMdPath, 'utf-8');
            const metadata = parseSkillFrontmatter(content);

            installed.push({
              name: entry.name,
              metadata,
              path: skillPath,
            });
          } catch {
            // Skip invalid skills
          }
        }
      }
    } catch {
      // Skills directory doesn't exist
    }

    return installed;
  }

  /**
   * Check if a skill is installed in the given cwd
   */
  async isSkillInstalled(cwd: string, skillName: string): Promise<boolean> {
    const skillPath = path.join(cwd, '.claude', 'skills', skillName, 'SKILL.md');
    try {
      await fs.access(skillPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Recursively fetch all files in a GitHub directory
   */
  private async fetchGitHubDirectory(
    owner: string,
    repo: string,
    branch: string,
    dirPath: string
  ): Promise<Array<{ path: string; downloadUrl: string }>> {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Pilot-Skills',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch directory: ${response.statusText}`);
    }

    const contents = (await response.json()) as GitHubContent[];
    const files: Array<{ path: string; downloadUrl: string }> = [];

    for (const item of contents) {
      if (item.type === 'file' && item.download_url) {
        files.push({
          path: item.path,
          downloadUrl: item.download_url,
        });
      } else if (item.type === 'dir') {
        // Recursively fetch subdirectory
        const subFiles = await this.fetchGitHubDirectory(owner, repo, branch, item.path);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Install a skill from built-in marketplace (copy local files)
   */
  private async installAgentSkill(skillPath: string, cwd: string): Promise<InstalledSkillInfo> {
    const skillName = path.basename(skillPath);
    const sourceDir = skillPath;
    const targetDir = path.join(cwd, '.claude', 'skills', skillName);

    // Check source exists
    if (!existsSync(sourceDir)) {
      throw new Error(`Built-in skill not found: ${skillName}`);
    }

    // Check if already installed
    if (await this.isSkillInstalled(cwd, skillName)) {
      throw new Error(`Skill already installed: ${skillName}`);
    }

    // Copy skill directory recursively
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    cpSync(sourceDir, targetDir, { recursive: true });

    // Read metadata
    const skillMdPath = path.join(targetDir, 'SKILL.md');
    const content = await fs.readFile(skillMdPath, 'utf-8');
    const metadata = parseSkillFrontmatter(content);

    return {
      name: skillName,
      metadata,
      path: targetDir,
    };
  }

  /**
   * Install a skill from a marketplace to the session's cwd
   * Downloads the entire skill directory recursively (or copies for built-in)
   */
  async installSkill(
    marketplaceId: string,
    skillPath: string,
    cwd: string
  ): Promise<InstalledSkillInfo> {
    // Handle built-in marketplace specially
    if (marketplaceId === BUILTIN_MARKETPLACE_ID) {
      return this.installAgentSkill(skillPath, cwd);
    }

    const marketplace = this.config.marketplaces.find((m) => m.id === marketplaceId);
    if (!marketplace) {
      throw new Error(`Marketplace not found: ${marketplaceId}`);
    }

    // Get skill name from path (last segment)
    const skillName = skillPath.split('/').pop()!;

    // Check if already installed
    if (await this.isSkillInstalled(cwd, skillName)) {
      throw new Error(`Skill already installed: ${skillName}`);
    }

    // Fetch all files in the skill directory
    const files = await this.fetchGitHubDirectory(
      marketplace.owner,
      marketplace.repo,
      marketplace.branch,
      skillPath
    );

    if (files.length === 0) {
      throw new Error(`Skill has no files: ${skillName}`);
    }

    // Determine the base path to strip from file paths
    const basePath = skillPath;

    // Create skills directory
    const targetDir = path.join(cwd, '.claude', 'skills', skillName);
    await fs.mkdir(targetDir, { recursive: true });

    // Download all files
    let metadata: SkillMetadata | null = null;

    for (const file of files) {
      // Calculate relative path within skill directory
      const relativePath = file.path.substring(basePath.length + 1); // +1 for the trailing slash
      const targetPath = path.join(targetDir, relativePath);

      // Create parent directory if needed
      const parentDir = path.dirname(targetPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Download file
      const fileResponse = await fetch(file.downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${file.path}`);
      }

      const content = await fileResponse.text();
      await fs.writeFile(targetPath, content, 'utf-8');

      // Parse SKILL.md to get metadata
      if (relativePath === 'SKILL.md') {
        metadata = parseSkillFrontmatter(content);
      }
    }

    if (!metadata) {
      // Clean up on failure
      await fs.rm(targetDir, { recursive: true, force: true });
      throw new Error(`Skill missing SKILL.md: ${skillName}`);
    }

    return {
      name: skillName,
      metadata,
      path: targetDir,
    };
  }

  /**
   * Uninstall a skill from the session's cwd
   */
  async uninstallSkill(cwd: string, skillName: string): Promise<void> {
    const skillDir = path.join(cwd, '.claude', 'skills', skillName);

    try {
      await fs.rm(skillDir, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to uninstall skill: ${skillName}`);
    }
  }

  /**
   * Enable or disable skills globally
   */
  async setGlobalEnabled(enabled: boolean): Promise<void> {
    this.config.enabled = enabled;
    await this.saveConfig();
  }

  /**
   * Get global enabled state
   */
  isGlobalEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Install skills for an agent to the session's cwd
   * Skips skills that are already installed
   */
  async installSkillsForAgent(agentId: string, cwd: string): Promise<InstalledSkillInfo[]> {
    const agentDef = await getAgentDefinition(agentId);
    const defaultSkills = agentDef.defaultSkills;
    const installed: InstalledSkillInfo[] = [];

    for (const skillPath of defaultSkills) {
      const skillName = path.basename(skillPath);
      try {
        // Skip if already installed
        if (await this.isSkillInstalled(cwd, skillName)) {
          continue;
        }

        // Install from built-in marketplace
        const skillInfo = await this.installAgentSkill(skillPath, cwd);
        installed.push(skillInfo);
      } catch (error) {
        // Log but don't fail - continue with other skills
        console.warn(`Failed to install default skill ${skillName}:`, error);
      }
    }

    return installed;
  }
}