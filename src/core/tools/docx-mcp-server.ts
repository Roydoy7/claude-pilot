/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * DOCX MCP Server - Word document info extraction tool
 * Provides document metadata, statistics, and structure analysis
 *
 * For format conversion (DOCX → PDF, TXT, etc.), use the convert tool instead.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { existsSync, statSync } from 'fs';
import AdmZip from 'adm-zip';

/**
 * Document metadata
 */
interface DocxMetadata {
  title?: string;
  subject?: string;
  creator?: string;
  keywords?: string;
  description?: string;
  lastModifiedBy?: string;
  revision?: string;
  created?: string;
  modified?: string;
  category?: string;
}

/**
 * Document statistics
 */
interface DocxStats {
  pages?: number;
  words?: number;
  characters?: number;
  charactersWithSpaces?: number;
  paragraphs?: number;
  lines?: number;
}

/**
 * Document structure info
 */
interface DocxStructure {
  hasToc: boolean;
  hasImages: boolean;
  hasTables: boolean;
  hasCharts: boolean;
  hasHeaderFooter: boolean;
  hasComments: boolean;
  hasTrackedChanges: boolean;
  imageCount: number;
  tableCount: number;
}

/**
 * DOCX analysis result
 */
interface DocxAnalysisResult {
  success: boolean;
  operation: string;
  filePath: string;
  fileSize?: number;
  metadata?: DocxMetadata;
  stats?: DocxStats;
  structure?: DocxStructure;
  error?: string;
  executionTime: number;
}

/**
 * Extract text from XML content
 */
function extractTextFromXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Parse core.xml for metadata
 */
