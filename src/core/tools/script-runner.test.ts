/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for script-runner: executing agent-local tool scripts via the
 * embedded Python and tsx runtimes, per the stdin-JSON / stdout-JSON contract.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runToolScript } from './script-runner.js';
import { getProjectRoot } from './typescript-mcp-server.js';

const AGENT_ID = 'script-runner-test-fixture';
let toolsDir: string;

const ECHO_PY = `# ---
# description: Echo args back
# safe: true
# ---
import sys, json
args = json.load(sys.stdin)
print(json.dumps({"echo": args}))
`;

const FAIL_PY = `# ---
# description: Always fails
# safe: true
# ---
import sys
print("something went wrong", file=sys.stderr)
sys.exit(2)
`;

const SLEEP_PY = `# ---
# description: Sleeps forever
# safe: true
# ---
import time
time.sleep(30)
`;

const ECHO_TS = `// ---
// description: Echo args back
// safe: true
// ---
import { envelope } from './_helper.js';

let data = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  console.log(JSON.stringify(envelope(JSON.parse(data))));
});
`;

const HELPER_TS = `export function envelope(args: unknown): { echo: unknown } {
  return { echo: args };
}
`;

beforeAll(async () => {
  toolsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-pilot-tools-'));
  await Promise.all([
    fs.promises.writeFile(path.join(toolsDir, 'echo_tool.py'), ECHO_PY, 'utf-8'),
    fs.promises.writeFile(path.join(toolsDir, 'fail_tool.py'), FAIL_PY, 'utf-8'),
    fs.promises.writeFile(path.join(toolsDir, 'sleep_tool.py'), SLEEP_PY, 'utf-8'),
    fs.promises.writeFile(path.join(toolsDir, 'echo_tool.ts'), ECHO_TS, 'utf-8'),
    fs.promises.writeFile(path.join(toolsDir, '_helper.ts'), HELPER_TS, 'utf-8'),
  ]);
});

afterAll(async () => {
  await fs.promises.rm(toolsDir, { recursive: true, force: true });
  await fs.promises.rm(path.join(getProjectRoot(), '.agent-tools-temp', AGENT_ID), { recursive: true, force: true });
});

function spec(scriptName: string, argsJson: string, timeout = 60000) {
  return {
    runtime: scriptName.endsWith('.py') ? ('python' as const) : ('typescript' as const),
    scriptPath: path.join(toolsDir, scriptName),
    toolsDir,
    agentId: AGENT_ID,
    argsJson,
    timeout,
    requirements: [],
  };
}

describe('runToolScript', () => {
  it('runs a python script and passes args via stdin', async () => {
    const result = await runToolScript(spec('echo_tool.py', JSON.stringify({ symbols: ['AAPL'], count: 3 })));

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(JSON.parse(result.stdout)).toEqual({ echo: { symbols: ['AAPL'], count: 3 } });
  });

  it('reports non-zero exit with stderr for a failing script', async () => {
    const result = await runToolScript(spec('fail_tool.py', '{}'));

    expect(result.exitCode).toBe(2);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toContain('something went wrong');
  });

  it('kills a script that exceeds the timeout', async () => {
    const result = await runToolScript(spec('sleep_tool.py', '{}', 1500));

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  }, 20000);

  it('runs a typescript script from a copied tools dir with relative helper import', async () => {
    const result = await runToolScript(spec('echo_tool.ts', JSON.stringify({ query: 'Toyota' })));

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ echo: { query: 'Toyota' } });
  }, 30000);
});
