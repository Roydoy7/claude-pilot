/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for the ad-hoc TypeScript executor.
 */

import { describe, expect, it } from 'vitest';
import { executeTypeScriptCode } from './typescript-mcp-server.js';

describe('executeTypeScriptCode', () => {
  it('supports top-level await by executing code as an ES module', async () => {
    const result = await executeTypeScriptCode(`
      import { z } from 'zod';

      const answer = await Promise.resolve(z.number().parse(42));
      console.log(answer);
    `);

    expect(result.success, result.stderr || result.error).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('42');
    expect(result.stderr).toBe('');
  }, 30_000);

  it('normalizes and constructs the PptxGenJS CommonJS default export', async () => {
    const result = await executeTypeScriptCode(`
      import importedPptxGenJS from 'pptxgenjs';

      type PptxGenJSConstructor = typeof importedPptxGenJS;
      const PptxGenJS =
        (importedPptxGenJS as unknown as { default?: PptxGenJSConstructor }).default ??
        importedPptxGenJS;

      const pptx = new PptxGenJS();
      console.log(typeof pptx.addSlide);
    `);

    expect(result.success, result.stderr || result.error).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('function');
  }, 30_000);
});
