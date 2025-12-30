/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Convert MCP Server - Document conversion tool
 * Uses LibreOffice headless for document format conversions
 * Uses Calibre for ebook format conversions
 * Uses markitdown for converting to Markdown
 * Uses pdf2docx for PDF to DOCX conversion
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * LibreOffice version for portable installation
 */
const LIBREOFFICE_VERSION = '25.2.3';

/**
 * LibreOffice paths configuration
 */
const LIBREOFFICE_PATHS = {
  // Portable version in packages folder
  portable: path.join(
    process.cwd(),
    'packages',
    `libreoffice-${LIBREOFFICE_VERSION}`,
    'App',
    'libreoffice',
    'program',
    'soffice.exe'
  ),
  // Alternative portable structure
  portableAlt: path.join(
    process.cwd(),
    'packages',
    `libreoffice-${LIBREOFFICE_VERSION}`,
    'program',
    'soffice.exe'
  ),
  // Standard installation paths
  programFiles: 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  programFilesX86: 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
};

/**
 * Calibre paths configuration
 * Note: Portable installer creates "Calibre Portable" subdirectory
 */
const CALIBRE_PATHS = {
  // Portable version in packages folder (highest priority)
  portable: path.join(
    process.cwd(),
    'packages',
    'calibre',
    'Calibre Portable',
    'Calibre',
    'ebook-convert.exe'
  ),
  // Standard installation paths
  programFiles: 'C:\\Program Files\\Calibre2\\ebook-convert.exe',
  programFilesX86: 'C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe',
};

/**
 * Ebook formats - Calibre ONLY
 * These formats require Calibre for proper conversion with images/formatting
 */
const EBOOK_FORMATS = [
  'azw', 'azw3', 'azw4', 'cbz', 'cbr', 'cbc', 'chm', 'djvu',
  'epub', 'fb2', 'fbz', 'lit', 'lrf', 'mobi', 'prc', 'pdb', 'pml', 'rb', 'snb', 'tcr',
] as const;

/**
 * Calibre supported input formats
 */
const CALIBRE_INPUT_FORMATS = [
  ...EBOOK_FORMATS,
  'docx', 'html', 'htmlz', 'odt', 'pdf', 'rtf', 'txt', 'txtz',
] as const;

/**
 * Calibre supported output formats
 */
const CALIBRE_OUTPUT_FORMATS = [
  'azw3', 'docx', 'epub', 'fb2', 'htmlz', 'lit', 'lrf', 'mobi', 'oeb',
  'pdb', 'pdf', 'pml', 'rb', 'rtf', 'snb', 'tcr', 'txt', 'txtz', 'zip',
] as const;

/**
 * Python version bundled with the application
 */
const PYTHON_VERSION = '3.13.11';

/**
 * LibreOffice supported input formats for conversion
 * Grouped by document type for clarity
 */
const LIBREOFFICE_INPUT_FORMATS = [
  // Word documents
  'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'htm',
  // Excel spreadsheets
  'xlsx', 'xls', 'ods', 'csv',
  // PowerPoint presentations
  'pptx', 'ppt', 'odp',
] as const;

/**
 * LibreOffice supported output formats by input type
 */
const LIBREOFFICE_WORD_OUTPUT = ['pdf', 'txt', 'html', 'odt', 'docx'] as const;
const LIBREOFFICE_EXCEL_OUTPUT = ['pdf', 'csv', 'html', 'xlsx', 'ods'] as const;
const LIBREOFFICE_PPTX_OUTPUT = ['pdf', 'png', 'jpg', 'odp', 'pptx'] as const;

/**
 * Word document formats
 */
