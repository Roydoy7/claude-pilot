/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Consistency audit: every mcp__<server>__<tool> name referenced in any
 * agent's tools.md must resolve to a registered MCP server, and for
 * in-process (sdk) servers the tool itself must actually exist.
 *
 * Motivation: tools.md files silently rotted (mcp__python__python vs the
 * real mcp__python__run) because nothing validated the names.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MCP_SERVER_REGISTRY } from './mcp-server-registry.js';

const AGENT_DEFS_DIR = path.resolve(__dirname, '..', 'agent-defs');

async function listAgentIds(): Promise<string[]> {
  const entries = await fs.readdir(AGENT_DEFS_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function readMcpToolNames(agentId: string): Promise<string[]> {
  const content = await fs.readFile(path.join(AGENT_DEFS_DIR, agentId, 'tools.md'), 'utf-8');
  const names = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('mcp__'));
  return [...new Set(names)];
}

/**
 * List the real tool names of an in-process sdk server by connecting an
 * MCP client over an in-memory transport pair (public API only).
 */
const serverToolsCache = new Map<string, Promise<string[]>>();

function listSdkServerTools(serverKey: string, instance: { connect(transport: never): Promise<void> }): Promise<string[]> {
  const cached = serverToolsCache.get(serverKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    // The agent-sdk bundles its own copy of the MCP SDK; Transport is a
    // structural interface so the linked pair works across copies.
    await instance.connect(serverTransport as never);
    const client = new Client({ name: 'tools-md-audit', version: '0.0.1' });
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      return tools.map((tool) => tool.name);
    } finally {
      await client.close();
    }
  })();

  serverToolsCache.set(serverKey, promise);
  return promise;
}

describe('tools.md MCP tool name consistency', () => {
  it('every referenced mcp tool resolves to a registered server and a real tool', async () => {
    const agentIds = await listAgentIds();
    expect(agentIds.length).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const agentId of agentIds) {
      const toolNames = await readMcpToolNames(agentId);

      for (const toolName of toolNames) {
        const parts = toolName.split('__');
        if (parts.length < 3 || parts[0] !== 'mcp') {
          failures.push(`${agentId}: malformed tool name '${toolName}'`);
          continue;
        }

        const serverKey = parts[1];
        const toolPart = parts.slice(2).join('__');
        const serverConfig = MCP_SERVER_REGISTRY[serverKey];

        if (!serverConfig) {
          failures.push(`${agentId}: unknown MCP server '${serverKey}' in '${toolName}'`);
          continue;
        }

        // Tool-level validation is only possible for in-process sdk servers;
        // stdio servers (e.g. chromedevtools) expose tools in a child process.
        if (serverConfig.type === 'sdk') {
          const actualTools = await listSdkServerTools(serverKey, serverConfig.instance);
          if (!actualTools.includes(toolPart)) {
            failures.push(
              `${agentId}: tool '${toolPart}' does not exist on server '${serverKey}' (has: ${actualTools.join(', ')})`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
