/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * TypeScript MCP Server - Custom tool for executing TypeScript code
 * Uses Claude Agent SDK's MCP server pattern for tool integration
 * Executes TypeScript code using tsx (TypeScript Execute)
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getErrorMessage } from '../errors.js';

/**
 * Progress entry for tracking execution history
 */
interface ProgressEntry {
  type: 'stdout' | 'stderr' | 'start' | 'end' | 'error';
  message: string;
  timestamp: number;
}

/**
 * TypeScript execution result
 */
interface TypeScriptExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  executionTime: number;
  progressHistory?: ProgressEntry[];
}

/**
 * Progress callback for TypeScript execution
 */
export type ProgressCallback = (data: ProgressEntry) => void;

/**
 * TypeScript executor configuration
 */
interface TypeScriptExecutorConfig {
  workingDir?: string;
  timeout?: number;
  packages?: string[];
  onProgress?: ProgressCallback;
}

/**
 * Get the project root directory (works in both dev and packaged app)
 */
export function getProjectRoot(): string {
  // In packaged app, process.resourcesPath points to resources folder
  // node_modules is at resources/app.asar.unpacked/node_modules
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))) {
    return path.join(process.resourcesPath, 'app.asar.unpacked');
  }
  // In development, use current working directory
  return process.cwd();
}

/**
 * Check if an npm package is installed
 */
function isPackageInstalled(
  projectRoot: string,
  packageName: string
): boolean {
  // Handle scoped packages like @types/node
  const packagePath = path.join(projectRoot, 'node_modules', packageName);
  return fs.existsSync(packagePath);
}

/**
 * Install npm packages using npm
 */
