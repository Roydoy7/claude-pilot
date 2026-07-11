/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for local-tools: building a per-agent in-process MCP server from the
 * scripts in agent-defs/<id>/tools/, exercised end-to-end over an in-memory
 * MCP transport (same technique as tools-md-consistency.test.ts).
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadLocalToolsServer } from './local-tools.js';

const AGENT_ID = 'local-tools-test-fixture';
let agentDir: string;

const ECHO_PY = `# ---
# description: Echo the arguments back as JSON.
# safe: true
# args:
#   query: string (required) - The query to echo
#   count: int (default 2, min 1, max 5) - Repeat count
# ---
import sys, json
args = json.load(sys.stdin)
print(json.dumps({"echo": args}))
`;

const DANGER_PY = `# ---
# description: A tool that is not auto-approved.
# safe: false
# ---
print("{}")
`;

async function writeFixtureAgent(dir: string): Promise<void> {
  const toolsDir = path.join(dir, 'tools');
  await fs.promises.mkdir(toolsDir, { recursive: true });
  await fs.promises.writeFile(path.join(toolsDir, 'echo_query.py'), ECHO_PY, 'utf-8');
  await fs.promises.writeFile(path.join(toolsDir, 'danger_op.py'), DANGER_PY, 'utf-8');
  await fs.promises.writeFile(path.join(toolsDir, '_helper.py'), 'HELPER = 1\n', 'utf-8');
}

beforeAll(async () => {
  agentDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-'));
  await writeFixtureAgent(agentDir);
});

afterAll(async () => {
  await fs.promises.rm(agentDir, { recursive: true, force: true });
});

describe('loadLocalToolsServer', () => {
  it('returns no server when the agent has no tools directory', async () => {
    const emptyAgentDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-'));
    try {
      const result = await loadLocalToolsServer(emptyAgentDir, AGENT_ID);
      expect(result.server).toBeNull();
      expect(result.safeToolNames).toEqual([]);
    } finally {
      await fs.promises.rm(emptyAgentDir, { recursive: true, force: true });
    }
  });

  it('builds a server exposing the tool scripts, skipping _ helpers', async () => {
    const { server, safeToolNames } = await loadLocalToolsServer(agentDir, AGENT_ID);
    expect(server).not.toBeNull();
    expect(server?.name).toBe('local');
    expect(safeToolNames).toEqual(['mcp__local__echo_query']);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server?.instance.connect(serverTransport as never);
    const client = new Client({ name: 'local-tools-test', version: '0.0.1' });
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(['danger_op', 'echo_query']);

      const echo = tools.find((t) => t.name === 'echo_query');
      expect(echo?.description).toBe('Echo the arguments back as JSON.');
      const properties = (echo?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(properties).sort()).toEqual(['count', 'query']);

      const result = await client.callTool({ name: 'echo_query', arguments: { query: 'Toyota' } });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(result.isError ?? false).toBe(false);
      expect(JSON.parse(content[0]?.text ?? '')).toEqual({ echo: { query: 'Toyota', count: 2 } });
    } finally {
      await client.close();
    }
  }, 30000);

  it('throws on an empty tools directory', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-'));
    try {
      await fs.promises.mkdir(path.join(dir, 'tools'));
      await expect(loadLocalToolsServer(dir, AGENT_ID)).rejects.toThrow(/Empty tools directory/);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when a .py and a .ts tool share the same base name', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-'));
    try {
      const toolsDir = path.join(dir, 'tools');
      await fs.promises.mkdir(toolsDir);
      await fs.promises.writeFile(path.join(toolsDir, 'dup_tool.py'), ECHO_PY, 'utf-8');
      await fs.promises.writeFile(path.join(toolsDir, 'dup_tool.ts'), '// ---\n// description: x\n// safe: true\n// ---\n', 'utf-8');
      await expect(loadLocalToolsServer(dir, AGENT_ID)).rejects.toThrow(/Duplicate local tool name "dup_tool"/);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on a non-script file without underscore prefix', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-'));
    try {
      const toolsDir = path.join(dir, 'tools');
      await fs.promises.mkdir(toolsDir);
      await fs.promises.writeFile(path.join(toolsDir, 'notes.md'), 'not a tool', 'utf-8');
      await expect(loadLocalToolsServer(dir, AGENT_ID)).rejects.toThrow(/Unsupported tool script extension/);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a failing script as isError with details', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-'));
    try {
      const toolsDir = path.join(dir, 'tools');
      await fs.promises.mkdir(toolsDir);
      await fs.promises.writeFile(
        path.join(toolsDir, 'boom.py'),
        '# ---\n# description: Always fails\n# safe: true\n# ---\nimport sys\nprint("kaboom", file=sys.stderr)\nsys.exit(3)\n',
        'utf-8',
      );
      const { server } = await loadLocalToolsServer(dir, AGENT_ID);

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server?.instance.connect(serverTransport as never);
      const client = new Client({ name: 'local-tools-test', version: '0.0.1' });
      await client.connect(clientTransport);
      try {
        const result = await client.callTool({ name: 'boom', arguments: {} });
        const content = result.content as Array<{ type: string; text: string }>;
        expect(result.isError).toBe(true);
        expect(content[0]?.text).toContain('exited with code 3');
        expect(content[0]?.text).toContain('kaboom');
      } finally {
        await client.close();
      }
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
