/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Python MCP Server - Custom tool for executing Python code
 * Uses Claude Agent SDK's MCP server pattern for tool integration
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { killWithEscalation } from './process-utils.js';

/** The SDK types the tool handler's second argument as `unknown`, but it carries
 * a per-request AbortSignal at runtime that fires when the user cancels. */
interface ToolExtra {
  signal?: AbortSignal;
}

/**
 * Progress entry for tracking execution history
 */
interface ProgressEntry {
  type: 'stdout' | 'stderr' | 'start' | 'end' | 'error';
  message: string;
  timestamp: number;
}

/**
 * Python execution result
 */
interface PythonExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  executionTime: number;
  encoding?: string;
  progressHistory?: ProgressEntry[];
}

/**
 * Progress callback for Python execution
 */
export type ProgressCallback = (data: ProgressEntry) => void;

/**
 * Python executor configuration
 */
interface PythonExecutorConfig {
  pythonPath?: string;
  workingDir?: string;
  timeout?: number;
  encoding?: BufferEncoding;
  requirements?: string[];
  onProgress?: ProgressCallback;
  /** Aborts the running process when the user cancels the agent turn */
  signal?: AbortSignal;
}

/**
 * Get default Python executable path
 */
export function getDefaultPythonPath(): string {
  // Use embedded Python from packages folder
  const embeddedPython = path.join(
    process.cwd(),
    'packages',
    'python-3.13.11-embed-amd64',
    'python.exe'
  );

  if (fs.existsSync(embeddedPython)) {
    return embeddedPython;
  }

  // Fallback to system Python
  return process.platform === 'win32' ? 'python.exe' : 'python3';
}

/**
 * Detect appropriate encoding based on system locale and content
 */
function detectEncoding(code: string): BufferEncoding {
  // Check for encoding declaration in code (PEP 263)
  const encodingMatch = code.match(/^#.*?coding[:=]\s*([-\w.]+)/m);

  if (encodingMatch) {
    const declared = encodingMatch[1].toLowerCase();
    if (declared.includes('utf-8') || declared.includes('utf8')) {
      return 'utf-8';
    }
  }

  // Check system locale
  const locale = process.env.LANG || process.env.LC_ALL || '';
  if (locale.includes('UTF-8') || locale.includes('utf8')) {
    return 'utf-8';
  }

  // Default to UTF-8 for safety
  return 'utf-8';
}

/**
 * Check if a Python package is installed
 */
async function isPackageInstalled(
  pythonPath: string,
  packageName: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonDir = path.dirname(pythonPath);
    const checkProcess = spawn(pythonPath, ['-c', `import ${packageName}`], {
      cwd: pythonDir,
      env: process.env,
    });

    checkProcess.on('close', (code) => {
      resolve(code === 0);
    });

    checkProcess.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Install a Python package using pip
 */
async function installPackage(
  pythonPath: string,
  packageName: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const pythonDir = path.dirname(pythonPath);
    const sitePackagesDir = path.join(pythonDir, 'Lib', 'site-packages');

    onProgress?.({
      type: 'stdout',
      message: `Installing package: ${packageName}...`,
      timestamp: Date.now(),
    });

    const pipProcess = spawn(
      pythonPath,
      ['-m', 'pip', 'install', packageName, '--target', sitePackagesDir, '--no-warn-script-location'],
      {
        cwd: pythonDir,
        env: process.env,
      }
    );

    let stdout = '';
    let stderr = '';

    pipProcess.stdout.on('data', (data) => {
      const message = data.toString();
      stdout += message;
      onProgress?.({
        type: 'stdout',
        message: message.trim(),
        timestamp: Date.now(),
      });
    });

    pipProcess.stderr.on('data', (data) => {
      const message = data.toString();
      stderr += message;
      onProgress?.({
        type: 'stderr',
        message: message.trim(),
        timestamp: Date.now(),
      });
    });

    pipProcess.on('close', (code) => {
      if (code === 0) {
        onProgress?.({
          type: 'stdout',
          message: `Successfully installed ${packageName}`,
          timestamp: Date.now(),
        });
        resolve({ success: true, message: `Successfully installed ${packageName}` });
      } else {
        onProgress?.({
          type: 'error',
          message: `Failed to install ${packageName}: ${stderr}`,
          timestamp: Date.now(),
        });
        resolve({ success: false, message: `Failed to install ${packageName}: ${stderr}` });
      }
    });

    pipProcess.on('error', (error) => {
      onProgress?.({
        type: 'error',
        message: `Error installing ${packageName}: ${error.message}`,
        timestamp: Date.now(),
      });
      resolve({ success: false, message: `Error installing ${packageName}: ${error.message}` });
    });
  });
}

/**
 * Check and install required packages
 */