export async function installPackages(
  projectRoot: string,
  packages: string[],
  onProgress?: ProgressCallback
): Promise<{ success: boolean; installedPackages: string[]; errors: string[] }> {
  if (packages.length === 0) {
    return { success: true, installedPackages: [], errors: [] };
  }

  // Check which packages need to be installed
  const packagesToInstall: string[] = [];
  for (const pkg of packages) {
    if (!isPackageInstalled(projectRoot, pkg)) {
      packagesToInstall.push(pkg);
    } else {
      onProgress?.({
        type: 'stdout',
        message: `Package ${pkg} already installed`,
        timestamp: Date.now(),
      });
    }
  }

  if (packagesToInstall.length === 0) {
    return { success: true, installedPackages: [], errors: [] };
  }

  onProgress?.({
    type: 'stdout',
    message: `Installing packages: ${packagesToInstall.join(', ')}...`,
    timestamp: Date.now(),
  });

  return new Promise((resolve) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['install', '--save-dev', '--no-audit', '--no-fund', ...packagesToInstall];

    const npmProcess = spawn(npmCommand, args, {
      cwd: projectRoot,
      env: process.env,
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    let stderr = '';

    npmProcess.stdout.on('data', (data) => {
      const message = data.toString();
      onProgress?.({
        type: 'stdout',
        message: message.trim(),
        timestamp: Date.now(),
      });
    });

    npmProcess.stderr.on('data', (data) => {
      const message = data.toString();
      stderr += message;
      // npm often outputs warnings to stderr, show them as stdout
      onProgress?.({
        type: 'stdout',
        message: message.trim(),
        timestamp: Date.now(),
      });
    });

    npmProcess.on('close', (code) => {
      if (code === 0) {
        onProgress?.({
          type: 'stdout',
          message: `Successfully installed ${packagesToInstall.join(', ')}`,
          timestamp: Date.now(),
        });
        resolve({
          success: true,
          installedPackages: packagesToInstall,
          errors: [],
        });
      } else {
        const errorMsg = `Failed to install packages: ${stderr || 'Unknown error'}`;
        onProgress?.({
          type: 'error',
          message: errorMsg,
          timestamp: Date.now(),
        });
        resolve({
          success: false,
          installedPackages: [],
          errors: [errorMsg],
        });
      }
    });

    npmProcess.on('error', (error) => {
      const errorMsg = `npm error: ${error.message}`;
      onProgress?.({
        type: 'error',
        message: errorMsg,
        timestamp: Date.now(),
      });
      resolve({
        success: false,
        installedPackages: [],
        errors: [errorMsg],
      });
    });
  });
}

/**
 * Get tsx command, args and extra env for spawn.
 *
 * In a packaged app there is no node_modules/.bin (electron-builder's
 * asarUnpack does not materialize bin shims), so the tsx CLI entry is run
 * directly with our own executable in node mode (ELECTRON_RUN_AS_NODE).
 */
export function getTsxCommand(tempFile: string): { command: string; args: string[]; useShell: boolean; env: NodeJS.ProcessEnv } {
  const projectRoot = getProjectRoot();

  // Development: tsx bin shim from node_modules/.bin
  const tsxBin = process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'tsx');

  if (fs.existsSync(tsxBin)) {
    // On Windows, .cmd files need shell: true
    return {
      command: tsxBin,
      args: [tempFile],
      useShell: process.platform === 'win32',
      env: {},
    };
  }

  // Packaged app: run the tsx CLI entry with our own binary acting as node
  const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(tsxCli)) {
    return {
      command: process.execPath,
      args: [tsxCli, tempFile],
      useShell: false,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  throw new Error(`tsx not found under ${projectRoot} (looked for node_modules/.bin and node_modules/tsx/dist/cli.mjs)`);
}

/**
 * Execute TypeScript code using tsx
 */
async function executeTypeScriptCode(
  code: string,
  config: TypeScriptExecutorConfig = {}
): Promise<TypeScriptExecutionResult> {
  const startTime = Date.now();
  const progressHistory: ProgressEntry[] = [];
  const { workingDir, timeout = 60000, packages = [], onProgress } = config;

  const addProgress = (entry: ProgressEntry) => {
    progressHistory.push(entry);
    onProgress?.(entry);
  };

  addProgress({
    type: 'start',
    message: 'Starting TypeScript execution...',
    timestamp: Date.now(),
  });

  // Get project root for node_modules access
  const projectRoot = getProjectRoot();
  const effectiveWorkingDir = workingDir || projectRoot;

  // Install required packages if specified
  if (packages.length > 0) {
    addProgress({
      type: 'stdout',
      message: `Checking required packages: ${packages.join(', ')}`,
      timestamp: Date.now(),
    });

    const installResult = await installPackages(projectRoot, packages, addProgress);
    if (!installResult.success) {
      return {
        success: false,
        error: `Failed to install required packages:\n${installResult.errors.join('\n')}`,
        executionTime: Date.now() - startTime,
        progressHistory,
      };
    }
  }

  // Create temporary file in project root so it can access node_modules
  const tempDir = path.join(projectRoot, '.ts-exec-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  // Use the explicit ESM TypeScript extension. A plain `.ts` file is treated as
  // CommonJS when the nearest package.json has no `"type": "module"`, causing
  // tsx/esbuild to reject top-level await even though the runtime supports it.
  const tempFile = path.join(tempDir, `ts_exec_${randomUUID()}.mts`);

  try {
    // Write code to temporary file
    fs.writeFileSync(tempFile, code, 'utf-8');

    return new Promise((resolve) => {
      const { command, args, useShell, env: tsxEnv } = getTsxCommand(tempFile);

      // Use tsx to execute TypeScript directly
      const tsProcess = spawn(command, args, {
        cwd: effectiveWorkingDir,
        env: {
          ...process.env,
          ...tsxEnv,
          NODE_OPTIONS: '--no-warnings',
          // Ensure node_modules can be found
          NODE_PATH: path.join(projectRoot, 'node_modules'),
        },
        shell: useShell,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        tsProcess.kill('SIGTERM');
        addProgress({
          type: 'error',
          message: `Execution timed out after ${timeout}ms`,
          timestamp: Date.now(),
        });
      }, timeout);

      tsProcess.stdout.on('data', (data) => {
        const message = data.toString();
        stdout += message;
        addProgress({
          type: 'stdout',
          message: message.trimEnd(),
          timestamp: Date.now(),
        });
      });

      tsProcess.stderr.on('data', (data) => {
        const message = data.toString();
        stderr += message;
        addProgress({
          type: 'stderr',
          message: message.trimEnd(),
          timestamp: Date.now(),
        });
      });

      tsProcess.on('close', (exitCode) => {
        clearTimeout(timeoutId);

        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }

        const executionTime = Date.now() - startTime;

        addProgress({
          type: 'end',
          message: `Execution completed with exit code ${exitCode}`,
          timestamp: Date.now(),
        });

        if (killed) {
          resolve({
            success: false,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? -1,
            error: `Execution timed out after ${timeout}ms`,
            executionTime,
            progressHistory,
          });
        } else {
          resolve({
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? 0,
            executionTime,
            progressHistory,
          });
        }
      });

      tsProcess.on('error', (error) => {
        clearTimeout(timeoutId);

        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }

        addProgress({
          type: 'error',
          message: `Process error: ${error.message}`,
          timestamp: Date.now(),
        });

        resolve({
          success: false,
          error: `Failed to execute TypeScript: ${error.message}`,
          executionTime: Date.now() - startTime,
          progressHistory,
        });
      });
    });
  } catch (error) {
    // Clean up temp file on error
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    addProgress({
      type: 'error',
      message: `Setup error: ${getErrorMessage(error)}`,
      timestamp: Date.now(),
    });

    return {
      success: false,
      error: `Failed to setup TypeScript execution: ${getErrorMessage(error)}`,
      executionTime: Date.now() - startTime,
      progressHistory,
    };
  }
}

/**
 * Format execution result for LLM consumption
 */