const WORD_FORMATS = ['docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'htm'] as const;

/**
 * Excel spreadsheet formats
 */
const EXCEL_FORMATS = ['xlsx', 'xls', 'ods', 'csv'] as const;

/**
 * PowerPoint presentation formats
 */
const PPTX_FORMATS = ['pptx', 'ppt', 'odp'] as const;

/**
 * Supported input formats (combined)
 */
const INPUT_FORMATS = [
  // Word documents
  'docx', 'doc', 'odt', 'rtf',
  // Excel spreadsheets
  'xlsx', 'xls', 'ods', 'csv',
  // PowerPoint presentations
  'pptx', 'ppt', 'odp',
  // Web/Text
  'html', 'htm', 'txt',
  // Markdown
  'markdown', 'md',
  // Ebook (Calibre)
  'epub',
  // PDF (via pdf2docx/markitdown)
  'pdf',
] as const;

/**
 * Supported output formats
 */
const OUTPUT_FORMATS = [
  // Word documents
  'docx', 'odt',
  // Excel spreadsheets
  'xlsx', 'ods', 'csv',
  // PowerPoint presentations
  'pptx', 'odp',
  // Web/Text
  'html', 'txt',
  // Markdown
  'markdown', 'md',
  // PDF
  'pdf',
  // Images (from PPTX)
  'png', 'jpg',
  // Ebook (Calibre)
  'epub',
] as const;

/**
 * Conversion execution result
 */
interface ConvertExecutionResult {
  success: boolean;
  operation: string;
  inputFile: string;
  outputFile?: string;
  inputFormat?: string;
  outputFormat?: string;
  fileSize?: number;
  error?: string;
  executionTime: number;
  engine?: string;
}

/**
 * Find LibreOffice executable
 */
function findLibreOffice(): string | null {
  if (existsSync(LIBREOFFICE_PATHS.portable)) {
    return LIBREOFFICE_PATHS.portable;
  }
  if (existsSync(LIBREOFFICE_PATHS.portableAlt)) {
    return LIBREOFFICE_PATHS.portableAlt;
  }
  if (existsSync(LIBREOFFICE_PATHS.programFiles)) {
    return LIBREOFFICE_PATHS.programFiles;
  }
  if (existsSync(LIBREOFFICE_PATHS.programFilesX86)) {
    return LIBREOFFICE_PATHS.programFilesX86;
  }
  return null;
}

/**
 * Check if LibreOffice is installed
 */
function isLibreOfficeInstalled(): boolean {
  return findLibreOffice() !== null;
}

/**
 * Check if format is supported by LibreOffice as input
 */
function isLibreOfficeInputFormat(format: string): boolean {
  return LIBREOFFICE_INPUT_FORMATS.includes(format.toLowerCase() as typeof LIBREOFFICE_INPUT_FORMATS[number]);
}

/**
 * Check if input format is a Word document type
 */
function isWordFormat(format: string): boolean {
  return WORD_FORMATS.includes(format.toLowerCase() as typeof WORD_FORMATS[number]);
}

/**
 * Check if input format is an Excel spreadsheet type
 */
function isExcelFormat(format: string): boolean {
  return EXCEL_FORMATS.includes(format.toLowerCase() as typeof EXCEL_FORMATS[number]);
}

/**
 * Check if input format is a PowerPoint presentation type
 */
function isPptxFormat(format: string): boolean {
  return PPTX_FORMATS.includes(format.toLowerCase() as typeof PPTX_FORMATS[number]);
}

/**
 * Check if conversion can be done with LibreOffice
 * Validates that the input/output format combination is valid
 */
function canUseLibreOffice(inputFormat: string, outputFormat: string): boolean {
  if (!isLibreOfficeInstalled() || !isLibreOfficeInputFormat(inputFormat)) {
    return false;
  }

  const from = inputFormat.toLowerCase();
  const to = outputFormat.toLowerCase();

  // Word documents → PDF, TXT, HTML, ODT, DOCX
  if (isWordFormat(from)) {
    return LIBREOFFICE_WORD_OUTPUT.includes(to as typeof LIBREOFFICE_WORD_OUTPUT[number]);
  }

  // Excel spreadsheets → PDF, CSV, HTML, XLSX, ODS
  if (isExcelFormat(from)) {
    return LIBREOFFICE_EXCEL_OUTPUT.includes(to as typeof LIBREOFFICE_EXCEL_OUTPUT[number]);
  }

  // PowerPoint presentations → PDF, PNG, JPG, ODP, PPTX
  if (isPptxFormat(from)) {
    return LIBREOFFICE_PPTX_OUTPUT.includes(to as typeof LIBREOFFICE_PPTX_OUTPUT[number]);
  }

  return false;
}

/**
 * Get Calibre ebook-convert executable path
 */
function getCalibrePath(): string | null {
  // Check portable version first (highest priority)
  if (existsSync(CALIBRE_PATHS.portable)) {
    return CALIBRE_PATHS.portable;
  }
  // Check standard installation paths
  if (existsSync(CALIBRE_PATHS.programFiles)) {
    return CALIBRE_PATHS.programFiles;
  }
  if (existsSync(CALIBRE_PATHS.programFilesX86)) {
    return CALIBRE_PATHS.programFilesX86;
  }
  return null;
}

/**
 * Check if Calibre is installed
 */
function isCalibreInstalled(): boolean {
  return getCalibrePath() !== null;
}

/**
 * Check if format is supported by Calibre as input
 */
function isCalibreInputFormat(format: string): boolean {
  return CALIBRE_INPUT_FORMATS.includes(format.toLowerCase() as typeof CALIBRE_INPUT_FORMATS[number]);
}

/**
 * Check if format is supported by Calibre as output
 */
function isCalibreOutputFormat(format: string): boolean {
  return CALIBRE_OUTPUT_FORMATS.includes(format.toLowerCase() as typeof CALIBRE_OUTPUT_FORMATS[number]);
}

/**
 * Check if conversion can be done with Calibre
 */
function canUseCalibre(inputFormat: string, outputFormat: string): boolean {
  return isCalibreInstalled() && isCalibreInputFormat(inputFormat) && isCalibreOutputFormat(outputFormat);
}

/**
 * Check if format is an ebook format (requires Calibre)
 */
function isEbookFormat(format: string): boolean {
  return (EBOOK_FORMATS as readonly string[]).includes(format.toLowerCase());
}

/**
 * Check if conversion requires Calibre (ebook formats involved)
 */
function requiresCalibre(inputFormat: string, outputFormat: string): boolean {
  return isEbookFormat(inputFormat) || isEbookFormat(outputFormat);
}

/**
 * Execute Calibre ebook-convert command
 */
async function executeCalibre(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const calibrePath = getCalibrePath();

  if (!calibrePath) {
    return { stdout: '', stderr: 'Calibre is not installed', code: 1 };
  }

  return new Promise((resolve) => {
    // Use windowsVerbatimArguments to prevent shell interpretation of special characters
    const proc = spawn(calibrePath, args, {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    proc.on('error', (error) => {
      resolve({ stdout, stderr: error.message, code: 1 });
    });
  });
}

/**
 * Convert document using Calibre
 */
async function convertWithCalibre(
  inputFile: string,
  outputFile: string,
  options?: {
    pdfPageSize?: string;
    pdfFontSize?: number;
    cover?: string;
    title?: string;
    authors?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const args: string[] = [inputFile, outputFile];

  // Add PDF options
  if (options?.pdfPageSize) {
    args.push('--pdf-page-size', options.pdfPageSize);
  }

  if (options?.pdfFontSize) {
    args.push('--pdf-default-font-size', options.pdfFontSize.toString());
  }

  // Add metadata options
  if (options?.cover) {
    args.push('--cover', options.cover);
  }

  if (options?.title) {
    args.push('--title', options.title);
  }

  if (options?.authors) {
    args.push('--authors', options.authors);
  }

  const { stderr, code } = await executeCalibre(args);

  if (code !== 0) {
    return { success: false, error: `Calibre conversion failed: ${stderr}` };
  }

  return { success: true };
}

/**
 * Convert document using LibreOffice headless
 */
async function convertWithLibreOffice(
  inputFile: string,
  outputFormat: string,
  outputDir: string
): Promise<{ success: boolean; outputFile?: string; error?: string }> {
  const libreOfficePath = findLibreOffice();

  if (!libreOfficePath) {
    return {
      success: false,
      error: 'LibreOffice not found. Please install LibreOffice or run: npm run setup:libreoffice',
    };
  }

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  // Build LibreOffice command
  const command = `"${libreOfficePath}" --headless --convert-to ${outputFormat} --outdir "${outputDir}" "${inputFile}"`;

  try {
    await execAsync(command, { timeout: 120000 }); // 2 minute timeout
  } catch (execError) {
    const errorMessage = execError instanceof Error ? execError.message : String(execError);
    return {
      success: false,
      error: `LibreOffice conversion failed: ${errorMessage}`,
    };
  }

  // Determine output file path
  const baseName = path.basename(inputFile, path.extname(inputFile));
  const outputFile = path.join(outputDir, `${baseName}.${outputFormat}`);

  if (!existsSync(outputFile)) {
    return {
      success: false,
      error: `Conversion completed but output file not found: ${outputFile}`,
    };
  }

  return { success: true, outputFile };
}

/**
 * Get Python executable path
 */
function getPythonPath(): string | null {
  // Check embedded Python in packages folder
  const embeddedPython = path.join(
    process.cwd(),
    'packages',
    `python-${PYTHON_VERSION}-embed-amd64`,
    'python.exe'
  );

  if (existsSync(embeddedPython)) {
    return embeddedPython;
  }

  // Check in resources folder (for packaged app)
  const resourcesPython = path.join(
    process.resourcesPath || process.cwd(),
    `python-${PYTHON_VERSION}-embed-amd64`,
    'python.exe'
  );

  if (existsSync(resourcesPython)) {
    return resourcesPython;
  }

  // Python not found
  return null;
}

/**
 * Convert PDF to DOCX using pdf2docx Python library
 */
async function convertPdfToDocx(
  inputFile: string,
  outputFile: string
): Promise<{ success: boolean; error?: string }> {
  const pythonPath = getPythonPath();

  if (!pythonPath) {
    return {
      success: false,
      error: 'Python is not installed. Run "npm run setup:python" to install it.',
    };
  }

  // Python script to convert PDF to DOCX
  const pythonScript = `
from pdf2docx import Converter
import sys

pdf_file = sys.argv[1]
docx_file = sys.argv[2]

cv = Converter(pdf_file)
cv.convert(docx_file)
cv.close()
print("Conversion successful")
`;

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['-c', pythonScript, inputFile, outputFile], {
      windowsHide: true,
    });

    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: `pdf2docx conversion failed: ${stderr}`,
        });
      }
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to execute Python: ${error.message}`,
      });
    });
  });
}

/**
 * Formats supported by markitdown for conversion to Markdown
 */
const MARKITDOWN_SUPPORTED_FORMATS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'html', 'htm'] as const;

/**
 * Convert document to Markdown using markitdown Python library
 * Supports: PDF, DOCX, PPTX, XLSX, HTML
 */
async function convertToMarkdown(
  inputFile: string,
  outputFile: string
): Promise<{ success: boolean; error?: string }> {
  const pythonPath = getPythonPath();

  if (!pythonPath) {
    return {
      success: false,
      error: 'Python is not installed. Run "npm run setup:python" to install it.',
    };
  }

  // Python script to convert to Markdown using markitdown
  const pythonScript = `
from markitdown import MarkItDown
import sys

input_file = sys.argv[1]
output_file = sys.argv[2]

md = MarkItDown()
result = md.convert(input_file)

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(result.text_content)

print("Conversion successful")
`;

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['-c', pythonScript, inputFile, outputFile], {
      windowsHide: true,
    });

    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: `markitdown conversion failed: ${stderr}`,
        });
      }
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to execute Python: ${error.message}`,
      });
    });
  });
}

