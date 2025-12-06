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
}

/**
 * Get default Python executable path
 */
function getDefaultPythonPath(): string {
  // Use embedded Python from packages folder
  const embeddedPython = path.join(
    process.cwd(),
    'packages',
    'python-3.13.9-embed-amd64',
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
async function ensurePackagesInstalled(
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
    const wrappedCode = `# -*- coding: ${encoding} -*-
import sys
import io
import base64
import json
import traceback

# Force UTF-8 for internal processing
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Capture all output
_output_lines = []
_error_lines = []
_original_print = print

def print(*args, **kwargs):
    """Capture print output"""
    import io
    str_io = io.StringIO()
    _original_print(*args, file=str_io, **kwargs)
    output = str_io.getvalue()
    _output_lines.append(output)
    _original_print(*args, **kwargs)

# Execute user code
_exit_code = 0
try:
${code.split('\n').map((line) => '    ' + line).join('\n')}
except SystemExit as e:
    _exit_code = e.code if e.code else 0
except Exception as e:
    _error_lines.append(traceback.format_exc())
    _exit_code = 1

# Restore original print
print = _original_print

# Combine output
_final_output = ''.join(_output_lines)
_final_errors = ''.join(_error_lines)

# Output result with special markers
result_data = {
    "stdout": _final_output,
    "stderr": _final_errors,
    "exit_code": _exit_code
}

json_str = json.dumps(result_data, ensure_ascii=False)
encoded = base64.b64encode(json_str.encode('utf-8')).decode('ascii')
print(f"__PYTHON_RESULT_BASE64__{encoded}__END__")

sys.exit(_exit_code)`;

    await fs.promises.writeFile(tempFilePath, wrappedCode, { encoding });

    recordProgress({
      type: 'stdout',
      message: `Executing Python script (encoding: ${encoding})`,
      timestamp: Date.now(),
    });

    // Execute Python code
    const result = await new Promise<PythonExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';

      const pythonDir = path.dirname(pythonPath);
      const sitePackagesDir = path.join(pythonDir, 'Lib', 'site-packages');
      const existingPythonPath = process.env.PYTHONPATH || '';
      const pythonPathValue = existingPythonPath
        ? `${sitePackagesDir}${path.delimiter}${existingPythonPath}`
        : sitePackagesDir;

      const pythonProcess = spawn(pythonPath, [tempFilePath], {
        cwd: workingDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: encoding,
          PYTHONPATH: pythonPathValue,
        },
        timeout,
      });

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

      pythonProcess.on('close', (processExitCode) => {
        const executionTime = Date.now() - startTime;

        const base64Match = stdout.match(/__PYTHON_RESULT_BASE64__([A-Za-z0-9+/=]+)__END__/);

        let actualStdout = stdout.trim();
        let actualStderr = stderr.trim();
        let actualExitCode = processExitCode;

        if (base64Match) {
          try {
            const base64Data = base64Match[1];
            const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
            const resultData = JSON.parse(jsonStr);

            actualStdout = resultData.stdout || '';
            actualStderr = resultData.stderr || '';
            actualExitCode = resultData.exit_code;

            actualStdout = stdout.replace(/__PYTHON_RESULT_BASE64__[A-Za-z0-9+/=]+__END__/g, '').trim();
          } catch (decodeError) {
            console.error('[Python Tool] Failed to decode Base64 result:', decodeError);
          }
        }

        const success = actualExitCode === 0;

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
          let errorMessage: string;
          if (actualExitCode === null && processExitCode === null) {
            errorMessage = 'Python process was terminated abnormally (possible timeout or system kill)';
          } else {
            errorMessage = `Python script exited with error code ${actualExitCode}`;
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
        const executionTime = Date.now() - startTime;

        recordProgress({
          type: 'error',
          message: `Process error: ${error.message}`,
          timestamp: Date.now(),
        });

        resolve({
          success: false,
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
 */
function formatResultForLLM(result: PythonExecutionResult): string {
  const lines: string[] = [];

  if (result.success) {
    if (result.stdout) {
      lines.push(stripAnsiCodes(result.stdout));
    } else {
      lines.push('Script executed successfully (no output)');
    }
    return lines.join('\n');
  }

  lines.push('Python Execution Failed\n');

  if (result.exitCode !== undefined && result.exitCode !== null) {
    lines.push(`Exit Code: ${result.exitCode}`);
  }

  if (result.stdout && result.stdout.trim().length > 0) {
    lines.push('\nOutput:');
    lines.push('```');
    lines.push(stripAnsiCodes(result.stdout));
    lines.push('```');
  }

  if (result.stderr) {
    lines.push('\nError Details:');
    lines.push('```');
    lines.push(stripAnsiCodes(result.stderr));
    lines.push('```');
  }

  if (result.error) {
    lines.push(`\n${result.error}`);
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
        'Default timeout is 5 minutes.',
        pythonToolSchema,
        async (args) => {
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
