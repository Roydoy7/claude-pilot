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
 * - skills/<name>/  : default built-in skills copied to {cwd}/.claude/skills/
 * - agents/*.md     : Claude subagent definitions installed to {cwd}/.claude/agents/
 *
 * Agent ids are simply the folder names under agent-defs - there is no
 * hardcoded list of agents anywhere else in the codebase.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { app } from 'electron';
import * as yaml from 'js-yaml';
import type { AgentDefinition as SdkAgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { MCP_SERVER_REGISTRY, type McpServer } from './mcp-server-registry.js';
import { loadLocalToolsServer } from './local-tools.js';
import { getErrorMessage } from '../errors.js';

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
  /** Absolute paths to this agent's default Claude subagent definitions */
  defaultSubagents: string[];
  /** Parsed subagent definitions keyed by name, passed to SDK `agents` option */
  subagentDefs: Record<string, SdkAgentDefinition>;
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
    if (serverKey === 'local') {
      throw new Error(
        `Server key 'local' is reserved for agent-local tools (agent-defs/<id>/tools/) and must not appear in tools.md: ${toolName}`,
      );
    }
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
 * Parse a Claude subagent .md file (`agents/<name>.md`) into an SDK
 * AgentDefinition. Bad frontmatter (missing `name:`/`description:`, invalid
 * YAML, or a `name:` that doesn't match the file name) throws so the caller
 * surfaces it as a load error instead of the SDK silently ignoring the file.
 */
function parseSubagentDefinition(content: string, filePath: string): { name: string; definition: SdkAgentDefinition } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing frontmatter block in subagent file ${filePath}`);
  }

  const [, frontmatterText, body] = match;
  let frontmatter: unknown;
  try {
    frontmatter = yaml.load(frontmatterText);
  } catch (err) {
    throw new Error(`Invalid YAML frontmatter in subagent file ${filePath}: ${getErrorMessage(err)}`);
  }

  if (typeof frontmatter !== 'object' || frontmatter === null) {
    throw new Error(`Frontmatter in subagent file ${filePath} must be a YAML mapping`);
  }

  const fm = frontmatter as Record<string, unknown>;
  const name = fm.name;
  const description = fm.description;

  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`Subagent file ${filePath} is missing required frontmatter field "name"`);
  }
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error(`Subagent file ${filePath} is missing required frontmatter field "description"`);
  }

  const expectedName = path.basename(filePath, '.md');
  if (name !== expectedName) {
    throw new Error(
      `Subagent file ${filePath} has name "${name}" which does not match its file name "${expectedName}.md"`,
    );
  }

  const prompt = body.trim();
  if (!prompt) {
    throw new Error(`Subagent file ${filePath} has an empty prompt body`);
  }

  const definition: SdkAgentDefinition = { description, prompt };

  if (typeof fm.tools === 'string') {
    definition.tools = fm.tools.split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (typeof fm.model === 'string' && fm.model !== 'inherit') {
    definition.model = fm.model;
  }
  if (typeof fm.maxTurns === 'number') {
    definition.maxTurns = fm.maxTurns;
  }
  if (Array.isArray(fm.skills)) {
    definition.skills = fm.skills.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(fm.disallowedTools)) {
    definition.disallowedTools = fm.disallowedTools.filter((s): s is string => typeof s === 'string');
  }
  if (typeof fm.permissionMode === 'string') {
    definition.permissionMode = fm.permissionMode as SdkAgentDefinition['permissionMode'];
  }
  if (typeof fm.effort === 'string') {
    definition.effort = fm.effort as SdkAgentDefinition['effort'];
  }
  if (typeof fm.background === 'boolean') {
    definition.background = fm.background;
  }

  return { name, definition };
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

  const subagentsDir = path.join(dir, 'agents');
  const subagentDirents = await fs.readdir(subagentsDir, { withFileTypes: true }).catch(() => []);
  const defaultSubagents = subagentDirents
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(subagentsDir, entry.name));

  const subagentDefs: Record<string, SdkAgentDefinition> = {};
  for (const subagentPath of defaultSubagents) {
    const subagentContent = await fs.readFile(subagentPath, 'utf-8');
    const { name, definition } = parseSubagentDefinition(subagentContent, subagentPath);
    subagentDefs[name] = definition;
  }

  const mcpServers = resolveMcpServers(mcpTools);
  const localTools = await loadLocalToolsServer(dir, id);
  if (localTools.server) {
    mcpServers['local'] = localTools.server;
  }

  return {
    id,
    displayName,
    description,
    systemPrompt: systemPrompt.trim(),
    prompts: promptsContent.split('\n').map((line) => line.trim()).filter((line): line is string => !!line),
    tools,
    safeTools,
    mcpServers,
    autoApprovedMcpTools: [...safeMcpTools, ...localTools.safeToolNames],
    defaultSkills,
    defaultSubagents,
    subagentDefs,
  };
}

/**
 * A single agent definition that failed to load (bad tool frontmatter,
 * missing files, invalid tools.md, ...). The agent is excluded from the
 * usable definitions; the error is surfaced to the UI instead of crashing
 * the whole agent list.
 */
export interface AgentLoadError {
  id: string;
  error: string;
}

interface AgentDefsLoadResult {
  definitions: AgentDefinition[];
  loadErrors: AgentLoadError[];
}

/**
 * Load every agent folder under agentDefsPath. A failure in one agent is
 * isolated: it becomes an AgentLoadError instead of rejecting the whole
 * load, so one broken agent cannot take down the others.
 */
export async function loadAgentDefinitionsFrom(agentDefsPath: string): Promise<AgentDefsLoadResult> {
  const dirents = await fs.readdir(agentDefsPath, { withFileTypes: true });
  const agentIds = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const definitions: AgentDefinition[] = [];
  const loadErrors: AgentLoadError[] = [];
  for (const id of agentIds) {
    try {
      definitions.push(await loadAgentDefinition(agentDefsPath, id));
    } catch (err) {
      const error = getErrorMessage(err);
      console.error(`[agent-loader] failed to load agent "${id}": ${error}`);
      loadErrors.push({ id, error });
    }
  }

  return { definitions, loadErrors };
}

let cachedLoad: AgentDefsLoadResult | null = null;
let devWatcherStarted = false;

/**
 * Dev-mode hot reload: watch agent-defs and drop the definitions cache on any
 * change, so the next new session picks up edited definitions and tool
 * frontmatter. Only runs in a non-packaged Electron process - never in
 * production and never under plain node (tests).
 */
function startDevWatcher(agentDefsPath: string): void {
  if (devWatcherStarted) {
    return;
  }
  devWatcherStarted = true;
  if (app?.isPackaged || !process.versions.electron) {
    return;
  }
  import('chokidar')
    .then(({ watch }) => {
      watch(agentDefsPath, { ignoreInitial: true }).on('all', () => {
        cachedLoad = null;
      });
    })
    .catch((err: unknown) => {
      console.error('[agent-loader] failed to start dev agent-defs watcher:', err);
    });
}

/**
 * Load all agent definitions from agent-defs (cached after first call).
 * Agents that fail to load are excluded; see getAgentLoadErrors().
 */
export async function getAgentDefinitions(): Promise<AgentDefinition[]> {
  if (cachedLoad) {
    return cachedLoad.definitions;
  }

  const agentDefsPath = getAgentDefsPath();
  startDevWatcher(agentDefsPath);
  cachedLoad = await loadAgentDefinitionsFrom(agentDefsPath);
  return cachedLoad.definitions;
}

/**
 * Errors from agent definitions that failed to load in the last
 * getAgentDefinitions() run (triggers a load if none happened yet).
 */
export async function getAgentLoadErrors(): Promise<AgentLoadError[]> {
  await getAgentDefinitions();
  if (!cachedLoad) {
    throw new Error('Agent definitions load did not populate the cache');
  }
  return cachedLoad.loadErrors;
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
