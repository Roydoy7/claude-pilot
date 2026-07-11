/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tool Frontmatter Parser - parses agent-local tool declarations.
 *
 * Each script in agent-defs/<id>/tools/ declares one tool. Metadata lives in a
 * comment block at the top of the script (comment prefix `#` for .py, `//` for
 * .ts), delimited by `---` lines:
 *
 *   // ---
 *   // description: Get real-time quotes for up to 20 stock symbols.
 *   // safe: true
 *   // timeout: 60000
 *   // requirements: yahoo-finance2
 *   // args:
 *   //   symbols: string[] (required, min 1, max 20) - Ticker symbols
 *   //   interval: enum[1d,1wk,1mo] (required) - Bar interval
 *   //   count: int (default 10, min 1, max 25) - Number of results
 *   // ---
 *
 * Arg line format: `name: type (modifiers...) - description`.
 * Types: string, int, number, boolean, string[], enum[a,b,c].
 * Modifiers: required, default <v>, min <n>, max <n>.
 * Any deviation throws with the file path - no fallback.
 */

import { z } from 'zod';

export type ToolRuntime = 'python' | 'typescript';

interface ToolArgBase {
  name: string;
  required: boolean;
  description: string;
}

export interface StringToolArg extends ToolArgBase {
  kind: 'string';
  defaultValue?: string;
}

export interface EnumToolArg extends ToolArgBase {
  kind: 'enum';
  values: string[];
  defaultValue?: string;
}

export interface IntToolArg extends ToolArgBase {
  kind: 'int';
  min?: number;
  max?: number;
  defaultValue?: number;
}

export interface NumberToolArg extends ToolArgBase {
  kind: 'number';
  min?: number;
  max?: number;
  defaultValue?: number;
}

export interface BooleanToolArg extends ToolArgBase {
  kind: 'boolean';
  defaultValue?: boolean;
}

export interface StringArrayToolArg extends ToolArgBase {
  kind: 'string[]';
  min?: number;
  max?: number;
}

export type ToolArg =
  | StringToolArg
  | EnumToolArg
  | IntToolArg
  | NumberToolArg
  | BooleanToolArg
  | StringArrayToolArg;

export interface ToolFrontmatter {
  description: string;
  safe: boolean;
  /** Milliseconds, defaults to 60000 */
  timeout: number;
  /** pip packages (python) or npm packages (typescript) */
  requirements: string[];
  args: ToolArg[];
}

const TOOL_NAME_PATTERN = /^[a-z0-9_]+$/;
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Derive tool name and runtime from a script file name.
 * Throws on unsupported extensions or invalid tool names.
 */
