/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for installing host-agent resources into Claude project scope.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillManager } from './skill-manager.js';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('installSubagentFiles', () => {
  it('copies files into .claude/agents/ without removing project-defined agents', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-subagent-test-'));
    const agentsDir = path.join(tempDir, '.claude', 'agents');
    const customAgent = path.join(agentsDir, 'custom-agent.md');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(customAgent, 'project-defined agent', 'utf-8');

    // Create a temp source subagent file
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-subagent-src-'));
    const sourceFile = path.join(sourceDir, 'my-reviewer.md');
    await fs.writeFile(sourceFile, '---\nname: my-reviewer\ndescription: Reviews things.\n---\n\nYou are a reviewer.\n', 'utf-8');

    try {
      const installed = await SkillManager.getInstance().installSubagentFiles([sourceFile], tempDir);

      expect(installed).toEqual([path.join(agentsDir, 'my-reviewer.md')]);
      expect(await fs.readFile(customAgent, 'utf-8')).toBe('project-defined agent');
      expect(await fs.readFile(installed[0]!, 'utf-8')).toContain('name: my-reviewer');
    } finally {
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });

  it('returns empty array and does not create agents dir when given no paths', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-subagent-test-'));

    const installed = await SkillManager.getInstance().installSubagentFiles([], tempDir);

    expect(installed).toEqual([]);
    await expect(fs.stat(path.join(tempDir, '.claude', 'agents'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
