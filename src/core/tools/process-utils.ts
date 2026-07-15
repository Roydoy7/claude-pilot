/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Shared child-process termination helper for the in-process tool runners
 * (python-mcp-server, typescript-mcp-server, script-runner).
 */

import { execFile, type ChildProcess } from 'child_process';

/**
 * Kill a child process, escalating after delayMs if it hasn't actually
 * exited. `ChildProcess.killed` reflects whether a signal was *sent*, not
 * whether the process *exited* - it flips true immediately after
 * `kill('SIGTERM')`, so checking it here would make the escalation branch
 * dead code for processes that ignore SIGTERM. `exitCode`/`signalCode` stay
 * null until the process has actually terminated, so they're the correct
 * check.
 */
export function killWithEscalation(child: ChildProcess, delayMs = 3000): void {
  child.kill('SIGTERM');
  const escalateTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      killProcessTree(child);
    }
  }, delayMs);
  child.once('close', () => clearTimeout(escalateTimer));
}

/**
 * Escalated kill. On Windows, SIGTERM/SIGKILL both map to TerminateProcess
 * and only affect the immediate child - grandchildren spawned by a Python/
 * Node script (subprocess.Popen, child_process.spawn, etc.) survive a plain
 * `child.kill('SIGKILL')`. `taskkill /T` walks and kills the whole process
 * tree rooted at the child's pid.
 */
function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {
      // Best-effort: taskkill fails if the process already exited between
      // our exitCode check and this call, which is fine - nothing to clean up.
    });
    return;
  }
  child.kill('SIGKILL');
}
