/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for installing host-agent resources into Claude project scope.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillManager } from './skill-manager.js';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('installSubagentsForAgent', () => {
  it('installs bundled subagents without removing project-defined agents', async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), '.subagent-install-test-'));
    const agentsDir = path.join(tempDir, '.claude', 'agents');
    const customAgent = path.join(agentsDir, 'custom-agent.md');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(customAgent, 'project-defined agent', 'utf-8');

    const installed = await SkillManager.getInstance().installSubagentsForAgent('office-assist', tempDir);

    expect(installed).toEqual([path.join(agentsDir, 'office-quality-reviewer.md')]);
    expect(await fs.readFile(customAgent, 'utf-8')).toBe('project-defined agent');
    expect(await fs.readFile(installed[0], 'utf-8')).toContain('name: office-quality-reviewer');
  });

  it('does not create an agents directory when none are bundled', async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), '.subagent-install-test-'));

    const installed = await SkillManager.getInstance().installSubagentsForAgent('financial-advisor', tempDir);

    expect(installed).toEqual([]);
    await expect(fs.stat(path.join(tempDir, '.claude', 'agents'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
