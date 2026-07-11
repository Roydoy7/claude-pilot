/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for tool-frontmatter: parsing agent-local tool script declarations
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseToolFrontmatter, parseToolFileName, buildZodShape } from './tool-frontmatter.js';

const FILE = 'agent-defs/test/tools/example.ts';

function tsFrontmatter(lines: string[]): string {
  return ['// ---', ...lines.map((l) => `// ${l}`), '// ---', '', 'console.log("body");'].join('\n');
}

function pyFrontmatter(lines: string[]): string {
  return ['# ---', ...lines.map((l) => `# ${l}`), '# ---', '', 'print("body")'].join('\n');
}

describe('parseToolFileName', () => {
  it('derives name and runtime from extensions', () => {
    expect(parseToolFileName('get_quote.ts')).toEqual({ name: 'get_quote', runtime: 'typescript' });
    expect(parseToolFileName('school_lookup.py')).toEqual({ name: 'school_lookup', runtime: 'python' });
  });

  it('throws on unsupported extension', () => {
    expect(() => parseToolFileName('tool.js')).toThrow(/Unsupported tool script extension/);
  });

  it('throws on invalid tool names', () => {
    expect(() => parseToolFileName('Get-Quote.ts')).toThrow(/Invalid tool name/);
    expect(() => parseToolFileName('get quote.py')).toThrow(/Invalid tool name/);
  });
});

describe('parseToolFrontmatter', () => {
  it('parses a full declaration with // comments', () => {
    const content = tsFrontmatter([
      'description: Get real-time quotes for stocks.',
      'safe: true',
      'timeout: 30000',
      'requirements: yahoo-finance2, zod',
      'args:',
      '  symbols: string[] (required, min 1, max 20) - Ticker symbols',
      '  interval: enum[1d,1wk,1mo] (required) - Bar interval',
      '  count: int (default 10, min 1, max 25) - Number of results',
      '  note: string - Optional note',
      '  verbose: boolean (default false) - Verbose output',
      '  factor: number (min 0.5, max 2.5) - Scale factor',
    ]);
    const fm = parseToolFrontmatter(content, FILE);

    expect(fm.description).toBe('Get real-time quotes for stocks.');
    expect(fm.safe).toBe(true);
    expect(fm.timeout).toBe(30000);
    expect(fm.requirements).toEqual(['yahoo-finance2', 'zod']);
    expect(fm.args).toEqual([
      { name: 'symbols', kind: 'string[]', required: true, min: 1, max: 20, description: 'Ticker symbols' },
      { name: 'interval', kind: 'enum', values: ['1d', '1wk', '1mo'], required: true, defaultValue: undefined, description: 'Bar interval' },
      { name: 'count', kind: 'int', required: false, min: 1, max: 25, defaultValue: 10, description: 'Number of results' },
      { name: 'note', kind: 'string', required: false, defaultValue: undefined, description: 'Optional note' },
      { name: 'verbose', kind: 'boolean', required: false, defaultValue: false, description: 'Verbose output' },
      { name: 'factor', kind: 'number', required: false, min: 0.5, max: 2.5, defaultValue: undefined, description: 'Scale factor' },
    ]);
  });

  it('parses a declaration with # comments and applies defaults', () => {
    const content = pyFrontmatter(['description: Look up a school.', 'safe: false']);
    const fm = parseToolFrontmatter(content, FILE);

    expect(fm.description).toBe('Look up a school.');
    expect(fm.safe).toBe(false);
    expect(fm.timeout).toBe(60000);
    expect(fm.requirements).toEqual([]);
    expect(fm.args).toEqual([]);
  });

  it('throws when the frontmatter block is missing', () => {
    expect(() => parseToolFrontmatter('console.log("no frontmatter");', FILE)).toThrow(/Missing frontmatter block/);
  });

  it('throws when the frontmatter block is unterminated', () => {
    const content = ['// ---', '// description: x', '// safe: true', 'console.log(1);'].join('\n');
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/Unterminated frontmatter block/);
  });

  it('throws on missing description', () => {
    expect(() => parseToolFrontmatter(tsFrontmatter(['safe: true']), FILE)).toThrow(/Missing or empty description/);
  });

  it('throws on missing safe', () => {
    expect(() => parseToolFrontmatter(tsFrontmatter(['description: x']), FILE)).toThrow(/Missing safe declaration/);
  });

  it('throws on invalid safe value', () => {
    expect(() => parseToolFrontmatter(tsFrontmatter(['description: x', 'safe: yes']), FILE)).toThrow(/Invalid boolean/);
  });

  it('throws on unknown frontmatter key', () => {
    expect(() => parseToolFrontmatter(tsFrontmatter(['description: x', 'safe: true', 'color: red']), FILE)).toThrow(
      /Unknown frontmatter key "color"/,
    );
  });

  it('throws on unknown arg type', () => {
    const content = tsFrontmatter(['description: x', 'safe: true', 'args:', '  data: object (required) - Some data']);
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/Unknown arg type "object"/);
  });

  it('throws on malformed arg line', () => {
    const content = tsFrontmatter(['description: x', 'safe: true', 'args:', '  just some words']);
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/Invalid arg line/);
  });

  it('throws on unknown modifier', () => {
    const content = tsFrontmatter(['description: x', 'safe: true', 'args:', '  a: string (optional) - A']);
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/Unknown arg modifier "optional"/);
  });

  it('throws on conflicting required and default', () => {
    const content = tsFrontmatter(['description: x', 'safe: true', 'args:', '  a: int (required, default 1) - A']);
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/Conflicting modifiers/);
  });

  it('throws on duplicate arg names', () => {
    const content = tsFrontmatter(['description: x', 'safe: true', 'args:', '  a: string (required) - A', '  a: int (required) - A again']);
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/Duplicate arg "a"/);
  });

  it('throws on enum default outside values', () => {
    const content = tsFrontmatter(['description: x', 'safe: true', 'args:', '  mode: enum[a,b] (default c) - Mode']);
    expect(() => parseToolFrontmatter(content, FILE)).toThrow(/not one of the enum values/);
  });
});

describe('buildZodShape', () => {
  it('validates according to declared constraints', () => {
    const fm = parseToolFrontmatter(
      tsFrontmatter([
        'description: x',
        'safe: true',
        'args:',
        '  symbols: string[] (required, min 1, max 3) - Symbols',
        '  interval: enum[1d,1wk] (required) - Interval',
        '  count: int (default 10, min 1, max 25) - Count',
      ]),
      FILE,
    );
    const schema = z.object(buildZodShape(fm.args));

    const good = schema.parse({ symbols: ['AAPL'], interval: '1d' });
    expect(good).toEqual({ symbols: ['AAPL'], interval: '1d', count: 10 });

    expect(() => schema.parse({ symbols: [], interval: '1d' })).toThrow();
    expect(() => schema.parse({ symbols: ['A', 'B', 'C', 'D'], interval: '1d' })).toThrow();
    expect(() => schema.parse({ symbols: ['A'], interval: '5m' })).toThrow();
    expect(() => schema.parse({ symbols: ['A'], interval: '1d', count: 26 })).toThrow();
    expect(() => schema.parse({ symbols: ['A'], interval: '1d', count: 2.5 })).toThrow();
    expect(() => schema.parse({ interval: '1d' })).toThrow();
  });

  it('makes non-required args without default optional', () => {
    const fm = parseToolFrontmatter(tsFrontmatter(['description: x', 'safe: true', 'args:', '  note: string - Note']), FILE);
    const schema = z.object(buildZodShape(fm.args));

    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ note: 'hi' })).toEqual({ note: 'hi' });
  });
});