export async function ensurePackagesInstalled(
  pythonPath: string,
  requirements: string[],
  onProgress?: ProgressCallback
): Promise<{ success: boolean; installedPackages: string[]; errors: string[] }> {
  if (requirements.length === 0) {
    return { success: true, installedPackages: [], errors: [] };
  }

  onProgress?.({
    type: 'stdout',
    message: `Checking required packages: ${requirements.join(', ')}`,
    timestamp: Date.now(),
  });

  const installedPackages: string[] = [];
  const errors: string[] = [];

  for (const pkg of requirements) {
    const isInstalled = await isPackageInstalled(pythonPath, pkg);

    if (!isInstalled) {
      onProgress?.({
        type: 'stdout',
        message: `Package ${pkg} not found, installing...`,
        timestamp: Date.now(),
      });

      const result = await installPackage(pythonPath, pkg, onProgress);

      if (result.success) {
        installedPackages.push(pkg);
      } else {
        errors.push(`${pkg}: ${result.message}`);
      }
    } else {
      onProgress?.({
        type: 'stdout',
        message: `Package ${pkg} already installed`,
        timestamp: Date.now(),
      });
    }
  }

  return { success: errors.length === 0, installedPackages, errors };
}

/**
 * Execute Python code with progress tracking
 */
async function executePythonCode(
  code: string,
  config: PythonExecutorConfig = {}
): Promise<PythonExecutionResult> {
  const startTime = Date.now();

  const {
    pythonPath = getDefaultPythonPath(),
    workingDir = os.tmpdir(),
    timeout = 300000, // 5 minutes default
    encoding = detectEncoding(code),
    requirements = [],
    onProgress,
    signal,
  } = config;

  const progressHistory: ProgressEntry[] = [];

  const recordProgress = (entry: ProgressEntry) => {
    progressHistory.push(entry);
    onProgress?.(entry);
  };

  recordProgress({
    type: 'start',
    message: `Starting Python execution with ${pythonPath}`,
    timestamp: Date.now(),
  });

  // Check and install required packages
  if (requirements.length > 0) {
    const packageResult = await ensurePackagesInstalled(pythonPath, requirements, recordProgress);

    if (!packageResult.success) {
      return {
        success: false,
        error: `Failed to install required packages:\n${packageResult.errors.join('\n')}`,
        executionTime: Date.now() - startTime,
        encoding,
        progressHistory,
      };
    }
  }

  // Create temporary Python file
  const tempFileName = `python_exec_${randomUUID()}.py`;
  const tempFilePath = path.join(workingDir, tempFileName);

  try {
    // Wrap user code for reliable output capture
    // Key improvements:
    // 1. Unbuffered output (-u flag equivalent via PYTHONUNBUFFERED)
    // 2. Immediate flush after each print
    // 3. Real-time output even if script hangs/crashes
    const wrappedCode = `# -*- coding: ${encoding} -*-
import sys
import os
import io
import base64
import json
import traceback

# Force unbuffered output for real-time capture
os.environ['PYTHONUNBUFFERED'] = '1'

# Force UTF-8 for internal processing with line buffering
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True)

# Custom print that flushes immediately
_original_print = print

def print(*args, **kwargs):
    """Print with immediate flush for real-time output"""
    kwargs.setdefault('flush', True)
    _original_print(*args, **kwargs)

# Execute user code
_exit_code = 0
_error_output = ''
try:
${code.split('\n').map((line) => '    ' + line).join('\n')}
except SystemExit as e:
    _exit_code = e.code if isinstance(e.code, int) else (1 if e.code else 0)
except Exception as e:
    _error_output = traceback.format_exc()
    _original_print(_error_output, file=sys.stderr, flush=True)
    _exit_code = 1

# Output result marker (exit code for parsing)
# This marker appears ONLY if script completes normally (not killed by timeout)
result_data = {"exit_code": _exit_code}
json_str = json.dumps(result_data)
encoded = base64.b64encode(json_str.encode('utf-8')).decode('ascii')
_original_print(f"__PYTHON_RESULT_BASE64__{encoded}__END__", flush=True)

sys.exit(_exit_code)`;

    await fs.promises.writeFile(tempFilePath, wrappedCode, { encoding });

    recordProgress({
      type: 'stdout',
      message: `Executing Python script (encoding: ${encoding})`,
      timestamp: Date.now(),
    });

    // Execute Python code with manual timeout for better error reporting
    const result = await new Promise<PythonExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;
      let isCancelled = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const pythonDir = path.dirname(pythonPath);
      const sitePackagesDir = path.join(pythonDir, 'Lib', 'site-packages');
      const existingPythonPath = process.env.PYTHONPATH || '';
      const pythonPathValue = existingPythonPath
        ? `${sitePackagesDir}${path.delimiter}${existingPythonPath}`
        : sitePackagesDir;

      // Don't use spawn's timeout - handle manually to preserve output on timeout
      // Use -u flag for unbuffered output to ensure real-time capture
      const pythonProcess = spawn(pythonPath, ['-u', tempFilePath], {
        cwd: workingDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: encoding,
          PYTHONPATH: pythonPathValue,
          PYTHONUNBUFFERED: '1', // Force unbuffered stdout/stderr
        },
      });

      // Manual timeout handler
      timeoutHandle = setTimeout(() => {
        isTimedOut = true;
        killWithEscalation(pythonProcess);
      }, timeout);

      // User cancellation handler - stop the process as soon as the agent turn is cancelled
      const onAbort = () => {
        isCancelled = true;
        killWithEscalation(pythonProcess);
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      pythonProcess.stdout.on('data', (data) => {
        const message = data.toString(encoding);
        stdout += message;

        const cleanMessage = message.replace(/__PYTHON_RESULT_BASE64__[A-Za-z0-9+/=]+__END__/g, '').trim();
        if (cleanMessage) {
          recordProgress({
            type: 'stdout',
            message: cleanMessage,
            timestamp: Date.now(),
          });
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        const message = data.toString(encoding);
        stderr += message;
        recordProgress({
          type: 'stderr',
          message: message.trim(),
          timestamp: Date.now(),
        });
      });

      pythonProcess.on('close', (processExitCode, exitSignal) => {
        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        signal?.removeEventListener('abort', onAbort);

        const executionTime = Date.now() - startTime;

        const base64Match = stdout.match(/__PYTHON_RESULT_BASE64__([A-Za-z0-9+/=]+)__END__/);

        // Remove the result marker from stdout to get clean output
        let actualStdout = stdout.replace(/__PYTHON_RESULT_BASE64__[A-Za-z0-9+/=]+__END__/g, '').trim();
        let actualStderr = stderr.trim();
        let actualExitCode = processExitCode;

        // Parse result marker if present (indicates script completed normally)
        if (base64Match) {
          try {
            const base64Data = base64Match[1];
            const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
            const resultData = JSON.parse(jsonStr);
            actualExitCode = resultData.exit_code;
          } catch (decodeError) {
            console.error('[Python Tool] Failed to decode Base64 result:', decodeError);
          }
        }

        const success = actualExitCode === 0 && !isTimedOut && !isCancelled;

        if (success) {
          recordProgress({
            type: 'end',
            message: `Execution completed successfully in ${executionTime}ms`,
            timestamp: Date.now(),
          });

          resolve({
            success: true,
            stdout: actualStdout,
            stderr: actualStderr,
            exitCode: actualExitCode ?? 0,
            executionTime,
            encoding,
            progressHistory,
          });
        } else {
          // Build error message based on failure type
          let errorMessage: string;
          if (isCancelled) {
            errorMessage = 'Execution cancelled by user';
          } else if (isTimedOut) {
            const timeoutSec = Math.round(timeout / 1000);
            errorMessage = `Execution timed out after ${timeoutSec}s`;
          } else if (exitSignal) {
            errorMessage = `Process terminated by signal: ${exitSignal}`;
          } else if (actualExitCode === null && processExitCode === null) {
            errorMessage = 'Process terminated abnormally';
          } else {
            errorMessage = `Exited with code ${actualExitCode}`;
          }

          recordProgress({
            type: 'error',
            message: errorMessage,
            timestamp: Date.now(),
          });

          resolve({
            success: false,
            stdout: actualStdout,
            stderr: actualStderr,
            exitCode: actualExitCode ?? -1,
            error: errorMessage,
            executionTime,
            encoding,
            progressHistory,
          });
        }
      });

      pythonProcess.on('error', (error) => {
        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        signal?.removeEventListener('abort', onAbort);

        const executionTime = Date.now() - startTime;

        recordProgress({
          type: 'error',
          message: `Process error: ${error.message}`,
          timestamp: Date.now(),
        });

        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: `Failed to execute Python: ${error.message}`,
          executionTime,
          encoding,
          progressHistory,
        });
      });
    });

    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    recordProgress({
      type: 'error',
      message: `Execution error: ${error}`,
      timestamp: Date.now(),
    });

    return {
      success: false,
      error: `Execution error: ${error}`,
      executionTime,
      encoding,
      progressHistory,
    };
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }
    } catch (cleanupError) {
      recordProgress({
        type: 'stderr',
        message: `Failed to clean up temp file: ${cleanupError}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Remove ANSI color codes from string
 */
function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Format execution result for LLM
 * Always includes collected output even on failure/timeout
 * Provides comprehensive feedback so LLM understands what happened
 */
function formatResultForLLM(result: PythonExecutionResult): string {
  const lines: string[] = [];
  const execTimeSec = (result.executionTime / 1000).toFixed(1);

  if (result.success) {
    // Success case - show output with execution metadata
    lines.push(`[Python Execution Completed Successfully]`);
    lines.push(`Execution Time: ${execTimeSec}s`);
    lines.push(`Exit Code: ${result.exitCode ?? 0}`);
    lines.push('');

    if (result.stdout && result.stdout.trim().length > 0) {
      lines.push('Output:');
      lines.push(stripAnsiCodes(result.stdout));
    } else {
      lines.push('(No output produced)');
    }

    // Include stderr even on success (warnings, etc.)
    if (result.stderr && result.stderr.trim().length > 0) {
      lines.push('');
      lines.push('Warnings/Stderr:');
      lines.push(stripAnsiCodes(result.stderr));
    }

    return lines.join('\n');
  }

  // Failure case - detailed error information
  lines.push('[Python Execution Failed]');
  lines.push(`Execution Time: ${execTimeSec}s`);

  if (result.exitCode !== undefined && result.exitCode !== null) {
    lines.push(`Exit Code: ${result.exitCode}`);
  }

  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }

  // Always show stdout if any was collected (important for timeout cases)
  if (result.stdout && result.stdout.trim().length > 0) {
    lines.push('');
    lines.push('Output collected before failure:');
    lines.push('```');
    lines.push(stripAnsiCodes(result.stdout));
    lines.push('```');
  }

  if (result.stderr && result.stderr.trim().length > 0) {
    lines.push('');
    lines.push('Stderr:');
    lines.push('```');
    lines.push(stripAnsiCodes(result.stderr));
    lines.push('```');
  }

  // If no output at all, indicate this explicitly
  if ((!result.stdout || result.stdout.trim().length === 0) &&
      (!result.stderr || result.stderr.trim().length === 0)) {
    lines.push('');
    lines.push('(No output was captured before failure)');
  }

  return lines.join('\n');
}

/**
 * Global progress callback storage for sessions
 */
const progressCallbacks = new Map<string, ProgressCallback>();

/**
 * Register progress callback for a session
 */
export function registerProgressCallback(sessionId: string, callback: ProgressCallback): void {
  progressCallbacks.set(sessionId, callback);
}

/**
 * Unregister progress callback for a session
 */
export function unregisterProgressCallback(sessionId: string): void {
  progressCallbacks.delete(sessionId);
}

/**
 * Python tool schema
 */
const pythonToolSchema = {
  description: z.string().describe(
    'Brief description of what this Python code will do (e.g., "Read Excel file and calculate sum", "Generate sales report chart"). ' +
    'This helps with code review and approval.'
  ),
  code: z.string().describe(
    'Python code to execute. MUST be a complete, standalone script with ALL imports and variable definitions. ' +
    'Do NOT write code fragments that depend on previously defined context.'
  ),
  requirements: z.array(z.string()).optional().describe(
    'List of required Python packages (e.g., ["numpy", "pandas", "requests"]). ' +
    'Packages will be automatically checked and installed if missing.'
  ),
  timeout: z.number().optional().describe(
    'Timeout in milliseconds (default: 300000 / 5 minutes). Use longer timeout for file operations.'
  ),
};

/**
 * Create Python MCP server
 * Tool name will be: mcp__python__run
 */
export function createPythonMcpServer() {
  return createSdkMcpServer({
    name: 'python',
    version: '1.0.0',
    tools: [
      tool(
        'run',
        'Execute Python code using embedded Python 3.13 runtime. ' +
        'Write complete, standalone scripts with all necessary imports. ' +
        'Packages can be auto-installed via requirements parameter. ' +
        'Default timeout is 5 minutes. ' +
        'IMPORTANT: This runs on Windows. Do NOT use Unix paths like /tmp. ' +
        'Use tempfile.gettempdir() or os.environ.get("TEMP") for temp files. ' +
        'Use os.path.join() for cross-platform path handling.',
        pythonToolSchema,
        async (args, extra) => {
          const { description, code, requirements, timeout } = args;
          // workingDirectory is auto-injected by PreToolUse hook from session cwd
          const workingDirectory = (args as Record<string, unknown>).workingDirectory as string | undefined;

          // Log description for debugging
          if (description) {
            console.log(`[Python Tool] Task: ${description}`);
          }

          const result = await executePythonCode(code, {
            workingDir: workingDirectory || os.tmpdir(),
            requirements: requirements || [],
            timeout: timeout || 300000,
            signal: (extra as ToolExtra)?.signal,
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
 * Export the Python MCP server instance
 */
export const pythonMcpServer = createPythonMcpServer();

/**
 * Export for direct Python execution (useful for testing)
 */
export { executePythonCode };