function formatResultForLLM(result: TypeScriptExecutionResult): string {
  const lines: string[] = [];

  lines.push('# TypeScript Execution Result\n');
  lines.push(`**Status**: ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`**Execution Time**: ${result.executionTime}ms`);

  if (result.exitCode !== undefined) {
    lines.push(`**Exit Code**: ${result.exitCode}`);
  }

  if (result.stdout) {
    lines.push('\n## Output (stdout)\n');
    lines.push('```');
    lines.push(result.stdout);
    lines.push('```');
  }

  if (result.stderr) {
    lines.push('\n## Errors (stderr)\n');
    lines.push('```');
    lines.push(result.stderr);
    lines.push('```');
  }

  if (result.error) {
    lines.push('\n## Error\n');
    lines.push(result.error);
  }

  return lines.join('\n');
}

/**
 * Create the TypeScript MCP Server
 */
function createTypeScriptMcpServer() {
  return createSdkMcpServer({
    name: 'typescript',
    version: '1.0.0',
    tools: [
      tool(
        'execute',
        `Execute TypeScript code using tsx (TypeScript Execute).

## Features
- Direct TypeScript execution without compilation step
- Full access to Node.js APIs
- Support for ES modules and modern TypeScript features
- Automatic npm package installation via packages parameter

## Pre-installed Packages (no need to specify in packages parameter)

### Office Documents
- **pptxgenjs** - Create PowerPoint presentations
- **exceljs** - Read/write Excel files (.xlsx)
- **docx** - Create Word documents (.docx)
- **pdf-lib** - Create/modify PDF files
- **adm-zip** - Read/write ZIP files (also works for PPTX/DOCX/XLSX)

### Utilities
- **lodash** - Utility functions
- **dayjs** - Date manipulation
- **uuid** - Generate UUIDs
- **zod** - Schema validation

## Usage Examples

### Create PowerPoint:
\`\`\`typescript
import PptxGenJS from 'pptxgenjs';

const pptx = new PptxGenJS();
const slide = pptx.addSlide();
slide.addText('Hello World', { x: 1, y: 1, fontSize: 24 });
await pptx.writeFile({ fileName: 'output.pptx' });
\`\`\`

### Create Excel:
\`\`\`typescript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Sheet1');
sheet.addRow(['Name', 'Age']);
sheet.addRow(['John', 30]);
await workbook.xlsx.writeFile('output.xlsx');
\`\`\`

### Create Word:
\`\`\`typescript
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as fs from 'fs';

const doc = new Document({
  sections: [{ children: [new Paragraph({ children: [new TextRun('Hello World')] })] }]
});
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('output.docx', buffer);
\`\`\`

### Modify PDF:
\`\`\`typescript
import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage();
page.drawText('Hello World', { x: 50, y: 700, size: 30 });
const pdfBytes = await pdfDoc.save();
fs.writeFileSync('output.pdf', pdfBytes);
\`\`\`

## Async Code and Modules

Code is executed as an ES module, so top-level await is supported directly:

\`\`\`typescript
const data = await fetchData();
console.log(data);
\`\`\`

Use ES module \`import\` syntax. CommonJS globals such as \`require\`, \`__dirname\`,
and \`__filename\` are not available automatically.

## Important: Escape Special Quotes in Strings

Curly/smart quotes ("" '') cause parse errors. Always use straight quotes:

\`\`\`typescript
// ❌ WRONG - curly quotes break parsing
const text = "Hello "World"";

// ✅ CORRECT - use straight quotes with escape
const text = "Hello \\"World\\"";

// ✅ CORRECT - use single quotes for outer string
const text = 'He said "Hello"';
\`\`\`

## Notes
- Execution timeout is 60 seconds by default
- Use packages parameter for packages not listed above
- Working directory defaults to current project root`,
        {
          code: z.string().describe(
            'TypeScript code to execute as an ES module. Top-level await and ESM imports are supported; ' +
            'CommonJS globals such as require, __dirname, and __filename are not available automatically.'
          ),
          packages: z.array(z.string()).optional().describe(
            'List of npm packages to install before execution (e.g., ["lodash", "@types/lodash", "axios"]). ' +
            'Packages will be checked and installed if missing.'
          ),
          workingDirectory: z.string().optional().describe('Working directory for code execution'),
          timeout: z.number().optional().describe('Execution timeout in milliseconds (default: 60000)'),
        },
        async ({ code, packages, workingDirectory, timeout }) => {
          const result = await executeTypeScriptCode(code, {
            workingDir: workingDirectory,
            packages: packages || [],
            timeout: timeout ?? 60000,
          });

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
 * Export the TypeScript MCP server instance
 */
export const typescriptMcpServer = createTypeScriptMcpServer();

/**
 * Export for direct TypeScript execution (useful for testing)
 */
export { executeTypeScriptCode };
