/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * XLSX MCP Server - Excel file analysis tool
 *
 * Core operation:
 * - get-info: Analyze Excel file structure and return metadata
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { existsSync } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

/**
 * Sheet info
 */
interface SheetInfo {
  /** Sheet name */
  name: string;
  /** Sheet index (1-based) */
  index: number;
  /** Row count (approximate, based on dimension) */
  rowCount: number;
  /** Column count (approximate, based on dimension) */
  columnCount: number;
  /** Last column letter (e.g., "Z", "AA", "XFD") */
  lastColumn: string;
  /** Whether sheet is hidden */
  isHidden: boolean;
  /** Whether sheet has data */
  hasData: boolean;
}

/**
 * Excel file analysis result
 */
interface XLSXAnalysisResult {
  success: boolean;
  operation: string;
  filePath?: string;
  /** Total sheet count */
  sheetCount?: number;
  /** Sheet information */
  sheets?: SheetInfo[];
  /** Whether workbook has shared strings */
  hasSharedStrings?: boolean;
  /** Whether workbook has styles */
  hasStyles?: boolean;
  /** Whether workbook has formulas */
  hasFormulas?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Convert column index to Excel column letter (0-based)
 */
function numToExcelCol(n: number): string {
  let result = '';
  n += 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Parse column letter to 0-based index
 */
function excelColToNum(col: string): number {
  let result = 0;
  for (const char of col.toUpperCase()) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

/**
 * Extract row and column from cell reference (e.g., "A1" -> { row: 1, col: 0 })
 */
function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    col: excelColToNum(match[1]),
    row: parseInt(match[2], 10),
  };
}

/**
 * Get info about an Excel file
 */
function getInfo(xlsxFile: string): XLSXAnalysisResult {
  try {
    if (!existsSync(xlsxFile)) {
      return {
        success: false,
        operation: 'get-info',
        filePath: xlsxFile,
        error: `File not found: ${xlsxFile}`,
      };
    }

    const zip = new AdmZip(xlsxFile);
    const entries = zip.getEntries();

    // Check for key components
    const hasSharedStrings = entries.some((e) => e.entryName === 'xl/sharedStrings.xml');
    const hasStyles = entries.some((e) => e.entryName === 'xl/styles.xml');

    // Parse workbook.xml to get sheet names
    const workbookEntry = entries.find((e) => e.entryName === 'xl/workbook.xml');
    if (!workbookEntry) {
      return {
        success: false,
        operation: 'get-info',
        filePath: xlsxFile,
        error: 'Invalid XLSX file: missing workbook.xml',
      };
    }

    const workbookXml = workbookEntry.getData().toString('utf-8');

    // Extract sheet names from workbook.xml
    const sheetMatches = [...workbookXml.matchAll(/<sheet[^>]+name="([^"]+)"[^>]*(?:state="([^"]+)")?[^>]*\/>/gi)];
    const sheetNames: Array<{ name: string; isHidden: boolean }> = [];

    for (const match of sheetMatches) {
      const fullMatch = match[0];
      const name = match[1];
      // Check for state attribute separately
      const stateMatch = fullMatch.match(/state="([^"]+)"/i);
      const state = stateMatch ? stateMatch[1] : '';
      sheetNames.push({
        name,
        isHidden: state === 'hidden' || state === 'veryHidden',
      });
    }

    // Parse each sheet to get dimensions
    const sheets: SheetInfo[] = [];
    let hasFormulas = false;

