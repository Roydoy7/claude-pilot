/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Script Runner - executes agent-local tool scripts (agent-defs/<id>/tools/)
 * using the same runtimes the platform already ships: the embedded Python for
 * .py tools and tsx for .ts tools.
 *
 * I/O contract (see IMPROVEMENT-PLAN.md P2+):
 * - spawn `<runtime> <scriptPath>`; validated args are written to stdin as
 *   UTF-8 JSON, then stdin is closed
 * - the script prints its result JSON to stdout and exits 0; on failure it
 *   prints an error and exits non-zero
 * - infrastructure failures (package install, spawn) throw; script failures
 *   are reported via exitCode so the caller can mark the tool result isError
 *
 * TypeScript tools are copied (whole tools/ dir) to
 * <projectRoot>/.agent-tools-temp/<agentId>/ before each run: ESM/tsx resolves
 * modules by walking up from the script file, and packaged agent-defs live
 * under resources/ where node_modules is unreachable. Copying preserves
 * relative imports of _-prefixed helper files and makes edits take effect on
 * the next call.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getDefaultPythonPath, ensurePackagesInstalled } from './python-mcp-server.js';
import { getProjectRoot, getTsxCommand, installPackages } from './typescript-mcp-server.js';
import { killWithEscalation } from './process-utils.js';
import type { ToolRuntime } from '../agents/tool-frontmatter.js';

export interface ToolScriptSpec {
  runtime: ToolRuntime;
  /** Absolute path to the tool script inside the agent's tools/ directory */
  scriptPath: string;
  /** Absolute path to the agent's tools/ directory */
  toolsDir: string;
  agentId: string;
  /** JSON-serialized, zod-validated tool arguments, written to the script's stdin */
  argsJson: string;
  /** Milliseconds */
  timeout: number;
  /** pip packages (python) or npm packages (typescript) */
  requirements: string[];
  /** Aborts the running script when the user cancels the agent turn */
  signal?: AbortSignal;
}

export interface ToolScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  cancelled: boolean;
}

export async function runToolScript(spec: ToolScriptSpec): Promise<ToolScriptResult> {
  if (spec.runtime === 'python') {
    return runPythonToolScript(spec);
  }
  return runTypeScriptToolScript(spec);
}

async function runPythonToolScript(spec: ToolScriptSpec): Promise<ToolScriptResult> {
  const pythonPath = getDefaultPythonPath();

  if (spec.requirements.length > 0) {
    const installResult = await ensurePackagesInstalled(pythonPath, spec.requirements);
    if (!installResult.success) {
      throw new Error(`Failed to install python requirements for ${spec.scriptPath}:\n${installResult.errors.join('\n')}`);
    }
  }

  const pythonDir = path.dirname(pythonPath);
  const sitePackagesDir = path.join(pythonDir, 'Lib', 'site-packages');
  const existingPythonPath = process.env.PYTHONPATH || '';
  const pythonPathValue = existingPythonPath ? `${sitePackagesDir}${path.delimiter}${existingPythonPath}` : sitePackagesDir;

  return spawnScript(
    pythonPath,
    ['-u', spec.scriptPath],
    {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONPATH: pythonPathValue,
      PYTHONUNBUFFERED: '1',
    },
    false,
    path.dirname(spec.scriptPath),
    spec,
  );
}

async function runTypeScriptToolScript(spec: ToolScriptSpec): Promise<ToolScriptResult> {
  const projectRoot = getProjectRoot();

  if (spec.requirements.length > 0) {
    const installResult = await installPackages(projectRoot, spec.requirements);
    if (!installResult.success) {
      throw new Error(`Failed to install npm requirements for ${spec.scriptPath}:\n${installResult.errors.join('\n')}`);
    }
  }

  // Copy the whole tools/ dir next to node_modules so tsx module resolution works
  const tempToolsDir = path.join(projectRoot, '.agent-tools-temp', spec.agentId);
  await fs.promises.rm(tempToolsDir, { recursive: true, force: true });
  await fs.promises.cp(spec.toolsDir, tempToolsDir, { recursive: true });

  const copiedScript = path.join(tempToolsDir, path.relative(spec.toolsDir, spec.scriptPath));
  const { command, args, useShell, env: tsxEnv } = getTsxCommand(copiedScript);

  return spawnScript(
    command,
    args,
    {
      ...process.env,
      ...tsxEnv,
      NODE_OPTIONS: '--no-warnings',
      NODE_PATH: path.join(projectRoot, 'node_modules'),
    },
    useShell,
    path.dirname(copiedScript),
    spec,
  );
}

function spawnScript(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  useShell: boolean,
  cwd: string,
  spec: ToolScriptSpec,
): Promise<ToolScriptResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: useShell,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killWithEscalation(child);
    }, spec.timeout);

    const onAbort = () => {
      cancelled = true;
      killWithEscalation(child);
    };
    if (spec.signal) {
      if (spec.signal.aborted) {
        onAbort();
      } else {
        spec.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      spec.signal?.removeEventListener('abort', onAbort);
      reject(new Error(`Failed to spawn tool script ${spec.scriptPath}: ${error.message}`));
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);
      spec.signal?.removeEventListener('abort', onAbort);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? -1,
        timedOut,
        cancelled,
      });
    });

    child.stdin.on('error', () => {
      // The script may exit without reading stdin (e.g. no-arg tools);
      // the resulting EPIPE must not crash the host - 'close' still reports the outcome.
    });
    child.stdin.write(spec.argsJson, 'utf-8');
    child.stdin.end();
  });
}
