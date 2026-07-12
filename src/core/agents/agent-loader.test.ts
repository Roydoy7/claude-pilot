/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for agent-loader: loading file-based agent definitions from agent-defs/
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { getAgentDefinitions, getAgentDefinition } from './agent-loader.js';

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
    expect(officeAssist.safeTools).toContain('Read');
    expect(officeAssist.safeTools).not.toContain('Write');
    expect(officeAssist.safeTools).not.toContain('Bash');
  });

  it('resolves MCP servers from #MCP-TOOLS', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    expect(Object.keys(officeAssist.mcpServers).sort()).toEqual(
      ['browser', 'claude', 'convert', 'docx', 'image', 'pdf', 'pptx', 'python', 'typescript', 'xlsx'].sort(),
    );
    expect(officeAssist.autoApprovedMcpTools).toContain('mcp__convert__convert');
  });

  it('lists default skills from skills/ subdirectories', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    expect(officeAssist.defaultSkills.map((p) => path.basename(p)).sort()).toEqual(
      ['docx-processor', 'excel-processor', 'pptx-processor'].sort(),
    );
  });

  it('registers agent-local tools from tools/ as the local MCP server', async () => {
    const financialAdvisor = await getAgentDefinition('financial-advisor');

    expect(Object.keys(financialAdvisor.mcpServers).sort()).toEqual(['browser', 'claude', 'local', 'python', 'typescript'].sort());
    expect(financialAdvisor.mcpServers['local']?.name).toBe('local');
    expect(financialAdvisor.autoApprovedMcpTools).toContain('mcp__local__get_quote');
    expect(financialAdvisor.autoApprovedMcpTools).toContain('mcp__local__get_sec_xbrl_facts');
    expect(financialAdvisor.autoApprovedMcpTools.filter((name) => name.startsWith('mcp__local__'))).toHaveLength(14);
  });

  it('does not register a local server for agents without a tools/ directory', async () => {
    const officeAssist = await getAgentDefinition('office-assist');

    expect(officeAssist.mcpServers['local']).toBeUndefined();
  });
});

describe('getAgentDefinition', () => {
  it('throws for an unknown agent id', async () => {
    await expect(getAgentDefinition('not-exist')).rejects.toThrow(
      'Agent definition not found: not-exist',
    );
  });
});
