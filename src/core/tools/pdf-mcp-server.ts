/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * PDF MCP Server - Custom tool for PDF operations
 * Uses Claude Agent SDK's MCP server pattern for tool integration
 * Based on polyglot-ai's pdf-tool.ts implementation
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { promises as fs, existsSync, createWriteStream } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import PDFDocument from 'pdfkit';
import {
  PDFDocument as PDFLibDocument,
  PDFArray,
  PDFDict,
  PDFString,
  type PDFObject,
} from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { getErrorMessage } from '../errors.js';

// Configure pdf-parse worker for Node.js/Electron environment
// Use the worker published by pdf-parse itself. This remains stable whether npm
// hoists or nests pdf-parse's internal pdfjs-dist dependency.
const workerPath = path.join(
  process.cwd(),
  'node_modules',
  'pdf-parse',
  'dist',
  'pdf-parse',
  'web',
  'pdf.worker.mjs'
);
PDFParse.setWorker(pathToFileURL(workerPath).href);

/**
 * Helper function to parse PDF buffer using PDFParse class (v2.x API)
 */
async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  const parser = new PDFParse({
    data: buffer,
    isEvalSupported: false,  // Additional safety: disable eval-based features
  });
  const result = await parser.getText();
  await parser.destroy();
  return { text: result.text };
}

/**
 * PDF outline/bookmark item
 */
interface PDFOutlineItem {
  title: string;
  page: number;
  level: number;
  children?: PDFOutlineItem[];
}

/**
 * PDF execution result
 */
interface PDFExecutionResult {
  success: boolean;
  operation: string;
  file: string;

  // Data results
  text?: string;
  pageTexts?: Record<number, string>;
  searchResults?: Array<{ page: number; matches: number; contexts: string[] }>;

  // File results
  outputFile?: string;
  outputFiles?: string[];

  // Render results
  imageBase64?: string;
  renderedWidth?: number;
  renderedHeight?: number;
  renderedPages?: number[];

  // Status
  pageCount?: number;
  fileSize?: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
  };

  // Document structure
  outline?: {
    hasOutline: boolean;
    items: PDFOutlineItem[];
    totalItems: number;
  };

  error?: string;
  executionTime: number;
}

/**
 * Parse page numbers from string like "1-3,5,7-10"
 */
function parsePageNumbers(pages: string | undefined, totalPages: number): number[] {
  if (!pages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const result: number[] = [];
  const parts = pages.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim(), 10));
      for (let i = start; i <= Math.min(end, totalPages); i++) {
        if (i >= 1) result.push(i);
      }
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        result.push(pageNum);
      }
    }
  }

  return [...new Set(result)].sort((a, b) => a - b);
}

/**
 * Format execution result for LLM
 */
function formatResultForLLM(result: PDFExecutionResult): string {
  const lines: string[] = [];

  lines.push(`# PDF ${result.operation} Result\n`);
  lines.push(`**Status**: ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`**Execution Time**: ${result.executionTime}ms`);
  lines.push(`**File**: ${result.file}`);

  if (result.pageCount !== undefined) {
    lines.push(`**Page Count**: ${result.pageCount}`);
  }

  if (result.fileSize !== undefined) {
    lines.push(`**File Size**: ${Math.round(result.fileSize / 1024)}KB`);
  }

  if (result.metadata) {
    lines.push('\n## Metadata\n');
    Object.entries(result.metadata)
      .filter(([, value]) => value !== undefined)
      .forEach(([key, value]) => {
        lines.push(`- **${key}**: ${value}`);
      });
  }

  if (result.outline) {
    lines.push('\n## Document Structure\n');
    if (result.outline.hasOutline) {
      lines.push(`**Total Bookmarks**: ${result.outline.totalItems}\n`);
      const outlineDisplay = formatOutlineItems(result.outline.items);
      lines.push('### Outline/Bookmarks\n');
      lines.push(...outlineDisplay);
    } else {
      lines.push('No outline/bookmarks found');
    }
  }

  if (result.text) {
    lines.push('\n## Extracted Text\n');
    lines.push('```');
    lines.push(result.text.substring(0, 2000));
    if (result.text.length > 2000) {
      lines.push('\n... (truncated)');
    }
    lines.push('```');
  }

  if (result.pageTexts) {
    lines.push('\n## Page Texts\n');
    Object.entries(result.pageTexts).forEach(([pageNum, text]) => {
      lines.push(`\n### Page ${pageNum}\n`);
      lines.push('```');
      lines.push(text.substring(0, 500));
      if (text.length > 500) {
        lines.push('\n... (truncated)');
      }
      lines.push('```');
    });
  }

  if (result.searchResults) {
    lines.push('\n## Search Results\n');
    const totalMatches = result.searchResults.reduce((sum, r) => sum + r.matches, 0);
    lines.push(`**Total Matches**: ${totalMatches}\n`);

    result.searchResults.forEach(({ page, matches, contexts }) => {
      if (matches > 0) {
        lines.push(`\n### Page ${page} (${matches} matches)\n`);
        contexts.forEach((context, i) => {
          lines.push(`${i + 1}. ${context}`);
        });
      }
    });
  }

  if (result.renderedWidth !== undefined && result.renderedHeight !== undefined) {
    lines.push(`**Rendered Size**: ${result.renderedWidth} x ${result.renderedHeight} px`);
  }

  if (result.renderedPages) {
    lines.push(`**Rendered Pages**: ${result.renderedPages.join(', ')}`);
  }

  if (result.outputFile) {
    lines.push(`\n**Output File**: ${result.outputFile}`);
  }

  if (result.outputFiles) {
    lines.push('\n## Output Files\n');
    result.outputFiles.forEach((file, i) => {
      lines.push(`${i + 1}. ${file}`);
    });
  }

  if (result.error) {
    lines.push('\n## Error Details\n');
    lines.push(result.error);
  }

  return lines.join('\n');
}

