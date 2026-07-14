/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for document conversion guidance.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertDocument } from './convert-mcp-server.js';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('convertDocument guidance', () => {
  it('routes PDF page images to the PDF tool without suggesting an invalid DOCX chain', async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), '.convert-guidance-test-'));
    const inputFile = path.join(tempDir, 'sample.pdf');
    await fs.writeFile(inputFile, Buffer.from('%PDF-1.4'));

    const result = await convertDocument(
      inputFile,
      path.join(tempDir, 'sample.jpg'),
      'pdf',
      'jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('mcp__pdf__process');
    expect(result.error).toContain('operation="to-images"');
    expect(result.error).toContain('DOCX -> PNG/JPG is not supported');
    expect(result.error).not.toContain('first convert PDF to DOCX');
  });
});
