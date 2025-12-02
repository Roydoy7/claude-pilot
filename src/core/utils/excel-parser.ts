/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Excel Parser - Parse xlsx files and extract formulas/values
 */

import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import crypto from 'crypto';
import fs from 'fs/promises';

export interface ExcelSheet {
  name: string;
  formulas: Map<string, string>;
  values: Map<string, any>;
}

export interface ExcelParseResult {
  sheets: ExcelSheet[];
  contentHash: string;
  isLocked: boolean;
}

export class ExcelParser {
  /**
   * Parse Excel file and extract formulas and values
   */
  async parseExcel(filePath: string): Promise<ExcelParseResult> {
    // Check if file is locked
    const isLocked = await this.isFileLocked(filePath);
    if (isLocked) {
      return {
        sheets: [],
        contentHash: '',
        isLocked: true
      };
    }

    try {
      // Unzip xlsx file
      const zip = new AdmZip(filePath);

      // Read workbook.xml to get sheet names
      const workbookXml = zip.readAsText('xl/workbook.xml');
      const workbook = await parseStringPromise(workbookXml);
      const sheetNames = this.extractSheetNames(workbook);

      // Compute content hash first (directly from XML files - much faster!)
      const contentHash = this.computeContentHash(zip);

      // Parse each sheet (only needed for detailed comparison)
      const sheets: ExcelSheet[] = [];
      for (let i = 0; i < sheetNames.length; i++) {
        const sheetXml = zip.readAsText(`xl/worksheets/sheet${i + 1}.xml`);
        const sheet = await this.parseSheet(sheetXml, sheetNames[i]);
        sheets.push(sheet);
      }

      return {
        sheets,
        contentHash,
        isLocked: false
      };
    } catch (error) {
      console.error('Failed to parse Excel:', error);
      throw error;
    }
  }

  /**
   * Check if file is locked by Excel
   */
  private async isFileLocked(filePath: string): Promise<boolean> {
    try {
      const fd = await fs.open(filePath, 'r+');
      await fd.close();
      return false;
    } catch (error: any) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        return true;
      }
      return false;
    }
  }

  /**
   * Parse single sheet
   */
  private async parseSheet(xml: string, name: string): Promise<ExcelSheet> {
    const data = await parseStringPromise(xml);
    const formulas = new Map<string, string>();
    const values = new Map<string, any>();

    // Extract worksheet -> sheetData -> row -> c (cells)
    const rows = data?.worksheet?.sheetData?.[0]?.row || [];

    for (const row of rows) {
      const cells = row.c || [];

      for (const cell of cells) {
        const cellRef = cell.$.r; // e.g., "A1"

        // Extract formula
        if (cell.f && cell.f[0]) {
          const formula = typeof cell.f[0] === 'string' ? cell.f[0] : cell.f[0]._;
          if (formula) {
            formulas.set(cellRef, formula);
          }
        }

        // Extract value
        if (cell.v && cell.v[0]) {
          values.set(cellRef, cell.v[0]);
        }
      }
    }

    return { name, formulas, values };
  }

  /**
   * Compute content hash by hashing worksheet XML files directly
   * Much faster than parsing - formatting changes don't affect worksheet XML
   */
  private computeContentHash(zip: AdmZip): string {
    const hash = crypto.createHash('sha256');

    // Hash all worksheet XML files (contains formulas and values)
    const entries = zip.getEntries();
    const worksheetFiles = entries
      .filter(entry => entry.entryName.startsWith('xl/worksheets/sheet') && entry.entryName.endsWith('.xml'))
      .sort((a, b) => a.entryName.localeCompare(b.entryName)); // Sort for consistent hashing

    for (const entry of worksheetFiles) {
      hash.update(entry.getData());
    }

    // Also hash shared strings if exists (contains cell text values)
    const sharedStrings = zip.getEntry('xl/sharedStrings.xml');
    if (sharedStrings) {
      hash.update(sharedStrings.getData());
    }

    return hash.digest('hex');
  }

  /**
   * Extract sheet names from workbook
   */
  private extractSheetNames(workbook: any): string[] {
    const sheets = workbook?.workbook?.sheets?.[0]?.sheet || [];
    return sheets.map((s: any) => s.$.name);
  }

  /**
   * Compare two Excel contents and generate change description
   */
  compareExcel(
    oldSheets: ExcelSheet[],
    newSheets: ExcelSheet[]
  ): { changedSheets: string[]; details: string } {
    const changedSheets: string[] = [];
    const details: string[] = [];

    // Compare by sheet
    for (let i = 0; i < Math.max(oldSheets.length, newSheets.length); i++) {
      const oldSheet = oldSheets[i];
      const newSheet = newSheets[i];

      if (!oldSheet) {
        changedSheets.push(newSheet.name);
        details.push(`- Sheet "${newSheet.name}" was added`);
        continue;
      }

      if (!newSheet) {
        changedSheets.push(oldSheet.name);
        details.push(`- Sheet "${oldSheet.name}" was removed`);
        continue;
      }

      // Compare formula changes
      const formulaChanges = this.compareMap(oldSheet.formulas, newSheet.formulas);
      if (formulaChanges.length > 0) {
        changedSheets.push(newSheet.name);
        details.push(`- Sheet "${newSheet.name}": ${formulaChanges.length} formula(s) modified`);
      }

      // Compare value changes
      const valueChanges = this.compareMap(oldSheet.values, newSheet.values);
      if (valueChanges.length > 0) {
        changedSheets.push(newSheet.name);
        details.push(`- Sheet "${newSheet.name}": ${valueChanges.length} cell value(s) modified`);
      }
    }

    return {
      changedSheets: [...new Set(changedSheets)],
      details: details.join('\n')
    };
  }

  /**
   * Compare two maps and return changed keys
   */
  private compareMap<T>(oldMap: Map<string, T>, newMap: Map<string, T>): string[] {
    const changes: string[] = [];

    // Check modifications and deletions
    for (const [key, oldValue] of oldMap) {
      const newValue = newMap.get(key);
      if (newValue === undefined) {
        changes.push(key); // Deleted
      } else if (oldValue !== newValue) {
        changes.push(key); // Modified
      }
    }

    // Check additions
    for (const key of newMap.keys()) {
      if (!oldMap.has(key)) {
        changes.push(key);
      }
    }

    return changes;
  }
}
