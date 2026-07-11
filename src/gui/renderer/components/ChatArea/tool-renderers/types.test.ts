import { describe, expect, it } from 'vitest';
import { parseMcpOutput } from './types';

describe('parseMcpOutput', () => {
  it('pretty prints JSON nested inside an MCP text envelope', () => {
    const output = JSON.stringify([
      { type: 'text', text: JSON.stringify({ data: { quotes: [{ symbol: 'NVDA', price: 210.96 }] } }) },
    ]);

    expect(parseMcpOutput(output)).toBe(JSON.stringify({ data: { quotes: [{ symbol: 'NVDA', price: 210.96 }] } }, null, 2));
  });

  it('preserves ordinary text from an MCP envelope', () => {
    const output = JSON.stringify([{ type: 'text', text: 'completed successfully' }]);
    expect(parseMcpOutput(output)).toBe('completed successfully');
  });
});
