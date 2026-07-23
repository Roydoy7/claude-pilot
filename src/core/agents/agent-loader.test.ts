/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for agent-loader: loading file-based agent definitions from agent-defs/
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect } from 'vitest';
import { getAgentDefinitions, getAgentDefinition, loadAgentDefinitionsFrom } from './agent-loader.js';

describe('getAgentDefinitions', () => {
  it('loads at least one agent definition', async () => {
    const definitions = await getAgentDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    const first = definitions[0]!;
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.displayName.length).toBeGreaterThan(0);
    expect(first.systemPrompt.length).toBeGreaterThan(0);
  });
});

describe('loadAgentDefinitionsFrom', () => {
  async function writeAgentFolder(agentDefsPath: string, id: string): Promise<string> {
    const dir = path.join(agentDefsPath, id);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'description.md'), `${id} display name\nA test agent.\n`, 'utf-8');
    await fs.promises.writeFile(path.join(dir, 'system-prompt.md'), 'You are a test agent.\n', 'utf-8');
    await fs.promises.writeFile(path.join(dir, 'tools.md'), '#TOOLS\nRead\n#SAFE-TOOLS\nRead\n', 'utf-8');
    await fs.promises.writeFile(path.join(dir, 'prompts.md'), 'Do something\n', 'utf-8');
    return dir;
  }

  it('isolates a broken agent instead of failing the whole load', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeAgentFolder(agentDefsPath, 'good-agent');
      const brokenDir = await writeAgentFolder(agentDefsPath, 'broken-agent');
      const toolsDir = path.join(brokenDir, 'tools');
      await fs.promises.mkdir(toolsDir);
      // Invalid frontmatter: missing the required safe declaration
      await fs.promises.writeFile(path.join(toolsDir, 'bad_tool.ts'), '// ---\n// description: x\n// ---\n', 'utf-8');

      const { definitions, loadErrors } = await loadAgentDefinitionsFrom(agentDefsPath);

      expect(definitions.map((d) => d.id)).toEqual(['good-agent']);
      expect(loadErrors).toHaveLength(1);
      expect(loadErrors[0]?.id).toBe('broken-agent');
      expect(loadErrors[0]?.error).toContain('Missing safe declaration');
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('isolates an agent with missing definition files', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeAgentFolder(agentDefsPath, 'good-agent');
      await fs.promises.mkdir(path.join(agentDefsPath, 'empty-agent'));

      const { definitions, loadErrors } = await loadAgentDefinitionsFrom(agentDefsPath);

      expect(definitions.map((d) => d.id)).toEqual(['good-agent']);
      expect(loadErrors).toHaveLength(1);
      expect(loadErrors[0]?.id).toBe('empty-agent');
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  async function writeSubagentFile(agentDefsPath: string, agentId: string, fileName: string, content: string): Promise<void> {
    const dir = await writeAgentFolder(agentDefsPath, agentId);
    const agentsDir = path.join(dir, 'agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await fs.promises.writeFile(path.join(agentsDir, fileName), content, 'utf-8');
  }

  it('loads a well-formed subagent file into subagentDefs', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeSubagentFile(
        agentDefsPath,
        'good-agent',
        'my-reviewer.md',
        '---\nname: my-reviewer\ndescription: Reviews things.\ntools: Read, Grep\nmaxTurns: 5\n---\n\nYou are a reviewer.\n',
      );

      const { definitions, loadErrors } = await loadAgentDefinitionsFrom(agentDefsPath);

      expect(loadErrors).toEqual([]);
      const def = definitions.find((d) => d.id === 'good-agent');
      expect(def?.subagentDefs['my-reviewer']).toEqual({
        description: 'Reviews things.',
        prompt: 'You are a reviewer.',
        tools: ['Read', 'Grep'],
        maxTurns: 5,
      });
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it.each([
    ['missing name', '---\ndescription: Reviews things.\n---\n\nBody.\n', 'name'],
    ['missing description', '---\nname: my-reviewer\n---\n\nBody.\n', 'description'],
    ['invalid YAML', '---\nname: [unterminated\n---\n\nBody.\n', 'YAML'],
    ['name mismatch with file name', '---\nname: other-name\ndescription: x\n---\n\nBody.\n', 'does not match'],
  ])('rejects a subagent file with %s', async (_label, content, expectedMessageFragment) => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeSubagentFile(agentDefsPath, 'bad-agent', 'my-reviewer.md', content);

      const { definitions, loadErrors } = await loadAgentDefinitionsFrom(agentDefsPath);

      expect(definitions.find((d) => d.id === 'bad-agent')).toBeUndefined();
      expect(loadErrors).toHaveLength(1);
      expect(loadErrors[0]?.id).toBe('bad-agent');
      expect(loadErrors[0]?.error).toContain('my-reviewer.md');
      expect(loadErrors[0]?.error).toContain(expectedMessageFragment);
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('has an empty subagentDefs when there is no agents/ directory', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeAgentFolder(agentDefsPath, 'plain-agent');

      const { definitions, loadErrors } = await loadAgentDefinitionsFrom(agentDefsPath);

      expect(loadErrors).toEqual([]);
      expect(definitions.find((d) => d.id === 'plain-agent')?.subagentDefs).toEqual({});
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('expands SDK_TOOLS and SAFE_TOOLS macros', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      const dir = await writeAgentFolder(agentDefsPath, 'macro-agent');
      await fs.promises.writeFile(
        path.join(dir, 'tools.md'),
        '#TOOLS\nSDK_TOOLS\n#SAFE-TOOLS\nSAFE_TOOLS\n',
        'utf-8',
      );

      const { definitions } = await loadAgentDefinitionsFrom(agentDefsPath);
      const def = definitions.find((d) => d.id === 'macro-agent')!;

      expect(def.tools).toContain('Read');
      expect(def.tools).toContain('Write');
      expect(def.tools).toContain('Bash');
      expect(def.safeTools).toContain('Read');
      expect(def.safeTools).not.toContain('Write');
      expect(def.safeTools).not.toContain('Bash');
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('resolves MCP servers from #MCP-TOOLS and marks safe ones as auto-approved', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      const dir = await writeAgentFolder(agentDefsPath, 'mcp-agent');
      await fs.promises.writeFile(
        path.join(dir, 'tools.md'),
        '#TOOLS\nRead\n#SAFE-TOOLS\nRead\n#MCP-TOOLS\nmcp__convert__convert\n#SAFE-MCP-TOOLS\nmcp__convert__convert\n',
        'utf-8',
      );

      const { definitions } = await loadAgentDefinitionsFrom(agentDefsPath);
      const def = definitions.find((d) => d.id === 'mcp-agent')!;

      expect(Object.keys(def.mcpServers)).toContain('convert');
      expect(def.autoApprovedMcpTools).toContain('mcp__convert__convert');
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('loads default skills from skills/ subdirectory', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      const dir = await writeAgentFolder(agentDefsPath, 'skilled-agent');
      await fs.promises.mkdir(path.join(dir, 'skills', 'skill-a'), { recursive: true });
      await fs.promises.mkdir(path.join(dir, 'skills', 'skill-b'), { recursive: true });

      const { definitions } = await loadAgentDefinitionsFrom(agentDefsPath);
      const def = definitions.find((d) => d.id === 'skilled-agent')!;

      expect(def.defaultSkills.map((p) => path.basename(p)).sort()).toEqual(['skill-a', 'skill-b']);
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('registers a local MCP server for agents with a tools/ directory', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      const dir = await writeAgentFolder(agentDefsPath, 'tool-agent');
      const toolsDir = path.join(dir, 'tools');
      await fs.promises.mkdir(toolsDir);
      await fs.promises.writeFile(
        path.join(toolsDir, 'my_tool.py'),
        '# ---\n# description: A test tool.\n# safe: true\n# ---\nimport sys, json\nprint(json.dumps({}))\n',
        'utf-8',
      );

      const { definitions } = await loadAgentDefinitionsFrom(agentDefsPath);
      const def = definitions.find((d) => d.id === 'tool-agent')!;

      expect(Object.keys(def.mcpServers)).toContain('local');
      expect(def.mcpServers['local']?.name).toBe('local');
      expect(def.autoApprovedMcpTools).toContain('mcp__local__my_tool');
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('does not register a local server for agents without a tools/ directory', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeAgentFolder(agentDefsPath, 'no-tools-agent');

      const { definitions } = await loadAgentDefinitionsFrom(agentDefsPath);
      const def = definitions.find((d) => d.id === 'no-tools-agent')!;

      expect(def.mcpServers['local']).toBeUndefined();
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });

  it('lists subagent files from agents/ directory', async () => {
    const agentDefsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-agent-defs-'));
    try {
      await writeSubagentFile(
        agentDefsPath,
        'host-agent',
        'sub-worker.md',
        '---\nname: sub-worker\ndescription: Does work.\ntools: Read\n---\n\nYou are a worker.\n',
      );

      const { definitions } = await loadAgentDefinitionsFrom(agentDefsPath);
      const def = definitions.find((d) => d.id === 'host-agent')!;

      expect(def.defaultSubagents.map((p) => path.basename(p))).toEqual(['sub-worker.md']);
      expect(def.subagentDefs['sub-worker']).toBeDefined();
    } finally {
      await fs.promises.rm(agentDefsPath, { recursive: true, force: true });
    }
  });
});

describe('getAgentDefinition', () => {
  it('throws for an unknown agent id', async () => {
    await expect(getAgentDefinition('not-exist')).rejects.toThrow(
      'Agent definition not found: not-exist',
    );
  });
});