/**
 * Check if format is supported by markitdown
 */
function isMarkitdownSupported(format: string): boolean {
  const normalizedFormat = format.toLowerCase();
  return MARKITDOWN_SUPPORTED_FORMATS.includes(normalizedFormat as typeof MARKITDOWN_SUPPORTED_FORMATS[number]);
}

/**
 * Detect format from file extension
 */
function detectFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().slice(1);

  const formatMap: Record<string, string> = {
    md: 'markdown',
    tex: 'latex',
    htm: 'html',
  };

  return formatMap[ext] || ext;
}

/**
 * Get output extension for format
 */
function getOutputExtension(format: string): string {
  const extMap: Record<string, string> = {
    markdown: 'md',
    latex: 'tex',
  };

  return extMap[format] || format;
}

/**
 * Convert document - main conversion logic
 */
async function convertDocument(
  inputFile: string,
  outputFile: string,
  inputFormat?: string,
  outputFormat?: string,
  options?: {
    pdfFontSize?: number;
  }
): Promise<ConvertExecutionResult> {
  const startTime = Date.now();

  // Check for problematic Unicode characters in filename
  // Smart quotes and other special characters may be corrupted during parameter passing
  const problematicChars = /[\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/;
  const fileName = path.basename(inputFile);
  if (problematicChars.test(fileName)) {
    const charMap: Record<string, string> = {
      '\u2018': "' (left single quote)",
      '\u2019': "' (right single quote)",
      '\u201C': '" (left double quote)',
      '\u201D': '" (right double quote)',
      '\u2013': '– (en dash)',
      '\u2014': '— (em dash)',
      '\u2026': '… (ellipsis)',
    };
    const foundChars = fileName.match(problematicChars);
    const charDesc = foundChars
      ? [...new Set(foundChars)].map((c) => charMap[c] || `U+${c.charCodeAt(0).toString(16).toUpperCase()}`).join(', ')
      : 'special Unicode characters';
    return {
      success: false,
      operation: 'convert',
      inputFile,
      error: `Filename contains special Unicode characters that may cause issues: ${charDesc}. Please rename the file to use standard ASCII characters (e.g., replace smart quotes ' ' with regular quotes ').`,
      executionTime: Date.now() - startTime,
    };
  }

  // Verify input file exists
  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'convert',
      inputFile,
      error: `Input file not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  // Detect formats if not specified
  const fromFormat = inputFormat || detectFormat(inputFile);
  const toFormat = outputFormat || detectFormat(outputFile);

  // Route 1: Ebook formats - Calibre ONLY (no fallback)
  if (requiresCalibre(fromFormat, toFormat)) {
    if (!isCalibreInstalled()) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: `Ebook format conversion (${fromFormat} → ${toFormat}) requires Calibre. Please install Calibre from https://calibre-ebook.com`,
        executionTime: Date.now() - startTime,
      };
    }

    if (!canUseCalibre(fromFormat, toFormat)) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: `Calibre does not support this conversion: ${fromFormat} → ${toFormat}`,
        executionTime: Date.now() - startTime,
      };
    }

    const calibreResult = await convertWithCalibre(inputFile, outputFile, {
      pdfFontSize: options?.pdfFontSize,
    });
    if (!calibreResult.success) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: calibreResult.error,
        executionTime: Date.now() - startTime,
      };
    }

    const stats = await fs.stat(outputFile);
    return {
      success: true,
      operation: 'convert',
      inputFile,
      outputFile,
      inputFormat: fromFormat,
      outputFormat: toFormat,
      fileSize: stats.size,
      executionTime: Date.now() - startTime,
      engine: 'Calibre',
    };
  }

  // Route 2: Handle conversion to Markdown using markitdown for supported formats
  const isMarkdownOutput = toFormat === 'markdown' || toFormat === 'md';
  if (isMarkdownOutput && isMarkitdownSupported(fromFormat)) {
    const mdResult = await convertToMarkdown(inputFile, outputFile);
    if (!mdResult.success) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: mdResult.error,
        executionTime: Date.now() - startTime,
      };
    }

    const stats = await fs.stat(outputFile);
    return {
      success: true,
      operation: 'convert',
      inputFile,
      outputFile,
      inputFormat: fromFormat,
      outputFormat: toFormat,
      fileSize: stats.size,
      executionTime: Date.now() - startTime,
      engine: 'markitdown',
    };
  }

  // Route 3: Handle PDF input using pdf2docx
  if (fromFormat === 'pdf') {
    if (toFormat !== 'docx') {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: `PDF can only be converted to DOCX format. For other formats, first convert PDF to DOCX, then convert DOCX to ${toFormat}.`,
        executionTime: Date.now() - startTime,
      };
    }

    const pdfResult = await convertPdfToDocx(inputFile, outputFile);
    if (!pdfResult.success) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: pdfResult.error,
        executionTime: Date.now() - startTime,
      };
    }

    const stats = await fs.stat(outputFile);
    return {
      success: true,
      operation: 'convert',
      inputFile,
      outputFile,
      inputFormat: fromFormat,
      outputFormat: toFormat,
      fileSize: stats.size,
      executionTime: Date.now() - startTime,
      engine: 'pdf2docx',
    };
  }

  // Route 4: Use LibreOffice for document format conversions
  if (canUseLibreOffice(fromFormat, toFormat)) {
    const outputDir = path.dirname(outputFile);
    const loResult = await convertWithLibreOffice(inputFile, toFormat, outputDir);

    if (!loResult.success) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: loResult.error,
        executionTime: Date.now() - startTime,
      };
    }

    // LibreOffice generates file with same basename in output dir
    const actualOutputFile = loResult.outputFile || outputFile;

    // If the generated file has a different name, rename it
    if (actualOutputFile !== outputFile && existsSync(actualOutputFile)) {
      await fs.rename(actualOutputFile, outputFile);
    }

    const stats = await fs.stat(outputFile);
    return {
      success: true,
      operation: 'convert',
      inputFile,
      outputFile,
      inputFormat: fromFormat,
      outputFormat: toFormat,
      fileSize: stats.size,
      executionTime: Date.now() - startTime,
      engine: 'LibreOffice',
    };
  }

  // No suitable conversion engine found
  return {
    success: false,
    operation: 'convert',
    inputFile,
    outputFile,
    inputFormat: fromFormat,
    outputFormat: toFormat,
    error: `No conversion engine available for ${fromFormat} → ${toFormat}. LibreOffice is ${isLibreOfficeInstalled() ? 'installed' : 'not installed'}.`,
    executionTime: Date.now() - startTime,
  };
}

