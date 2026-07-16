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
  it('loads the office-assist agent definition', async () => {
    const definitions = await getAgentDefinitions();
    const officeAssist = definitions.find((d) => d.id === 'office-assist');

    expect(officeAssist).toBeDefined();
    expect(officeAssist?.displayName).toBe('Office Assistant');
    expect(officeAssist?.description.length).toBeGreaterThan(0);
    expect(officeAssist?.systemPrompt.length).toBeGreaterThan(0);
  });

  it('expands SDK_TOOLS and SAFE_TOOLS macros', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    expect(officeAssist.tools).toContain('Read');
    expect(officeAssist.tools).toContain('Write');
    expect(officeAssist.tools).toContain('Bash');
    expect(officeAssist.tools).toContain('Agent');
    expect(officeAssist.safeTools).toContain('Read');
    expect(officeAssist.safeTools).toContain('Agent(office-quality-reviewer)');
    expect(officeAssist.safeTools).not.toContain('Write');
    expect(officeAssist.safeTools).not.toContain('Bash');
  });

  it('resolves MCP servers from #MCP-TOOLS', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    // Verify a representative set of servers are resolved — don't lock the exact list
    // so adding new tools to tools.md doesn't break this test.
    const serverKeys = Object.keys(officeAssist.mcpServers);
    expect(serverKeys).toContain('convert');
    expect(serverKeys).toContain('docx');
    expect(serverKeys).toContain('python');
    expect(serverKeys.length).toBeGreaterThanOrEqual(3);
    expect(officeAssist.autoApprovedMcpTools).toContain('mcp__convert__convert');
  });

  it('lists default skills from skills/ subdirectories', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    expect(officeAssist.defaultSkills.map((p) => path.basename(p)).sort()).toEqual(
      ['docx-processor', 'excel-processor', 'office-quality', 'pdf-processor', 'pptx-processor'].sort(),
    );
  });

  it('lists bundled Claude subagents from agents/', async () => {
    const officeAssist = await getAgentDefinition('office-assist');
    const financialAdvisor = await getAgentDefinition('financial-advisor');

    expect(officeAssist.defaultSubagents.map((p) => path.basename(p))).toEqual([
      'office-quality-reviewer.md',
    ]);
    expect(financialAdvisor.defaultSubagents).toEqual([]);
    expect(financialAdvisor.tools).not.toContain('Agent');
  });

  it('registers agent-local tools from tools/ as the local MCP server', async () => {
    const financialAdvisor = await getAgentDefinition('financial-advisor');

    // Verify local server is registered alongside shared servers — don't lock the exact list.
    const serverKeys = Object.keys(financialAdvisor.mcpServers);
    expect(serverKeys).toContain('local');
    expect(serverKeys).toContain('python');
    expect(financialAdvisor.mcpServers['local']?.name).toBe('local');
    expect(financialAdvisor.autoApprovedMcpTools).toContain('mcp__local__get_quote');
    expect(financialAdvisor.autoApprovedMcpTools).toContain('mcp__local__get_sec_xbrl_facts');
    expect(financialAdvisor.autoApprovedMcpTools.filter((name) => name.startsWith('mcp__local__'))).toHaveLength(14);
  });

  it('does not register a local server for agents without a tools/ directory', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    expect(officeAssist.mcpServers['local']).toBeUndefined();
  });

  it('parses bundled subagent frontmatter into subagentDefs for the SDK agents option', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    const reviewer = officeAssist.subagentDefs['office-quality-reviewer'];
    expect(reviewer).toBeDefined();
    expect(reviewer?.description).toContain('Independently reviews');
    expect(reviewer?.prompt).toContain('independent office deliverable reviewer');
    expect(reviewer?.tools).toContain('Read');
    expect(reviewer?.tools).toContain('mcp__docx__docx');
    expect(reviewer?.model).toBeUndefined(); // 'inherit' omits the field
    expect(reviewer?.maxTurns).toBe(12);
    expect(reviewer?.skills).toEqual([
      'office-quality',
      'docx-processor',
      'excel-processor',
      'pptx-processor',
      'pdf-processor',
    ]);
  });

  it('has an empty subagentDefs for agents without an agents/ directory', async () => {
    const financialAdvisor = await getAgentDefinition('financial-advisor');

    expect(financialAdvisor.subagentDefs).toEqual({});
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
});

describe('getAgentDefinition', () => {
  it('throws for an unknown agent id', async () => {
    await expect(getAgentDefinition('not-exist')).rejects.toThrow(
      'Agent definition not found: not-exist',
    );
  });
});
