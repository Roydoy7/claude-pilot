/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Agent Loader - loads agent definitions from src/core/agent-defs/<agentId>/
 *
 * Each agent is a folder containing:
 * - description.md  : first line = display name, remaining lines = description
 * - system-prompt.md: full system prompt text
 * - tools.md        : #TOOLS / #SAFE-TOOLS / #MCP-TOOLS / #SAFE-MCP-TOOLS sections,
 *                      one tool name per line. SDK_TOOLS/SAFE_TOOLS are macros that
 *                      expand to the built-in SDK tool sets below.
 * - skills/<name>/  : marker directories naming the agent's default built-in skills
 *                      (skill content lives in src/core/custom-skills/<name>/)
 *
 * Agent ids are simply the folder names under agent-defs - there is no
 * hardcoded list of agents anywhere else in the codebase.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { app } from 'electron';
import { MCP_SERVER_REGISTRY, type McpServer } from './mcp-server-registry.js';

export interface AgentDefinition {
  id: string;
  displayName: string;
  description: string;
  prompts: string []; 
  systemPrompt: string;
  tools: string[];
  safeTools: string[];
  mcpServers: Record<string, McpServer>;
  autoApprovedMcpTools: string[];
  /** Absolute paths to this agent's default skill directories */
  defaultSkills: string[];
}

/**
 * All available Claude SDK built-in tools - expansion of the SDK_TOOLS macro
 */
const SDK_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'Skill',
] as const;

/**
 * Safe read-only tools that don't modify files or execute commands -
 * expansion of the SAFE_TOOLS macro
 */
const SAFE_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'Skill',
] as const;

/**
 * Resolve the agent-defs directory.
 * In a packaged app it's copied to resources/agent-defs (see package.json extraResources).
 * In development it lives at src/core/agent-defs.
 */
function getAgentDefsPath(): string {
  if (app?.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, 'agent-defs');
  }

  const possiblePaths = [
    path.join(__dirname, 'agent-defs'),
    path.join(__dirname, '..', 'agent-defs'),
    path.join(process.cwd(), 'src', 'core', 'agent-defs'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return path.join(process.cwd(), 'src', 'core', 'agent-defs');
}

/**
 * Expand the SDK_TOOLS/SAFE_TOOLS macros within a list of tool names
 */
function expandToolMacros(toolNames: string[]): string[] {
  const tools: string[] = [];
  for (const name of toolNames) {
    if (name === 'SDK_TOOLS') {
      tools.push(...SDK_TOOLS);
    } else if (name === 'SAFE_TOOLS') {
      tools.push(...SAFE_TOOLS);
    } else {
      tools.push(name);
    }
  }
  return tools;
}

/**
 * Parse tools.md into its four sections
 */
function parseToolsMd(content: string): {
  tools: string[];
  safeTools: string[];
  mcpTools: string[];
  safeMcpTools: string[];
} {
  const tools: string[] = [];
  const safeTools: string[] = [];
  const mcpTools: string[] = [];
  const safeMcpTools: string[] = [];

  let current: string[] = tools;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === '#TOOLS') {
      current = tools;
    } else if (line === '#SAFE-TOOLS') {
      current = safeTools;
    } else if (line === '#MCP-TOOLS') {
      current = mcpTools;
    } else if (line === '#SAFE-MCP-TOOLS') {
      current = safeMcpTools;
    } else if (line) {
      current.push(line);
    }
  }

  return {
    tools: expandToolMacros(tools),
    safeTools: expandToolMacros(safeTools),
    mcpTools,
    safeMcpTools,
  };
}

/**
 * Resolve `mcp__<server>__<tool>` names to MCP server instances via the registry
 */
function resolveMcpServers(mcpTools: string[]): Record<string, McpServer> {
  const servers: Record<string, McpServer> = {};

  for (const toolName of mcpTools) {
    const parts = toolName.split('__');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      throw new Error(`Invalid MCP tool name in tools.md: ${toolName}`);
    }

    const serverKey = parts[1];
    if (servers[serverKey]) {
      continue;
    }

    const server = MCP_SERVER_REGISTRY[serverKey];
    if (!server) {
      throw new Error(`Unknown MCP server '${serverKey}' referenced by tool ${toolName}`);
    }

    servers[serverKey] = server;
  }

  return servers;
}

/**
 * Load a single agent definition from its folder
 */
async function loadAgentDefinition(agentDefsPath: string, id: string): Promise<AgentDefinition> {
  const dir = path.join(agentDefsPath, id);

  const [descriptionContent, systemPrompt, toolsContent, promptsContent] = await Promise.all([
    fs.readFile(path.join(dir, 'description.md'), 'utf-8'),
    fs.readFile(path.join(dir, 'system-prompt.md'), 'utf-8'),
    fs.readFile(path.join(dir, 'tools.md'), 'utf-8'),
    fs.readFile(path.join(dir, 'prompts.md'), 'utf-8'),
  ]);

  const descriptionLines = descriptionContent.split('\n');
  const displayName = (descriptionLines[0] ?? '').trim();
  const description = descriptionLines.slice(1).join('\n').trim();

  const { tools, safeTools, mcpTools, safeMcpTools } = parseToolsMd(toolsContent);

  const skillsDir = path.join(dir, 'skills');
  const skillDirents = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const defaultSkills = skillDirents.filter((entry) => entry.isDirectory()).map((entry) => path.join(skillsDir, entry.name));

  return {
    id,
    displayName,
    description,
    systemPrompt: systemPrompt.trim(),
    prompts: promptsContent.split('\n').map((line) => line.trim()).filter((line): line is string => !!line),
    tools,
    safeTools,
    mcpServers: resolveMcpServers(mcpTools),
    autoApprovedMcpTools: safeMcpTools,
    defaultSkills,
  };
}

let cachedDefinitions: AgentDefinition[] | null = null;

/**
 * Load all agent definitions from agent-defs (cached after first call)
 */
export async function getAgentDefinitions(): Promise<AgentDefinition[]> {
  if (cachedDefinitions) {
    return cachedDefinitions;
  }

  const agentDefsPath = getAgentDefsPath();
  const dirents = await fs.readdir(agentDefsPath, { withFileTypes: true });
  const agentIds = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const definitions: AgentDefinition[] = [];
  for (const id of agentIds) {
    definitions.push(await loadAgentDefinition(agentDefsPath, id));
  }

  cachedDefinitions = definitions;
  return definitions;
}

/**
 * Get a single agent definition by id, throws if not found
 */
export async function getAgentDefinition(id: string): Promise<AgentDefinition> {
  const definitions = await getAgentDefinitions();
  const definition = definitions.find((d) => d.id === id);

  if (!definition) {
    throw new Error(`Agent definition not found: ${id}`);
  }

  return definition;
}
