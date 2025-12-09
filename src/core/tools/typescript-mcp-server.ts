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
  onProgress?: ProgressCallback;
}

/**
 * Get the project root directory (works in both dev and packaged app)
 */
function getProjectRoot(): string {
  // In packaged app, process.resourcesPath points to resources folder
  // node_modules is at resources/app.asar.unpacked/node_modules
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))) {
    return path.join(process.resourcesPath, 'app.asar.unpacked');
  }
  // In development, use current working directory
  return process.cwd();
}

/**
 * Get tsx command and args
 * Returns { command, args, useShell } for spawn
 */
function getTsxCommand(tempFile: string): { command: string; args: string[]; useShell: boolean } {
  const projectRoot = getProjectRoot();

  // Check for tsx in node_modules/.bin
  const tsxBin = process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'tsx');

  if (fs.existsSync(tsxBin)) {
    // On Windows, .cmd files need shell: true
    return {
      command: tsxBin,
      args: [tempFile],
      useShell: process.platform === 'win32',
    };
  }

  // Fallback to npx tsx - always needs shell
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['tsx', tempFile],
    useShell: true,
  };
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
  const { workingDir, timeout = 60000, onProgress } = config;

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

  // Create temporary file in project root so it can access node_modules
  const tempDir = path.join(projectRoot, '.ts-exec-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempFile = path.join(tempDir, `ts_exec_${randomUUID()}.ts`);

  try {
    // Write code to temporary file
    fs.writeFileSync(tempFile, code, 'utf-8');

    return new Promise((resolve) => {
      const { command, args, useShell } = getTsxCommand(tempFile);

      // Use tsx to execute TypeScript directly
      const tsProcess = spawn(command, args, {
        cwd: effectiveWorkingDir,
        env: {
          ...process.env,
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
      message: `Setup error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
    });

    return {
      success: false,
      error: `Failed to setup TypeScript execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

Features:
- Direct TypeScript execution without compilation step
- Full access to Node.js APIs
- Support for ES modules and modern TypeScript features
- Automatic type checking

Usage:
- Write TypeScript code that will be executed
- Use console.log() for output
- Import Node.js modules directly (e.g., import fs from 'fs')
- Import npm packages if available in the project

Example:
\`\`\`typescript
import * as fs from 'fs';

const files = fs.readdirSync('.');
console.log('Files:', files);

interface Person {
  name: string;
  age: number;
}

const person: Person = { name: 'John', age: 30 };
console.log(JSON.stringify(person, null, 2));
\`\`\`

Notes:
- Execution timeout is 60 seconds by default
- Working directory defaults to the current project root
- tsx must be available via npx`,
        {
          code: z.string().describe('TypeScript code to execute'),
          workingDirectory: z.string().optional().describe('Working directory for code execution'),
          timeout: z.number().optional().describe('Execution timeout in milliseconds (default: 60000)'),
        },
        async ({ code, workingDirectory, timeout }) => {
          const result = await executeTypeScriptCode(code, {
            workingDir: workingDirectory,
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