export function parseToolFileName(fileName: string): { name: string; runtime: ToolRuntime } {
  let runtime: ToolRuntime;
  let name: string;
  if (fileName.endsWith('.py')) {
    runtime = 'python';
    name = fileName.slice(0, -'.py'.length);
  } else if (fileName.endsWith('.ts')) {
    runtime = 'typescript';
    name = fileName.slice(0, -'.ts'.length);
  } else {
    throw new Error(`Unsupported tool script extension (expected .py or .ts): ${fileName}`);
  }
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid tool name "${name}" from file ${fileName} (must match ${TOOL_NAME_PATTERN.source})`);
  }
  return { name, runtime };
}

/**
 * Extract the `---` ... `---` frontmatter block from the top comment of a script.
 * Returns the lines between the delimiters with comment prefixes stripped.
 */
function extractFrontmatterLines(content: string, filePath: string): string[] {
  const lines = content.split(/\r?\n/);
  const stripped: string[] = [];
  let inBlock = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!inBlock && trimmed === '') {
      continue;
    }
    let body: string;
    if (trimmed.startsWith('#')) {
      body = trimmed.slice(1);
    } else if (trimmed.startsWith('//')) {
      body = trimmed.slice(2);
    } else {
      if (inBlock) {
        throw new Error(`Unterminated frontmatter block (missing closing ---) in ${filePath}`);
      }
      throw new Error(`Missing frontmatter block (expected a leading comment block delimited by ---) in ${filePath}`);
    }
    // Strip exactly one leading space after the comment marker, preserving arg indentation
    if (body.startsWith(' ')) {
      body = body.slice(1);
    }
    if (!inBlock) {
      if (body.trim() === '---') {
        inBlock = true;
        continue;
      }
      throw new Error(`Missing frontmatter block (first comment line must be ---) in ${filePath}`);
    }
    if (body.trim() === '---') {
      return stripped;
    }
    stripped.push(body);
  }

  throw new Error(`Unterminated frontmatter block (missing closing ---) in ${filePath}`);
}

const ARG_LINE_PATTERN = /^(\w+):\s+(\S+?)(?:\s+\(([^)]*)\))?\s+-\s+(.+)$/;

interface ParsedModifiers {
  required: boolean;
  defaultRaw?: string;
  min?: number;
  max?: number;
}

function parseModifiers(raw: string | undefined, context: string): ParsedModifiers {
  const result: ParsedModifiers = { required: false };
  if (!raw || raw.trim() === '') {
    return result;
  }
  for (const part of raw.split(',').map((p) => p.trim())) {
    if (part === 'required') {
      result.required = true;
    } else if (part.startsWith('default ')) {
      result.defaultRaw = part.slice('default '.length).trim();
    } else if (part.startsWith('min ')) {
      result.min = parseNumberStrict(part.slice('min '.length).trim(), `min modifier in ${context}`);
    } else if (part.startsWith('max ')) {
      result.max = parseNumberStrict(part.slice('max '.length).trim(), `max modifier in ${context}`);
    } else {
      throw new Error(`Unknown arg modifier "${part}" in ${context}`);
    }
  }
  if (result.required && result.defaultRaw !== undefined) {
    throw new Error(`Conflicting modifiers "required" and "default" in ${context}`);
  }
  return result;
}

function parseNumberStrict(raw: string, context: string): number {
  const value = Number(raw);
  if (raw === '' || Number.isNaN(value)) {
    throw new Error(`Invalid number "${raw}" in ${context}`);
  }
  return value;
}

function parseBooleanStrict(raw: string, context: string): boolean {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`Invalid boolean "${raw}" (expected true or false) in ${context}`);
}

function parseArgLine(line: string, filePath: string): ToolArg {
  const match = ARG_LINE_PATTERN.exec(line.trim());
  if (!match) {
    throw new Error(`Invalid arg line "${line.trim()}" (expected "name: type (modifiers) - description") in ${filePath}`);
  }
  const [, name, typeToken, modifiersRaw, description] = match as unknown as [string, string, string, string | undefined, string];
  const context = `arg "${name}" of ${filePath}`;
  const modifiers = parseModifiers(modifiersRaw, context);
  const base: ToolArgBase = { name, required: modifiers.required, description };

  const enumMatch = /^enum\[([^\]]+)\]$/.exec(typeToken);
  if (enumMatch) {
    const values = (enumMatch[1] ?? '').split(',').map((v) => v.trim()).filter((v) => v !== '');
    if (values.length === 0) {
      throw new Error(`Empty enum values in ${context}`);
    }
    if (modifiers.min !== undefined || modifiers.max !== undefined) {
      throw new Error(`min/max not supported for enum in ${context}`);
    }
    if (modifiers.defaultRaw !== undefined && !values.includes(modifiers.defaultRaw)) {
      throw new Error(`Default "${modifiers.defaultRaw}" is not one of the enum values in ${context}`);
    }
    return { ...base, kind: 'enum', values, defaultValue: modifiers.defaultRaw };
  }

  switch (typeToken) {
    case 'string':
      if (modifiers.min !== undefined || modifiers.max !== undefined) {
        throw new Error(`min/max not supported for string in ${context}`);
      }
      return { ...base, kind: 'string', defaultValue: modifiers.defaultRaw };
    case 'int':
    case 'number': {
      const defaultValue = modifiers.defaultRaw !== undefined ? parseNumberStrict(modifiers.defaultRaw, context) : undefined;
      if (typeToken === 'int') {
        return { ...base, kind: 'int', min: modifiers.min, max: modifiers.max, defaultValue };
      }
      return { ...base, kind: 'number', min: modifiers.min, max: modifiers.max, defaultValue };
    }
    case 'boolean':
      if (modifiers.min !== undefined || modifiers.max !== undefined) {
        throw new Error(`min/max not supported for boolean in ${context}`);
      }
      return {
        ...base,
        kind: 'boolean',
        defaultValue: modifiers.defaultRaw !== undefined ? parseBooleanStrict(modifiers.defaultRaw, context) : undefined,
      };
    case 'string[]':
      if (modifiers.defaultRaw !== undefined) {
        throw new Error(`default not supported for string[] in ${context}`);
      }
      return { ...base, kind: 'string[]', min: modifiers.min, max: modifiers.max };
    default:
      throw new Error(`Unknown arg type "${typeToken}" in ${context}`);
  }
}

/**
 * Parse the frontmatter of a tool script. Throws with the file path on any
 * missing or malformed declaration.
 */
export function parseToolFrontmatter(content: string, filePath: string): ToolFrontmatter {
  const lines = extractFrontmatterLines(content, filePath);

  let description: string | undefined;
  let safe: boolean | undefined;
  let timeout = DEFAULT_TIMEOUT_MS;
  let requirements: string[] = [];
  const args: ToolArg[] = [];
  let inArgs = false;

  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }
    if (inArgs && /^\s/.test(line)) {
      args.push(parseArgLine(line, filePath));
      continue;
    }
    inArgs = false;
    const keyMatch = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!keyMatch) {
      throw new Error(`Invalid frontmatter line "${line.trim()}" in ${filePath}`);
    }
    const [, key, value] = keyMatch as unknown as [string, string, string];
    switch (key) {
      case 'description':
        description = value.trim();
        break;
      case 'safe':
        safe = parseBooleanStrict(value.trim(), `safe key of ${filePath}`);
        break;
      case 'timeout':
        timeout = parseNumberStrict(value.trim(), `timeout key of ${filePath}`);
        break;
      case 'requirements':
        requirements = value.split(',').map((r) => r.trim()).filter((r) => r !== '');
        break;
      case 'args':
        if (value.trim() !== '') {
          throw new Error(`args key must have no inline value (list args on indented lines) in ${filePath}`);
        }
        inArgs = true;
        break;
      default:
        throw new Error(`Unknown frontmatter key "${key}" in ${filePath}`);
    }
  }

  if (!description) {
    throw new Error(`Missing or empty description in frontmatter of ${filePath}`);
  }
  if (safe === undefined) {
    throw new Error(`Missing safe declaration in frontmatter of ${filePath}`);
  }
  const seen = new Set<string>();
  for (const arg of args) {
    if (seen.has(arg.name)) {
      throw new Error(`Duplicate arg "${arg.name}" in ${filePath}`);
    }
    seen.add(arg.name);
  }

  return { description, safe, timeout, requirements, args };
}

/**
 * Build the zod raw shape for the SDK tool() call from parsed args.
 */
export function buildZodShape(args: ToolArg[]): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const arg of args) {
    shape[arg.name] = buildZodType(arg);
  }
  return shape;
}

function buildZodType(arg: ToolArg): z.ZodType {
  let schema: z.ZodType;
  switch (arg.kind) {
    case 'string':
      schema = withDefault(z.string(), arg.defaultValue, arg.required);
      break;
    case 'enum':
      schema = withDefault(z.enum(arg.values as [string, ...string[]]), arg.defaultValue, arg.required);
      break;
    case 'int': {
      let num = z.number().int();
      if (arg.min !== undefined) {
        num = num.min(arg.min);
      }
      if (arg.max !== undefined) {
        num = num.max(arg.max);
      }
      schema = withDefault(num, arg.defaultValue, arg.required);
      break;
    }
    case 'number': {
      let num = z.number();
      if (arg.min !== undefined) {
        num = num.min(arg.min);
      }
      if (arg.max !== undefined) {
        num = num.max(arg.max);
      }
      schema = withDefault(num, arg.defaultValue, arg.required);
      break;
    }
    case 'boolean':
      schema = withDefault(z.boolean(), arg.defaultValue, arg.required);
      break;
    case 'string[]': {
      let arr = z.array(z.string());
      if (arg.min !== undefined) {
        arr = arr.min(arg.min);
      }
      if (arg.max !== undefined) {
        arr = arr.max(arg.max);
      }
      schema = withDefault(arr, undefined, arg.required);
      break;
    }
  }
  return schema.describe(arg.description);
}

function withDefault<T extends z.ZodType>(schema: T, defaultValue: unknown, required: boolean): z.ZodType {
  if (defaultValue !== undefined) {
    return schema.default(defaultValue as never);
  }
  if (!required) {
    return schema.optional();
  }
  return schema;
}
