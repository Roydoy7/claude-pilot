/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Convert MCP Server - Document conversion tool using Pandoc
 * Supports conversion between various document formats
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Pandoc version bundled with the application
 */
const PANDOC_VERSION = '3.8.3';

/**
 * Calibre installation paths to check
 */
const CALIBRE_PATHS = [
  'C:\\Program Files\\Calibre2\\ebook-convert.exe',
  'C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe',
];

/**
 * Ebook formats - Calibre ONLY (Pandoc cannot handle these properly)
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
 * wkhtmltopdf version bundled with the application
 */
const WKHTMLTOPDF_VERSION = '0.12.6-1';

/**
 * Python version bundled with the application
 */
const PYTHON_VERSION = '3.13.11';

/**
 * Supported input formats
 */
const INPUT_FORMATS = [
  'docx',
  'html',
  'markdown',
  'md',
  'txt',
  'rst',
  'org',
  'latex',
  'tex',
  'epub',
  'odt',
  'rtf',
  'json',
  'csv',
  'pdf', // PDF input supported via pdf2docx and markitdown
  'pptx', // PowerPoint input supported via markitdown (to Markdown only)
  'xlsx', // Excel input supported via markitdown (to Markdown only)
  'xls', // Excel input supported via markitdown (to Markdown only)
] as const;

/**
 * Supported output formats
 */
const OUTPUT_FORMATS = [
  'docx',
  'html',
  'markdown',
  'md',
  'pdf',
  'txt',
  'rst',
  'org',
  'latex',
  'tex',
  'epub',
  'odt',
  'rtf',
  'pptx',
  'json',
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
  pandocVersion?: string;
}

/**
 * Get Calibre ebook-convert executable path
 */