    for (let i = 0; i < sheetNames.length; i++) {
      const sheetEntry = entries.find((e) => e.entryName === `xl/worksheets/sheet${i + 1}.xml`);

      let rowCount = 0;
      let columnCount = 0;
      let lastColumn = 'A';
      let hasData = false;

      if (sheetEntry) {
        const sheetXml = sheetEntry.getData().toString('utf-8');

        // Check for formulas
        if (sheetXml.includes('<f>') || sheetXml.includes('<f ')) {
          hasFormulas = true;
        }

        // Try to get dimension
        const dimMatch = sheetXml.match(/<dimension\s+ref="([^"]+)"/i);
        if (dimMatch) {
          const dimRef = dimMatch[1];
          // Dimension can be "A1" or "A1:XFD1048576"
          const parts = dimRef.split(':');
          if (parts.length === 2) {
            const start = parseCellRef(parts[0]);
            const end = parseCellRef(parts[1]);
            if (start && end) {
              rowCount = end.row - start.row + 1;
              columnCount = end.col - start.col + 1;
              lastColumn = numToExcelCol(end.col);
              hasData = true;
            }
          } else if (parts.length === 1) {
            // Single cell means one cell of data
            const cell = parseCellRef(parts[0]);
            if (cell) {
              rowCount = cell.row;
              columnCount = cell.col + 1;
              lastColumn = numToExcelCol(cell.col);
              hasData = cell.row > 0 || cell.col > 0;
            }
          }
        }

        // If no dimension, try to count rows
        if (rowCount === 0) {
          const rowMatches = sheetXml.match(/<row\s/gi);
          if (rowMatches) {
            rowCount = rowMatches.length;
            hasData = rowCount > 0;
          }
        }
      }

      sheets.push({
        name: sheetNames[i].name,
        index: i + 1,
        rowCount,
        columnCount,
        lastColumn,
        isHidden: sheetNames[i].isHidden,
        hasData,
      });
    }

    return {
      success: true,
      operation: 'get-info',
      filePath: xlsxFile,
      sheetCount: sheets.length,
      sheets,
      hasSharedStrings,
      hasStyles,
      hasFormulas,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'get-info',
      filePath: xlsxFile,
      error: `Failed to analyze Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Format get-info result for LLM consumption
 */
function formatGetInfoResult(result: XLSXAnalysisResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [
    `# Excel File Analysis`,
    ``,
    `**File**: ${result.filePath}`,
    `**Sheet Count**: ${result.sheetCount}`,
    ``,
    `## Features`,
    `- Shared Strings: ${result.hasSharedStrings ? 'Yes' : 'No'}`,
    `- Styles: ${result.hasStyles ? 'Yes' : 'No'}`,
    `- Formulas: ${result.hasFormulas ? 'Yes' : 'No'}`,
    ``,
    `## Sheets`,
  ];

  if (result.sheets) {
    for (const sheet of result.sheets) {
      const visibility = sheet.isHidden ? ' (Hidden)' : '';
      const dataInfo = sheet.hasData
        ? `${sheet.rowCount} rows × ${sheet.columnCount} columns (A-${sheet.lastColumn})`
        : 'Empty';
      lines.push(`### ${sheet.index}. ${sheet.name}${visibility}`);
      lines.push(`- Data: ${dataInfo}`);
      lines.push(``);
    }
  }

  return lines.join('\n');
}

/**
 * Create XLSX MCP server
 */
export const xlsxMcpServer = createSdkMcpServer({
  name: 'xlsx',
  version: '1.0.0',
  tools: [
    tool(
      'xlsx',
      `Excel file analysis tool.

## Operation

### get-info
Analyze Excel file structure and return metadata:
- Sheet names, dimensions, and visibility
- Whether workbook has formulas, styles, shared strings
- Row and column counts for each sheet

## Example Usage

Get file info:
   operation: "get-info"
   xlsxFile: "data.xlsx"`,
      {
        operation: z.enum(['get-info'])
          .describe('Operation type'),
        xlsxFile: z.string()
          .describe('Excel file path (.xlsx)'),
      },
      async ({ operation, xlsxFile }) => {
        switch (operation) {
          case 'get-info': {
            const result = getInfo(xlsxFile);
            return {
              content: [{ type: 'text' as const, text: formatGetInfoResult(result) }],
            };
          }

          default:
            return {
              content: [{ type: 'text' as const, text: `Error: Unsupported operation: ${operation}` }],
            };
        }
      }
    ),
  ],
});
