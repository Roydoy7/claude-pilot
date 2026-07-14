/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for PDF rendering operations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderPdfToImages } from './pdf-mcp-server.js';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('renderPdfToImages', () => {
  it('renders selected pages to predictably named PNG files', async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), '.pdf-images-test-'));
    const inputFile = path.join(tempDir, 'sample.pdf');
    const outputDirectory = path.join(tempDir, 'images');

    const document = await PDFDocument.create();
    document.addPage([200, 100]);
    document.addPage([200, 100]);
    document.addPage([200, 100]);
    await fs.writeFile(inputFile, await document.save());

    const result = await renderPdfToImages(inputFile, '1,3', outputDirectory, 400);

    expect(result.success, result.error).toBe(true);
    expect(result.pageCount).toBe(3);
    expect(result.renderedPages).toEqual([1, 3]);
    expect(result.outputFiles?.map((file) => path.basename(file))).toEqual([
      'sample_page_001.png',
      'sample_page_003.png',
    ]);

    for (const outputFile of result.outputFiles ?? []) {
      const image = await fs.readFile(outputFile);
      expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
  });

  it('rejects a selection with no valid pages', async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), '.pdf-images-test-'));
    const inputFile = path.join(tempDir, 'sample.pdf');
    const document = await PDFDocument.create();
    document.addPage();
    await fs.writeFile(inputFile, await document.save());

    const result = await renderPdfToImages(inputFile, '9', undefined, 400);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid pages selected');
  });
});