function getCalibrePath(): string | null {
  for (const calibrePath of CALIBRE_PATHS) {
    if (existsSync(calibrePath)) {
      return calibrePath;
    }
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
 * Get Pandoc executable path
 */
function getPandocPath(): string {
  // Check embedded Pandoc in packages folder
  const embeddedPandoc = path.join(
    process.cwd(),
    'packages',
    `pandoc-${PANDOC_VERSION}`,
    'pandoc.exe'
  );

  if (existsSync(embeddedPandoc)) {
    return embeddedPandoc;
  }

  // Check in resources folder (for packaged app)
  const resourcesPandoc = path.join(
    process.resourcesPath || process.cwd(),
    `pandoc-${PANDOC_VERSION}`,
    'pandoc.exe'
  );

  if (existsSync(resourcesPandoc)) {
    return resourcesPandoc;
  }

  // Fallback to system pandoc
  return 'pandoc';
}

/**
 * Get wkhtmltopdf executable path
 */
function getWkhtmltopdfPath(): string | null {
  // Check embedded wkhtmltopdf in packages folder
  const embeddedWkhtmltopdf = path.join(
    process.cwd(),
    'packages',
    `wkhtmltopdf-${WKHTMLTOPDF_VERSION}`,
    'bin',
    'wkhtmltopdf.exe'
  );

  if (existsSync(embeddedWkhtmltopdf)) {
    return embeddedWkhtmltopdf;
  }

  // Check in resources folder (for packaged app)
  const resourcesWkhtmltopdf = path.join(
    process.resourcesPath || process.cwd(),
    `wkhtmltopdf-${WKHTMLTOPDF_VERSION}`,
    'bin',
    'wkhtmltopdf.exe'
  );

  if (existsSync(resourcesWkhtmltopdf)) {
    return resourcesWkhtmltopdf;
  }

  // wkhtmltopdf not found
  return null;
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
 * Execute Pandoc command
 */
async function executePandoc(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const pandocPath = getPandocPath();

  return new Promise((resolve) => {
    const proc = spawn(pandocPath, args, {
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
 * Get Pandoc version
 */
async function getPandocVersion(): Promise<string> {
  const { stdout, code } = await executePandoc(['--version']);
  if (code === 0) {
    const match = stdout.match(/pandoc\s+([\d.]+)/);
    return match ? match[1] : 'unknown';
  }
  return 'not found';
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
 * Convert document using Pandoc
 */
async function convertDocument(
  inputFile: string,
  outputFile: string,
  inputFormat?: string,
  outputFormat?: string,
  options?: {
    standalone?: boolean;
    tableOfContents?: boolean;
    numberSections?: boolean;
    template?: string;
    cssFile?: string;
    referenceDoc?: string;
    pdfFontSize?: number;
  }
): Promise<ConvertExecutionResult> {
  const startTime = Date.now();

  try {
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
    // EPUB, MOBI, AZW3, CBZ, CBR, FB2, LIT, etc. require Calibre for proper conversion
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
      };
    }

    // Handle PDF input using pdf2docx (Pandoc cannot read PDF)
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
      };
    }

    // Handle xlsx/pptx input - only Markdown output is supported via markitdown
    if (fromFormat === 'xlsx' || fromFormat === 'xls' || fromFormat === 'pptx') {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: `${fromFormat.toUpperCase()} files can only be converted to Markdown format via markitdown.`,
        executionTime: Date.now() - startTime,
      };
    }

    // Build Pandoc arguments
    const args: string[] = [
      inputFile,
      '-o', outputFile,
      '-f', fromFormat,
      '-t', toFormat,
    ];

    // Add optional flags
    if (options?.standalone !== false) {
      args.push('-s'); // Standalone document
    }

    if (options?.tableOfContents) {
      args.push('--toc');
    }

    if (options?.numberSections) {
      args.push('--number-sections');
    }

    if (options?.template) {
      args.push('--template', options.template);
    }

    if (options?.cssFile && (toFormat === 'html' || toFormat === 'epub')) {
      args.push('--css', options.cssFile);
    }

    if (options?.referenceDoc && (toFormat === 'docx' || toFormat === 'pptx' || toFormat === 'odt')) {
      args.push('--reference-doc', options.referenceDoc);
    }

    // For PDF output, use wkhtmltopdf as the PDF engine
    if (toFormat === 'pdf') {
      const wkhtmltopdfPath = getWkhtmltopdfPath();
      if (wkhtmltopdfPath) {
        args.push('--pdf-engine', wkhtmltopdfPath);
      } else {
        return {
          success: false,
          operation: 'convert',
          inputFile,
          outputFile,
          inputFormat: fromFormat,
          outputFormat: toFormat,
          error: 'PDF conversion requires wkhtmltopdf which is not installed. Run "npm run setup:pandoc" to install it.',
          executionTime: Date.now() - startTime,
        };
      }
    }

    // Execute Pandoc
    const { stderr, code } = await executePandoc(args);

    if (code !== 0) {
      return {
        success: false,
        operation: 'convert',
        inputFile,
        outputFile,
        inputFormat: fromFormat,
        outputFormat: toFormat,
        error: `Pandoc conversion failed: ${stderr}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Get output file size
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
      pandocVersion: PANDOC_VERSION,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'convert',
      inputFile,
      error: `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * List supported formats
 */
async function listFormats(): Promise<ConvertExecutionResult & { inputFormats?: string[]; outputFormats?: string[] }> {
  const startTime = Date.now();
  const version = await getPandocVersion();

  return {
    success: true,
    operation: 'list-formats',
    inputFile: '',
    inputFormats: [...INPUT_FORMATS],
    outputFormats: [...OUTPUT_FORMATS],
    pandocVersion: version,
    executionTime: Date.now() - startTime,
  };
}

/**
 * Format result for LLM
 */
function formatResultForLLM(result: ConvertExecutionResult & { inputFormats?: string[]; outputFormats?: string[] }): string {
  const lines: string[] = [];

  lines.push(`# Document Conversion Result\n`);
  lines.push(`**Status**: ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`**Execution Time**: ${result.executionTime}ms`);

  if (result.pandocVersion) {
    lines.push(`**Pandoc Version**: ${result.pandocVersion}`);
  }

  if (result.operation === 'list-formats') {
    lines.push('\n## Supported Input Formats\n');
    lines.push(result.inputFormats?.join(', ') || 'None');
    lines.push('\n## Supported Output Formats\n');
    lines.push(result.outputFormats?.join(', ') || 'None');
  } else {
    if (result.inputFile) {
      lines.push(`**Input File**: ${result.inputFile}`);
    }

    if (result.outputFile) {
      lines.push(`**Output File**: ${result.outputFile}`);
    }

    if (result.inputFormat) {
      lines.push(`**Input Format**: ${result.inputFormat}`);
    }

    if (result.outputFormat) {
      lines.push(`**Output Format**: ${result.outputFormat}`);
    }

    if (result.fileSize !== undefined) {
      lines.push(`**Output Size**: ${Math.round(result.fileSize / 1024)}KB`);
    }
  }

  if (result.error) {
    lines.push(`\n## Error\n\n${result.error}`);
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

Conversion engines (each handles its specialized formats, NO fallback):

1. **Calibre** (ebook-convert) - REQUIRED for ebook formats:
   - Formats: EPUB, MOBI, AZW, AZW3, FB2, CBZ, CBR, LIT, PRC, PDB, etc.
   - Calibre installation required: https://calibre-ebook.com

2. **markitdown** - For converting documents to Markdown:
   - Input: PDF, DOCX, PPTX, XLSX, HTML

3. **pdf2docx** - For PDF to DOCX conversion

4. **Pandoc** - For text-based document formats:
   - Formats: Markdown, LaTeX, RST, Org-mode, HTML, DOCX, ODT, RTF
   - PDF output via wkhtmltopdf (bundled)

IMPORTANT: Ebook formats (EPUB, MOBI, AZW3, etc.) REQUIRE Calibre. No fallback is provided because Pandoc cannot preserve images and formatting properly.

Operations:
- convert: Convert a document from one format to another
- list-formats: List all supported input/output formats`,
        {
          operation: z.enum(['convert', 'list-formats']).describe('The operation to perform'),
          file: z.string().optional().describe('Input file path (required for convert operation)'),
          output: z.string().optional().describe('Output file path. If not specified, uses input filename with new extension'),
          from: z.string().optional().describe('Input format (auto-detected from extension if not specified)'),
          to: z.string().optional().describe('Output format (auto-detected from output extension if not specified)'),
          standalone: z.boolean().optional().describe('Generate standalone document with header/footer (default: true)'),
          toc: z.boolean().optional().describe('Include table of contents'),
          numberSections: z.boolean().optional().describe('Number section headings'),
          template: z.string().optional().describe('Custom template file path'),
          css: z.string().optional().describe('CSS file for HTML/EPUB output'),
          referenceDoc: z.string().optional().describe('Reference document for styling (docx/pptx/odt)'),
          pdfFontSize: z.number().optional().describe('Font size for PDF output when using Calibre (default: 12). Use smaller values like 10 or 11 if fonts appear too large.'),
          workingDirectory: z.string().optional().describe('Working directory for relative paths'),
        },
        async ({
          operation,
          file,
          output,
          from,
          to,
          standalone,
          toc,
          numberSections,
          template,
          css,
          referenceDoc,
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
              result = await listFormats();
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
                standalone,
                tableOfContents: toc,
                numberSections,
                template: template ? resolveFilePath(template) : undefined,
                cssFile: css ? resolveFilePath(css) : undefined,
                referenceDoc: referenceDoc ? resolveFilePath(referenceDoc) : undefined,
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