/**
 * Create PDF file
 */
async function createPDF(file: string, content: string): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const pdfDoc = new PDFDocument();
    const stream = createWriteStream(file);
    pdfDoc.pipe(stream);

    pdfDoc.fontSize(12).text(content, 50, 50);
    pdfDoc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    const stats = await fs.stat(file);

    return {
      success: true,
      operation: 'create',
      file,
      outputFile: file,
      fileSize: stats.size,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'create',
      file,
      error: `Failed to create PDF: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Decode metadata value - handle hex-encoded strings
 * Based on Gemini CLI's implementation to avoid encoding issues
 */
function decodeMetadataValue(value: string | undefined): string | undefined {
  if (!value) return undefined;

  // Check if value is a hex string wrapped in angle brackets
  if (value.startsWith('<') && value.endsWith('>')) {
    const hexString = value.slice(1, -1);
    // Validate hex string format
    if (/^[0-9A-Fa-f]+$/.test(hexString) && hexString.length % 2 === 0) {
      try {
        // Convert hex to bytes and decode as UTF-8
        const bytes: number[] = [];
        for (let i = 0; i < hexString.length; i += 2) {
          bytes.push(parseInt(hexString.substr(i, 2), 16));
        }
        const buffer = Buffer.from(bytes);

        // Try different encodings in order of preference

        // Try UTF-8 first
        try {
          const decoded = buffer.toString('utf8');
          // Check if decoded contains replacement characters indicating encoding issues
          if (!decoded.includes('\uFFFD')) {
            return decoded;
          }
        } catch {
          // Continue to next encoding
        }

        // Try UTF-16LE
        try {
          const decoded = buffer.toString('utf16le');
          if (!decoded.includes('\uFFFD') && decoded.length > 0) {
            return decoded;
          }
        } catch {
          // Continue to next encoding
        }

        // Try Latin1 for legacy encodings
        try {
          const decoded = buffer.toString('latin1');
          if (decoded.length > 0) {
            return decoded;
          }
        } catch {
          // Continue to fallback
        }

        // Final fallback to ASCII
        try {
          return buffer.toString('ascii');
        } catch {
          return value; // Return original if all fail
        }
      } catch {
        // If decoding fails, return original value
        return value;
      }
    }
  }

  return value;
}

/**
 * Resolve named destination to page reference
 */
function resolveNamedDestination(
  pdfDoc: PDFLibDocument,
  destName: string
): PDFObject | null {
  try {
    const catalog = pdfDoc.catalog;

    // Try /Dests dictionary first (old-style named destinations)
    const dests = catalog.lookup(catalog.context.obj('Dests'));
    if (dests instanceof PDFDict) {
      const dest = dests.lookup(dests.context.obj(destName));
      if (dest) {
        // Dereference if needed
        const resolvedDest =
          dest && typeof dest === 'object' && 'objectNumber' in dest
            ? catalog.context.lookup(dest)
            : dest;

        if (resolvedDest instanceof PDFArray && resolvedDest.size() > 0) {
          return resolvedDest.get(0);
        } else if (Array.isArray(resolvedDest) && resolvedDest.length > 0) {
          return resolvedDest[0];
        }
      }
    }

    // Try /Names dictionary (new-style named destinations)
    const names = catalog.lookup(catalog.context.obj('Names'));
    if (names instanceof PDFDict) {
      const destsTree = names.lookup(names.context.obj('Dests'));
      if (destsTree instanceof PDFDict) {
        // Simplified: just try to lookup directly (full name tree traversal would be more complex)
        const namesArray = destsTree.lookup(destsTree.context.obj('Names'));
        if (namesArray instanceof PDFArray) {
          // Names array is [name1, dest1, name2, dest2, ...]
          for (let i = 0; i < namesArray.size(); i += 2) {
            const name = namesArray.get(i);
            const nameStr =
              name instanceof PDFString ? name.decodeText() : String(name);
            if (nameStr === destName) {
              const dest = namesArray.get(i + 1);
              const resolvedDest =
                dest && typeof dest === 'object' && 'objectNumber' in dest
                  ? catalog.context.lookup(dest)
                  : dest;

              if (resolvedDest instanceof PDFArray && resolvedDest.size() > 0) {
                return resolvedDest.get(0);
              } else if (
                Array.isArray(resolvedDest) &&
                resolvedDest.length > 0
              ) {
                return resolvedDest[0];
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('[PDF Outline] Failed to resolve named destination:', error);
  }

  return null;
}

/**
 * Extract PDF outline/bookmarks structure
 */
async function extractOutline(
  pdfDoc: PDFLibDocument
): Promise<{
  hasOutline: boolean;
  items: PDFOutlineItem[];
  totalItems: number;
}> {
  try {
    const catalog = pdfDoc.catalog;
    const outlines = catalog.lookup(catalog.context.obj('Outlines'));

    if (!outlines) {
      return { hasOutline: false, items: [], totalItems: 0 };
    }

    const pages = pdfDoc.getPages();

    // Helper function to recursively parse outline items
    const parseOutlineLevel = (
      outlineRef: unknown,
      level: number = 0
    ): PDFOutlineItem[] => {
      const levelItems: PDFOutlineItem[] = [];

      try {
        const outlineDict = outlineRef instanceof PDFDict ? outlineRef : null;
        if (!outlineDict) return levelItems;

        // If has /First, start from First; otherwise start from current item
        const firstRef = outlineDict.lookup(outlineDict.context.obj('First'));
        let current: PDFObject | null = firstRef || outlineDict;

        while (current) {
          try {
            const currentDict: PDFDict | null =
              current instanceof PDFDict ? current : null;
            if (!currentDict) {
              current = null;
              continue;
            }

            // Get title
            const titleObj = currentDict.lookup(currentDict.context.obj('Title'));
            let title = 'Untitled';

            if (titleObj) {
              let rawTitle: string;

              if (titleObj instanceof PDFString) {
                rawTitle = titleObj.decodeText();
              } else if (typeof titleObj === 'string') {
                rawTitle = titleObj;
              } else if (
                typeof titleObj === 'object' &&
                titleObj !== null &&
                'asString' in titleObj &&
                typeof (titleObj as { asString: unknown }).asString === 'function'
              ) {
                rawTitle = (titleObj as { asString: () => string }).asString();
              } else {
                rawTitle = String(titleObj);
              }

              title = rawTitle;
            }

            // Get destination page
            let pageNum = 1;
            const dest = currentDict.lookup(currentDict.context.obj('Dest'));
            const action = currentDict.lookup(currentDict.context.obj('A'));

            const findPageNumber = (pageRef: PDFObject): number => {
              if (!pageRef) return 1;

              // Try direct reference comparison
              const pageIndex = pages.findIndex((page) => page.ref === pageRef);
              if (pageIndex !== -1) {
                return pageIndex + 1;
              }

              // Try comparing object numbers if available
              if (
                typeof pageRef === 'object' &&
                pageRef !== null &&
                'num' in pageRef
              ) {
                const refNum = (pageRef as { num: unknown }).num;
                const pageByNum = pages.findIndex((page) => {
                  if (
                    page.ref &&
                    typeof page.ref === 'object' &&
                    page.ref !== null &&
                    'num' in page.ref
                  ) {
                    const pageRefNum = (page.ref as { num: unknown }).num;
                    return pageRefNum === refNum;
                  }
                  return false;
                });
                if (pageByNum !== -1) {
                  return pageByNum + 1;
                }
              }

              return 1; // Default to page 1 if no match found
            };

            if (dest) {
              if (dest instanceof PDFArray) {
                if (dest.size() > 0) {
                  pageNum = findPageNumber(dest.get(0));
                }
              } else if (Array.isArray(dest) && dest.length > 0) {
                pageNum = findPageNumber(dest[0]);
              }
            } else if (action) {
              // Action-based destination - need to resolve the reference first
              let actionDict: PDFObject | undefined = action;

              // If action is a reference, dereference it
              if (
                typeof action === 'object' &&
                action !== null &&
                'objectNumber' in action
              ) {
                try {
                  const context = currentDict.context;
                  actionDict = context.lookup(action);
                } catch {
                  // If lookup fails, actionDict remains the original action
                }
              }

              if (actionDict && actionDict instanceof PDFDict) {
                // Look for /D (Destination) in the action dictionary
                const actionDest = actionDict.lookup(actionDict.context.obj('D'));
                if (actionDest) {
                  // Check if it's a named destination (PDFString)
                  if (actionDest instanceof PDFString) {
                    // Named destination - need to resolve it
                    const destName = actionDest.decodeText();
                    const resolvedDest = resolveNamedDestination(pdfDoc, destName);
                    if (resolvedDest) {
                      pageNum = findPageNumber(resolvedDest);
                    }
                  } else if (
                    actionDest instanceof PDFArray &&
                    actionDest.size() > 0
                  ) {
                    // Direct destination array
                    pageNum = findPageNumber(actionDest.get(0));
                  } else if (Array.isArray(actionDest) && actionDest.length > 0) {
                    pageNum = findPageNumber(actionDest[0]);
                  }
                }
              }
            }

            const item: PDFOutlineItem = {
              title: title.trim(),
              page: pageNum,
              level,
            };

            // Check for children
            const firstChild = currentDict.lookup(currentDict.context.obj('First'));
            if (firstChild instanceof PDFDict) {
              const childItems = parseOutlineLevel(firstChild, level + 1);
              if (childItems.length > 0) {
                item.children = childItems;
              }
            }

            levelItems.push(item);

            // Move to next sibling
            current = currentDict.lookup(currentDict.context.obj('Next')) || null;
          } catch (itemError) {
            console.warn('[PDF Outline] Error parsing outline item:', itemError);
            break;
          }
        }
      } catch (levelError) {
        console.warn('[PDF Outline] Error parsing outline level:', levelError);
      }

      return levelItems;
    };

    const rootItems = parseOutlineLevel(outlines);

    // Count total items recursively
    const countItems = (items: PDFOutlineItem[]): number =>
      items.reduce(
        (count, item) =>
          count + 1 + (item.children ? countItems(item.children) : 0),
        0
      );

    return {
      hasOutline: rootItems.length > 0,
      items: rootItems,
      totalItems: countItems(rootItems),
    };
  } catch (error) {
    console.warn('[PDF Outline] Failed to extract outline:', error);
    return { hasOutline: false, items: [], totalItems: 0 };
  }
}

/**
 * Format outline items for display
 */
function formatOutlineItems(items: PDFOutlineItem[]): string[] {
  const lines: string[] = [];

  const formatItem = (item: PDFOutlineItem) => {
    const indent = '  '.repeat(item.level);
    lines.push(`${indent}- ${item.title} (page ${item.page})`);
    if (item.children) {
      item.children.forEach(formatItem);
    }
  };

  items.forEach(formatItem);
  return lines;
}

/**
 * Check if error is encryption-related
 */
function isEncryptionError(errorMessage: string): boolean {
  return (
    errorMessage.includes('encrypted') ||
    errorMessage.includes('Invalid object ref') ||
    errorMessage.includes('Expected instance of PDFDict') ||
    errorMessage.includes('Trying to parse invalid object') ||
    errorMessage.includes('password') ||
    errorMessage.includes('security')
  );
}

/**
 * Get PDF info
 */
async function getPDFInfo(file: string): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    let pdfDoc: PDFLibDocument;

    try {
      pdfDoc = await PDFLibDocument.load(await fs.readFile(file), {
        ignoreEncryption: false,
      });
    } catch (loadError) {
      const errorMessage =
        loadError instanceof Error ? loadError.message : String(loadError);
      if (isEncryptionError(errorMessage)) {
        return {
          success: false,
          operation: 'get-info',
          file,
          error: `PDF appears to be encrypted or password-protected:\n${errorMessage}\n\nSuggestions:\n- Try removing password protection using another tool\n- Contact the PDF creator for an unencrypted version`,
          executionTime: Date.now() - startTime,
        };
      }
      return {
        success: false,
        operation: 'get-info',
        file,
        error: `Failed to load PDF: ${errorMessage}`,
        executionTime: Date.now() - startTime,
      };
    }

    const stats = await fs.stat(file);
    const pageCount = pdfDoc.getPageCount();

    // Get basic metadata and decode hex strings
    const rawTitle = pdfDoc.getTitle();
    const rawAuthor = pdfDoc.getAuthor();
    const rawSubject = pdfDoc.getSubject();
    const rawCreator = pdfDoc.getCreator();
    const rawProducer = pdfDoc.getProducer();

    const metadata = {
      title: decodeMetadataValue(rawTitle),
      author: decodeMetadataValue(rawAuthor),
      subject: decodeMetadataValue(rawSubject),
      creator: decodeMetadataValue(rawCreator),
      producer: decodeMetadataValue(rawProducer),
    };

    // Extract outline/bookmarks structure
    const outlineInfo = await extractOutline(pdfDoc);

    return {
      success: true,
      operation: 'get-info',
      file,
      pageCount,
      fileSize: stats.size,
      metadata,
      outline: outlineInfo,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'get-info',
      file,
      error: `Failed to get PDF info: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Extract text from PDF
 * Uses single-page extraction to avoid encoding issues
 */
async function extractText(
  file: string,
  pages?: string
): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const buffer = await fs.readFile(file);
    let pdfDoc: PDFLibDocument;

    try {
      pdfDoc = await PDFLibDocument.load(buffer, { ignoreEncryption: false });
    } catch (loadError) {
      const errorMessage =
        loadError instanceof Error ? loadError.message : String(loadError);
      if (isEncryptionError(errorMessage)) {
        return {
          success: false,
          operation: 'extracttext',
          file,
          error: `PDF appears to be encrypted or password-protected:\n${errorMessage}\n\nSuggestions:\n- Try removing password protection using another tool\n- Contact the PDF creator for an unencrypted version`,
          executionTime: Date.now() - startTime,
        };
      }
      return {
        success: false,
        operation: 'extracttext',
        file,
        error: `Failed to load PDF: ${errorMessage}`,
        executionTime: Date.now() - startTime,
      };
    }

    const pageCount = pdfDoc.getPageCount();
    const pageNumbers = parsePageNumbers(pages, pageCount);

    const pageTexts: Record<number, string> = {};

    // Extract text from each specified page
    for (const pageNum of pageNumbers) {
      try {
        // Create a single-page PDF for individual parsing
        const singlePageDoc = await PDFLibDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
        singlePageDoc.addPage(copiedPage);

        // Convert single page to buffer and extract text
        const singlePageBuffer = await singlePageDoc.save();
        const singlePageData = await parsePdfBuffer(Buffer.from(singlePageBuffer));

        pageTexts[pageNum] = singlePageData.text.trim() || '';
      } catch (pageError) {
        pageTexts[pageNum] = `[Error extracting page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`;
      }
    }

    // Combine all text for output file
    const allText = Object.entries(pageTexts)
      .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
      .map(([pageNum, text]) => `Page ${pageNum}:\n${text}`)
      .join('\n\n');

    return {
      success: true,
      operation: 'extracttext',
      file,
      pageCount,
      text: allText,
      pageTexts,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'extracttext',
      file,
      error: `Failed to extract text: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Search text in PDF
 * Uses single-page extraction to avoid encoding issues
 */
async function searchText(
  file: string,
  query: string,
  pages?: string
): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const buffer = await fs.readFile(file);
    let pdfDoc: PDFLibDocument;

    try {
      pdfDoc = await PDFLibDocument.load(buffer, { ignoreEncryption: false });
    } catch (loadError) {
      const errorMessage =
        loadError instanceof Error ? loadError.message : String(loadError);
      if (isEncryptionError(errorMessage)) {
        return {
          success: false,
          operation: 'search',
          file,
          error: `PDF appears to be encrypted or password-protected:\n${errorMessage}\n\nSuggestions:\n- Try removing password protection using another tool\n- Contact the PDF creator for an unencrypted version`,
          executionTime: Date.now() - startTime,
        };
      }
      return {
        success: false,
        operation: 'search',
        file,
        error: `Failed to load PDF: ${errorMessage}`,
        executionTime: Date.now() - startTime,
      };
    }

    const pageCount = pdfDoc.getPageCount();
    const pageNumbers = parsePageNumbers(pages, pageCount);

    const searchResults: Array<{ page: number; matches: number; contexts: string[] }> = [];

    for (const pageNum of pageNumbers) {
      try {
        // Create a single-page PDF for individual text extraction
        const singlePageDoc = await PDFLibDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
        singlePageDoc.addPage(copiedPage);

        // Convert single page to buffer and extract text
        const singlePageBuffer = await singlePageDoc.save();
        const singlePageData = await parsePdfBuffer(Buffer.from(singlePageBuffer));
        const pageText = singlePageData.text;

        // Search for all occurrences of query in this page
        const matches: string[] = [];
        const queryLower = query.toLowerCase();
        const textLower = pageText.toLowerCase();

        let searchIndex = 0;
        while (searchIndex < textLower.length) {
          const matchIndex = textLower.indexOf(queryLower, searchIndex);
          if (matchIndex === -1) break;

          // Extract context around the match (50 characters before and after)
          const contextStart = Math.max(0, matchIndex - 50);
          const contextEnd = Math.min(pageText.length, matchIndex + query.length + 50);
          const context = pageText.substring(contextStart, contextEnd).trim();

          matches.push(context.length > 150 ? context.substring(0, 147) + '...' : context);
          searchIndex = matchIndex + 1;
        }

        searchResults.push({
          page: pageNum,
          matches: matches.length,
          contexts: matches,
        });
      } catch (pageError) {
        searchResults.push({
          page: pageNum,
          matches: 0,
          contexts: [`[Error searching page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`],
        });
      }
    }

    return {
      success: true,
      operation: 'search',
      file,
      pageCount,
      searchResults,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'search',
      file,
      error: `Failed to search PDF: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Merge PDFs
 */
async function mergePDFs(sources: string[], output: string): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const mergedDoc = await PDFLibDocument.create();

    for (const source of sources) {
      if (!existsSync(source)) {
        return {
          success: false,
          operation: 'merge',
          file: output,
          error: `Source file not found: ${source}`,
          executionTime: Date.now() - startTime,
        };
      }

      const sourceDoc = await PDFLibDocument.load(await fs.readFile(source), {
        ignoreEncryption: false,
      });
      const pages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
      pages.forEach((page) => mergedDoc.addPage(page));
    }

    await fs.writeFile(output, await mergedDoc.save());
    const stats = await fs.stat(output);

    return {
      success: true,
      operation: 'merge',
      file: output,
      outputFile: output,
      fileSize: stats.size,
      pageCount: mergedDoc.getPageCount(),
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'merge',
      file: output,
      error: `Failed to merge PDFs: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Split PDF - Extract specified pages into a single output file
 * When pages parameter specifies a range (e.g., "61-76"), all pages are combined into one file
 */
async function splitPDF(
  file: string,
  pages: string | undefined,
  output?: string
): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const pdfDoc = await PDFLibDocument.load(await fs.readFile(file), {
      ignoreEncryption: false,
    });
    const totalPages = pdfDoc.getPageCount();
    const pageNumbers = parsePageNumbers(pages, totalPages);

    // Create a single output document with all specified pages
    const newDoc = await PDFLibDocument.create();
    const copiedPages = await newDoc.copyPages(
      pdfDoc,
      pageNumbers.map((p) => p - 1)
    );
    copiedPages.forEach((page) => newDoc.addPage(page));

    // Determine output file path
    let outputFile: string;
    if (output) {
      if (output.endsWith('.pdf')) {
        outputFile = output;
      } else {
        // output is a directory
        const baseName = path.basename(file, path.extname(file));
        if (pageNumbers.length === 1) {
          outputFile = path.join(output, `${baseName}_page_${pageNumbers[0]}.pdf`);
        } else {
          const firstPage = pageNumbers[0];
          const lastPage = pageNumbers[pageNumbers.length - 1];
          outputFile = path.join(output, `${baseName}_pages_${firstPage}-${lastPage}.pdf`);
        }
      }
    } else {
      const baseDir = path.dirname(file);
      const baseName = path.basename(file, path.extname(file));
      if (pageNumbers.length === 1) {
        outputFile = path.join(baseDir, `${baseName}_page_${pageNumbers[0]}.pdf`);
      } else {
        const firstPage = pageNumbers[0];
        const lastPage = pageNumbers[pageNumbers.length - 1];
        outputFile = path.join(baseDir, `${baseName}_pages_${firstPage}-${lastPage}.pdf`);
      }
    }

    await fs.writeFile(outputFile, await newDoc.save());
    const stats = await fs.stat(outputFile);

    return {
      success: true,
      operation: 'split',
      file,
      outputFile,
      outputFiles: [outputFile],
      pageCount: pageNumbers.length,
      fileSize: stats.size,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'split',
      file,
      error: `Failed to split PDF: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

interface RenderedPdfPage {
  pageNumber: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
}

async function renderPdfPages(
  buffer: Buffer,
  selectPages: (pageCount: number) => number[],
  maxDimensionPx: number
): Promise<{ pageCount: number; selectedPages: number[]; pages: RenderedPdfPage[] }> {
  const parser = new PDFParse({
    data: buffer,
    isEvalSupported: false,
  });

  try {
    const documentInfo = await parser.getInfo();
    const pageCount = documentInfo.total;
    const selectedPages = [
      ...new Set(selectPages(pageCount).filter((page) => page >= 1 && page <= pageCount)),
    ].sort((a, b) => a - b);

    if (selectedPages.length === 0) {
      return { pageCount, selectedPages, pages: [] };
    }

    // Determine each page's aspect ratio first so maxDimension remains a true
    // width-or-height limit while using pdf-parse's desiredWidth rendering API.
    const pageInfo = await parser.getInfo({
      parsePageInfo: true,
      partial: selectedPages,
    });
    const pagesByDesiredWidth = new Map<number, number[]>();
    for (const page of pageInfo.pages) {
      const desiredWidth = Math.max(
        1,
        Math.round(maxDimensionPx * (page.width / Math.max(page.width, page.height)))
      );
      const group = pagesByDesiredWidth.get(desiredWidth) ?? [];
      group.push(page.pageNumber);
      pagesByDesiredWidth.set(desiredWidth, group);
    }

    const renderedByPage = new Map<number, RenderedPdfPage>();
    for (const [desiredWidth, pageNumbers] of pagesByDesiredWidth) {
      const screenshots = await parser.getScreenshot({
        partial: pageNumbers,
        desiredWidth,
        imageBuffer: true,
        imageDataUrl: false,
      });
      for (const page of screenshots.pages) {
        renderedByPage.set(page.pageNumber, {
          pageNumber: page.pageNumber,
          pngBuffer: Buffer.from(page.data),
          width: Math.round(page.width),
          height: Math.round(page.height),
        });
      }
    }

    return {
      pageCount,
      selectedPages,
      pages: selectedPages
        .map((pageNumber) => renderedByPage.get(pageNumber))
        .filter((page): page is RenderedPdfPage => page !== undefined),
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Render a single PDF page to PNG and return it for immediate visual analysis.
 * Uses PDFParse.getScreenshot(), which owns the matching PDF.js and Canvas integration.
 */
async function renderPage(
  file: string,
  pageNum: number,
  maxDimensionPx: number,
  output?: string
): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const buffer = await fs.readFile(file);
    const rendered = await renderPdfPages(buffer, () => [pageNum], maxDimensionPx);
    if (rendered.pages.length === 0) {
      return {
        success: false,
        operation: 'render',
        file,
        pageCount: rendered.pageCount,
        error: `Page ${pageNum} is out of range (1-${rendered.pageCount})`,
        executionTime: Date.now() - startTime,
      };
    }
    const [{ pngBuffer, width, height }] = rendered.pages;

    let outputFile: string | undefined;
    if (output) {
      outputFile = output;
      await fs.writeFile(outputFile, pngBuffer);
    }

    return {
      success: true,
      operation: 'render',
      file,
      pageCount: rendered.pageCount,
      outputFile,
      imageBase64: pngBuffer.toString('base64'),
      renderedWidth: width,
      renderedHeight: height,
      renderedPages: [pageNum],
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'render',
      file,
      error: `Failed to render PDF page: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Convert selected PDF pages to individual PNG files in one pass.
 */
export async function renderPdfToImages(
  file: string,
  pages: string | undefined,
  outputDirectory: string | undefined,
  maxDimensionPx: number
): Promise<PDFExecutionResult> {
  const startTime = Date.now();

  try {
    const buffer = await fs.readFile(file);
    const rendered = await renderPdfPages(
      buffer,
      (pageCount) => parsePageNumbers(pages, pageCount),
      maxDimensionPx
    );
    if (rendered.pages.length === 0) {
      return {
        success: false,
        operation: 'to-images',
        file,
        pageCount: rendered.pageCount,
        error: `No valid pages selected (document range is 1-${rendered.pageCount})`,
        executionTime: Date.now() - startTime,
      };
    }

    const parsed = path.parse(file);
    const targetDir = outputDirectory || path.join(parsed.dir, `${parsed.name}_images`);
    await fs.mkdir(targetDir, { recursive: true });

    const pageDigits = Math.max(3, String(rendered.pageCount).length);
    const outputFiles: string[] = [];
    for (const page of rendered.pages) {
      const outputFile = path.join(
        targetDir,
        `${parsed.name}_page_${String(page.pageNumber).padStart(pageDigits, '0')}.png`
      );
      await fs.writeFile(outputFile, page.pngBuffer);
      outputFiles.push(outputFile);
    }

    return {
      success: true,
      operation: 'to-images',
      file,
      pageCount: rendered.pageCount,
      outputFiles,
      renderedPages: rendered.selectedPages,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'to-images',
      file,
      error: `Failed to convert PDF to images: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * PDF tool schema
 */
const pdfToolSchema = {
  operation: z
    .enum(['create', 'get-info', 'extracttext', 'search', 'merge', 'split', 'render', 'to-images'])
    .describe('Operation to perform on PDF file'),
  file: z
    .string()
    .optional()
    .describe('PDF file path. Required for get-info, extracttext, search, split operations. Not needed for merge (uses sources instead)'),
  pages: z
    .string()
    .optional()
    .describe('Page numbers or ranges (1-based) like "1-3,5,7-10". If omitted, processes all pages'),
  query: z
    .string()
    .optional()
    .describe('Search query text (required for search operation)'),
  output: z
    .string()
    .optional()
    .describe('Output file path for split, merge, create, or single-page render operations'),
  outputDirectory: z
    .string()
    .optional()
    .describe('Output directory for to-images. Defaults to <pdf-name>_images beside the PDF'),
  sources: z
    .array(z.string())
    .optional()
    .describe('Source PDF file paths for merge operation'),
  content: z
    .string()
    .optional()
    .describe('Text content for create operation'),
  page: z
    .number()
    .int()
    .optional()
    .describe('Single page number (1-based) for render operation. Defaults to 1'),
  maxDimension: z
    .number()
    .int()
    .min(256)
    .max(4096)
    .optional()
    .describe('Max width/height in pixels for render or to-images output. Range: 256-4096; default: 1800'),
};

/**
 * Create PDF MCP server
 * Tool name will be: mcp__pdf__process
 */
export function createPdfMcpServer() {
  return createSdkMcpServer({
    name: 'pdf',
    version: '1.0.0',
    tools: [
      tool(
        'process',
        'Perform PDF operations: create new PDFs, get info/metadata, extract text from pages, search text, merge multiple PDFs, split pages, and convert selected pages to PNG images. ' +
        'Always use operation="get-info" first to understand document structure. ' +
        'For extracttext and search, specify pages parameter (e.g., "1-5" or "1,3,5") to limit processing. ' +
        'Use operation="render" to return one page as a PNG image for immediate visual analysis. ' +
        'Use operation="to-images" to convert all or selected pages to numbered PNG files in one pass; set pages to limit large documents.',
        pdfToolSchema,
        async (args) => {
          const { operation, file, pages, query, output, outputDirectory, sources, content, page, maxDimension } = args;
          // workingDirectory is auto-injected by PreToolUse hook from session cwd
          const workingDirectory = (args as Record<string, unknown>).workingDirectory as string | undefined;

          // Resolve file path relative to working directory if needed
          const resolveFilePath = (filePath: string): string => {
            if (path.isAbsolute(filePath)) {
              return filePath;
            }
            return workingDirectory ? path.join(workingDirectory, filePath) : filePath;
          };

          let result: PDFExecutionResult;

          switch (operation) {
            case 'create': {
              const createOutput = output ? resolveFilePath(output) : (file ? resolveFilePath(file) : undefined);
              if (!createOutput) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Create operation requires output or file parameter' }],
                };
              }
              result = await createPDF(createOutput, content || 'Hello World');
              break;
            }

            case 'get-info':
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: get-info operation requires file parameter' }],
                };
              }
              result = await getPDFInfo(resolveFilePath(file));
              break;

            case 'extracttext':
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Extracttext operation requires file parameter' }],
                };
              }
              result = await extractText(resolveFilePath(file), pages);
              break;

            case 'search':
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Search operation requires file parameter' }],
                };
              }
              if (!query) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Search operation requires a query parameter' }],
                };
              }
              result = await searchText(resolveFilePath(file), query, pages);
              break;

            case 'merge': {
              if (!sources || sources.length === 0) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Merge operation requires sources parameter' }],
                };
              }
              const mergeOutput = output ? resolveFilePath(output) : (file ? resolveFilePath(file) : undefined);
              if (!mergeOutput) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Merge operation requires output parameter' }],
                };
              }
              const resolvedSources = sources.map(resolveFilePath);
              result = await mergePDFs(resolvedSources, mergeOutput);
              break;
            }

            case 'split':
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Split operation requires file parameter' }],
                };
              }
              result = await splitPDF(
                resolveFilePath(file),
                pages,
                output ? resolveFilePath(output) : undefined
              );
              break;

            case 'render':
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Render operation requires file parameter' }],
                };
              }
              result = await renderPage(
                resolveFilePath(file),
                page ?? 1,
                maxDimension ?? 1800,
                output ? resolveFilePath(output) : undefined
              );
              break;

            case 'to-images':
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: to-images operation requires file parameter' }],
                };
              }
              result = await renderPdfToImages(
                resolveFilePath(file),
                pages,
                outputDirectory ? resolveFilePath(outputDirectory) : undefined,
                maxDimension ?? 1800
              );
              break;

            default:
              return {
                content: [{ type: 'text' as const, text: `Error: Unsupported operation: ${operation}` }],
              };
          }

          const resultText = formatResultForLLM(result);

          if (result.imageBase64) {
            return {
              content: [
                { type: 'text' as const, text: resultText },
                { type: 'image' as const, data: result.imageBase64, mimeType: 'image/png' as const },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: resultText,
              },
            ],
          };
        }
      ),
    ],
  });
}

/**
 * Export the PDF MCP server instance
 */
export const pdfMcpServer = createPdfMcpServer();