/**
 * List supported formats
 */
function listFormats(): ConvertExecutionResult & { inputFormats?: string[]; outputFormats?: string[] } {
  const startTime = Date.now();

  return {
    success: true,
    operation: 'list-formats',
    inputFile: '',
    inputFormats: [...INPUT_FORMATS],
    outputFormats: [...OUTPUT_FORMATS],
    executionTime: Date.now() - startTime,
  };
}

/**
 * Format result for LLM - uses Markdown list for proper line breaks
 */
function formatResultForLLM(result: ConvertExecutionResult & { inputFormats?: string[]; outputFormats?: string[] }): string {
  const lines: string[] = [];

  lines.push(`# Document Conversion Result`);
  lines.push('');
  lines.push(`- **Status**: ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`- **Execution Time**: ${result.executionTime}ms`);

  if (result.engine) {
    lines.push(`- **Engine**: ${result.engine}`);
  }

  if (result.operation === 'list-formats') {
    lines.push('');
    lines.push('## Supported Input Formats');
    lines.push('');
    lines.push(result.inputFormats?.join(', ') || 'None');
    lines.push('');
    lines.push('## Supported Output Formats');
    lines.push('');
    lines.push(result.outputFormats?.join(', ') || 'None');
    lines.push('');
    lines.push('## Conversion Engines');
    lines.push('');
    lines.push(`- **LibreOffice** (${isLibreOfficeInstalled() ? 'Installed' : 'Not installed'}):`);
    lines.push(`  - Word: DOCX/DOC/ODT/RTF/HTML/TXT → PDF, TXT, HTML, ODT, DOCX`);
    lines.push(`  - Excel: XLSX/XLS/ODS/CSV → PDF, CSV, HTML, XLSX, ODS`);
    lines.push(`  - PowerPoint: PPTX/PPT/ODP → PDF, PNG, JPG, ODP, PPTX`);
    lines.push(`- **Calibre** (${isCalibreInstalled() ? 'Installed' : 'Not installed'}): Ebook formats (EPUB, MOBI, AZW3, etc.)`);
    lines.push(`- **markitdown**: PDF/DOCX/PPTX/XLSX/HTML → Markdown`);
    lines.push(`- **pdf2docx**: PDF → DOCX`);
  } else {
    if (result.inputFile) {
      lines.push(`- **Input File**: ${result.inputFile}`);
    }

    if (result.outputFile) {
      lines.push(`- **Output File**: ${result.outputFile}`);
    }

    if (result.inputFormat) {
      lines.push(`- **Input Format**: ${result.inputFormat}`);
    }

    if (result.outputFormat) {
      lines.push(`- **Output Format**: ${result.outputFormat}`);
    }

    if (result.fileSize !== undefined) {
      lines.push(`- **Output Size**: ${Math.round(result.fileSize / 1024)}KB`);
    }
  }

  if (result.error) {
    lines.push('');
    lines.push('## Error');
    lines.push('');
    lines.push(result.error);
  }

  return lines.join('\n');
}

/**
 * Create the Convert MCP Server
 */
function createConvertMcpServer() {
  return createSdkMcpServer({
    name: 'convert',
    version: '1.0.0',
    tools: [
      tool(
        'convert',
        `Document format conversion tool with specialized engines for different format types.

Conversion engines:

1. **LibreOffice** (headless) - For Office documents:
   - Word: DOCX/DOC/ODT/RTF/HTML/TXT → PDF, TXT, HTML, ODT, DOCX
   - Excel: XLSX/XLS/ODS/CSV → PDF, CSV, HTML, XLSX, ODS
   - PowerPoint: PPTX/PPT/ODP → PDF, PNG, JPG, ODP, PPTX
   - High-quality output with formatting preserved

2. **Calibre** (ebook-convert) - For ebook formats:
   - Formats: EPUB, MOBI, AZW, AZW3, FB2, CBZ, CBR, LIT, PRC, PDB, etc.
   - Calibre installation required: https://calibre-ebook.com

3. **markitdown** - For converting to Markdown:
   - Input: PDF, DOCX, PPTX, XLSX, HTML

4. **pdf2docx** - For PDF to DOCX conversion

Operations:
- convert: Convert a document from one format to another
- list-formats: List all supported input/output formats`,
        {
          operation: z.enum(['convert', 'list-formats']).describe('The operation to perform'),
          file: z.string().optional().describe('Input file path (required for convert operation)'),
          output: z.string().optional().describe('Output file path. If not specified, uses input filename with new extension'),
          from: z.string().optional().describe('Input format (auto-detected from extension if not specified)'),
          to: z.string().optional().describe('Output format (auto-detected from output extension if not specified)'),
          pdfFontSize: z.number().optional().describe('Font size for PDF output when using Calibre (default: 12). Use smaller values like 10 or 11 if fonts appear too large.'),
          workingDirectory: z.string().optional().describe('Working directory for relative paths'),
        },
        async ({
          operation,
          file,
          output,
          from,
          to,
          pdfFontSize,
          workingDirectory,
        }) => {
          // Resolve file paths
          const resolveFilePath = (filePath: string): string => {
            if (path.isAbsolute(filePath)) {
              return filePath;
            }
            return workingDirectory ? path.join(workingDirectory, filePath) : filePath;
          };

          let result: ConvertExecutionResult & { inputFormats?: string[]; outputFormats?: string[] };

          switch (operation) {
            case 'list-formats':
              result = listFormats();
              break;

            case 'convert': {
              if (!file) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Convert operation requires file parameter' }],
                };
              }

              const inputFile = resolveFilePath(file);

              // Determine output file
              let outputFile: string;
              if (output) {
                outputFile = resolveFilePath(output);
              } else if (to) {
                // Generate output filename from input with new extension
                const ext = getOutputExtension(to);
                const baseName = path.basename(inputFile, path.extname(inputFile));
                const dir = path.dirname(inputFile);
                outputFile = path.join(dir, `${baseName}.${ext}`);
              } else {
                return {
                  content: [{ type: 'text' as const, text: 'Error: Convert operation requires output or to parameter' }],
                };
              }

              result = await convertDocument(inputFile, outputFile, from, to, {
                pdfFontSize,
              });
              break;
            }

            default:
              return {
                content: [{ type: 'text' as const, text: `Error: Unsupported operation: ${operation}` }],
              };
          }

          const resultText = formatResultForLLM(result);

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
 * Export the Convert MCP server instance
 */
export const convertMcpServer = createConvertMcpServer();
