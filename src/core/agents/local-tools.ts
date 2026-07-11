/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Local Tools Loader - turns the scripts in agent-defs/<id>/tools/ into an
 * in-process MCP server for that agent.
 *
 * Each non-underscore .py/.ts file in tools/ is one tool: file name = tool
 * name, extension = runtime, metadata in the frontmatter comment block (see
 * tool-frontmatter.ts). Files starting with `_` are shared helpers. Presence
 * in the folder IS the registration - tools.md is not involved, and the
 * server key `local` is reserved for this mechanism.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { tool, createSdkMcpServer, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { parseToolFileName, parseToolFrontmatter, buildZodShape } from './tool-frontmatter.js';
import { runToolScript } from '../tools/script-runner.js';
import { getErrorMessage } from '../errors.js';
import type { McpServer } from './mcp-server-registry.js';

export interface LocalToolsResult {
  /** In-process MCP server exposing the agent's local tools, or null if the agent has no tools/ directory */
  server: McpServer | null;
  /** Full tool names (mcp__local__<name>) of tools declared safe: true */
  safeToolNames: string[];
}

export async function loadLocalToolsServer(agentDir: string, agentId: string): Promise<LocalToolsResult> {
  const toolsDir = path.join(agentDir, 'tools');
  if (!existsSync(toolsDir)) {
    return { server: null, safeToolNames: [] };
  }

  const dirents = await fs.readdir(toolsDir, { withFileTypes: true });
  const scriptFiles = dirents
    .filter((entry) => entry.isFile() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();

  const tools: SdkMcpToolDefinition[] = [];
  const safeToolNames: string[] = [];
  const seenNames = new Set<string>();

  for (const fileName of scriptFiles) {
    const { name, runtime } = parseToolFileName(fileName);
    if (seenNames.has(name)) {
      throw new Error(`Duplicate local tool name "${name}" in ${toolsDir} (a .py and a .ts file share the same base name)`);
    }
    seenNames.add(name);

    const scriptPath = path.join(toolsDir, fileName);
    const content = await fs.readFile(scriptPath, 'utf-8');
    const frontmatter = parseToolFrontmatter(content, scriptPath);

    if (frontmatter.safe) {
      safeToolNames.push(`mcp__local__${name}`);
    }

    tools.push(
      tool(name, frontmatter.description, buildZodShape(frontmatter.args), async (args): Promise<CallToolResult> => {
        try {
          const result = await runToolScript({
            runtime,
            scriptPath,
            toolsDir,
            agentId,
            argsJson: JSON.stringify(args),
            timeout: frontmatter.timeout,
            requirements: frontmatter.requirements,
          });
          if (result.exitCode === 0 && !result.timedOut) {
            return { content: [{ type: 'text', text: result.stdout }] };
          }
          const failure = result.timedOut
            ? `Tool "${name}" timed out after ${frontmatter.timeout}ms`
            : `Tool "${name}" exited with code ${result.exitCode}`;
          const details = [failure, result.stdout, result.stderr].filter((part) => part !== '').join('\n');
          return { content: [{ type: 'text', text: details }], isError: true };
        } catch (err) {
          console.error(`[local tool error] ${agentId}/${name}: ${getErrorMessage(err)}`);
          return { content: [{ type: 'text', text: `Tool "${name}" failed: ${getErrorMessage(err)}` }], isError: true };
        }
      }),
    );
  }

  if (tools.length === 0) {
    throw new Error(`Empty tools directory (no tool scripts found): ${toolsDir}`);
  }

  return {
    server: createSdkMcpServer({ name: 'local', version: '1.0.0', tools }),
    safeToolNames,
  };
}