function parseCoreXml(xml: string): DocxMetadata {
  const metadata: DocxMetadata = {};

  const extractValue = (tagName: string): string | undefined => {
    const regex = new RegExp(`<(?:dc:|cp:)?${tagName}[^>]*>([^<]*)</(?:dc:|cp:)?${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? extractTextFromXml(match[1]) : undefined;
  };

  metadata.title = extractValue('title');
  metadata.subject = extractValue('subject');
  metadata.creator = extractValue('creator');
  metadata.keywords = extractValue('keywords');
  metadata.description = extractValue('description');
  metadata.lastModifiedBy = extractValue('lastModifiedBy');
  metadata.revision = extractValue('revision');
  metadata.created = extractValue('created');
  metadata.modified = extractValue('modified');
  metadata.category = extractValue('category');

  return metadata;
}

/**
 * Parse app.xml for document statistics
 */
function parseAppXml(xml: string): DocxStats {
  const stats: DocxStats = {};

  const extractNumber = (tagName: string): number | undefined => {
    const regex = new RegExp(`<${tagName}[^>]*>(\\d+)</`, 'i');
    const match = xml.match(regex);
    return match ? parseInt(match[1], 10) : undefined;
  };

  stats.pages = extractNumber('Pages');
  stats.words = extractNumber('Words');
  stats.characters = extractNumber('Characters');
  stats.charactersWithSpaces = extractNumber('CharactersWithSpaces');
  stats.paragraphs = extractNumber('Paragraphs');
  stats.lines = extractNumber('Lines');

  return stats;
}

/**
 * Analyze document structure
 */
function analyzeStructure(zip: AdmZip): DocxStructure {
  const structure: DocxStructure = {
    hasToc: false,
    hasImages: false,
    hasTables: false,
    hasCharts: false,
    hasHeaderFooter: false,
    hasComments: false,
    hasTrackedChanges: false,
    imageCount: 0,
    tableCount: 0,
  };

  const entries = zip.getEntries();

  // Check for images
  const imageEntries = entries.filter((e) =>
    e.entryName.startsWith('word/media/') &&
    /\.(png|jpg|jpeg|gif|bmp|tiff|emf|wmf)$/i.test(e.entryName)
  );
  structure.hasImages = imageEntries.length > 0;
  structure.imageCount = imageEntries.length;

  // Check document.xml for structure elements
  const documentEntry = entries.find((e) => e.entryName === 'word/document.xml');
  if (documentEntry) {
    const documentXml = documentEntry.getData().toString('utf-8');

    // Check for table of contents
    structure.hasToc = documentXml.includes('<w:sdt') && documentXml.includes('TOC');

    // Check for tables
    const tableMatches = documentXml.match(/<w:tbl\b/g);
    structure.hasTables = (tableMatches?.length ?? 0) > 0;
    structure.tableCount = tableMatches?.length ?? 0;

    // Check for comments
    structure.hasComments = entries.some((e) => e.entryName === 'word/comments.xml');

    // Check for tracked changes
    structure.hasTrackedChanges =
      documentXml.includes('<w:ins ') ||
      documentXml.includes('<w:del ') ||
      documentXml.includes('<w:moveFrom') ||
      documentXml.includes('<w:moveTo');
  }

  // Check for header/footer
  structure.hasHeaderFooter = entries.some(
    (e) => e.entryName.startsWith('word/header') || e.entryName.startsWith('word/footer')
  );

  // Check for charts
  structure.hasCharts = entries.some((e) => e.entryName.startsWith('word/charts/'));

  return structure;
}

/**
 * Get info about a DOCX file
 */
function getInfo(docxFile: string): DocxAnalysisResult {
  const startTime = Date.now();

  if (!existsSync(docxFile)) {
    return {
      success: false,
      operation: 'get-info',
      filePath: docxFile,
      error: `File not found: ${docxFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const fileStats = statSync(docxFile);
    const zip = new AdmZip(docxFile);
    const entries = zip.getEntries();

    // Parse core.xml for metadata
    let metadata: DocxMetadata = {};
    const coreEntry = entries.find((e) => e.entryName === 'docProps/core.xml');
    if (coreEntry) {
      const coreXml = coreEntry.getData().toString('utf-8');
      metadata = parseCoreXml(coreXml);
    }

    // Parse app.xml for statistics
    let docStats: DocxStats = {};
    const appEntry = entries.find((e) => e.entryName === 'docProps/app.xml');
    if (appEntry) {
      const appXml = appEntry.getData().toString('utf-8');
      docStats = parseAppXml(appXml);
    }

    // Analyze document structure
    const structure = analyzeStructure(zip);

    return {
      success: true,
      operation: 'get-info',
      filePath: docxFile,
      fileSize: fileStats.size,
      metadata,
      stats: docStats,
      structure,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'get-info',
      filePath: docxFile,
      error: `Failed to analyze DOCX file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Format get-info result for LLM consumption
 */
function formatGetInfoResult(result: DocxAnalysisResult): string {
  if (!result.success) {
    return `**Status**: Failed\n\n## Error\n${result.error}`;
  }

  const lines: string[] = [
    `# Word Document Analysis`,
    ``,
    `**Status**: Success`,
    `**File**: ${result.filePath}`,
    `**File Size**: ${result.fileSize ? Math.round(result.fileSize / 1024) + ' KB' : 'Unknown'}`,
    `**Execution Time**: ${result.executionTime}ms`,
  ];

  // Metadata
  if (result.metadata) {
    const meta = result.metadata;
    const hasMetadata = Object.values(meta).some((v) => v !== undefined);
    if (hasMetadata) {
      lines.push(``, `## Metadata`);
      if (meta.title) lines.push(`- **Title**: ${meta.title}`);
      if (meta.subject) lines.push(`- **Subject**: ${meta.subject}`);
      if (meta.creator) lines.push(`- **Author**: ${meta.creator}`);
      if (meta.lastModifiedBy) lines.push(`- **Last Modified By**: ${meta.lastModifiedBy}`);
      if (meta.created) lines.push(`- **Created**: ${meta.created}`);
      if (meta.modified) lines.push(`- **Modified**: ${meta.modified}`);
      if (meta.keywords) lines.push(`- **Keywords**: ${meta.keywords}`);
      if (meta.category) lines.push(`- **Category**: ${meta.category}`);
      if (meta.revision) lines.push(`- **Revision**: ${meta.revision}`);
    }
  }

  // Statistics
  if (result.stats) {
    const stats = result.stats;
    const hasStats = Object.values(stats).some((v) => v !== undefined);
    if (hasStats) {
      lines.push(``, `## Statistics`);
      if (stats.pages !== undefined) lines.push(`- **Pages**: ${stats.pages}`);
      if (stats.words !== undefined) lines.push(`- **Words**: ${stats.words.toLocaleString()}`);
      if (stats.characters !== undefined) lines.push(`- **Characters**: ${stats.characters.toLocaleString()}`);
      if (stats.paragraphs !== undefined) lines.push(`- **Paragraphs**: ${stats.paragraphs}`);
      if (stats.lines !== undefined) lines.push(`- **Lines**: ${stats.lines}`);
    }
  }

  // Structure
  if (result.structure) {
    const struct = result.structure;
    lines.push(``, `## Document Structure`);
    lines.push(`- **Has Table of Contents**: ${struct.hasToc ? 'Yes' : 'No'}`);
    lines.push(`- **Has Images**: ${struct.hasImages ? `Yes (${struct.imageCount})` : 'No'}`);
    lines.push(`- **Has Tables**: ${struct.hasTables ? `Yes (${struct.tableCount})` : 'No'}`);
    lines.push(`- **Has Charts**: ${struct.hasCharts ? 'Yes' : 'No'}`);
    lines.push(`- **Has Header/Footer**: ${struct.hasHeaderFooter ? 'Yes' : 'No'}`);
    lines.push(`- **Has Comments**: ${struct.hasComments ? 'Yes' : 'No'}`);
    lines.push(`- **Has Tracked Changes**: ${struct.hasTrackedChanges ? 'Yes' : 'No'}`);
  }

  return lines.join('\n');
}

/**
 * Create DOCX MCP server
 */
export const docxMcpServer = createSdkMcpServer({
  name: 'docx',
  version: '1.0.0',
  tools: [
    tool(
      'docx',
      `Word document (.docx) info extraction tool.

Analyze DOCX file and return:
- Metadata (title, author, dates, etc.)
- Statistics (pages, words, characters, paragraphs)
- Structure (has TOC, images, tables, comments, tracked changes)

For format conversion (DOCX → PDF, TXT, etc.), use the convert tool instead.

## Example

Get document info:
   operation: "get-info"
   docxFile: "report.docx"`,
      {
        operation: z.enum(['get-info']).describe('Operation type (only get-info is supported)'),
        docxFile: z.string().describe('DOCX file path'),
      },
      async ({ operation, docxFile }) => {
        switch (operation) {
          case 'get-info': {
            const result = getInfo(docxFile);
            return {
              content: [{ type: 'text' as const, text: formatGetInfoResult(result) }],
            };
          }

          default:
            return {
              content: [{ type: 'text' as const, text: `Error: Unsupported operation: ${operation}. For format conversion, use the convert tool.` }],
            };
        }
      }
    ),
  ],
});
