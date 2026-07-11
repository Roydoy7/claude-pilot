/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Shared helpers for the financial-advisor local tools (Yahoo Finance +
 * SEC EDGAR). Underscore prefix = not a tool, just a helper module.
 *
 * Execution contract (script-runner.ts): validated args arrive as JSON on
 * stdin; the result JSON is printed to stdout and the process exits 0; on
 * failure the error is printed to stderr and the process exits 1.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import YahooFinance from 'yahoo-finance2';

export const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const DATA_SOURCE = 'Yahoo Finance via yahoo-finance2';

function readArgs<TArgs>(): Promise<TArgs> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data) as TArgs);
      } catch (err) {
        reject(new Error(`Failed to parse tool arguments from stdin: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Tool entry point: reads args from stdin, runs the handler, prints the
 * result envelope to stdout. Any thrown error goes to stderr with exit 1 -
 * the host maps that to an isError tool result.
 */
export function runTool<TArgs>(handler: (args: TArgs) => Promise<unknown>): void {
  void (async () => {
    try {
      const args = await readArgs<TArgs>();
      const data = await handler(args);
      process.stdout.write(JSON.stringify({ source: DATA_SOURCE, fetchedAt: new Date().toISOString(), data }));
    } catch (err) {
      process.stderr.write(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })();
}

// Structural view of the yahoo-finance2 quote fields these tools read.
// The library's own Quote union degrades to `any` member access (its
// QuoteECNQuote variant is an Omit<> over an any-index-signature interface),
// so we type the extraction explicitly; assignability is checked at call sites.
export interface QuoteSource {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  fullExchangeName?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: Date | number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface QuoteSnapshot {
  symbol: string | undefined;
  shortName: string | undefined;
  longName: string | undefined;
  currency: string | undefined;
  fullExchangeName: string | undefined;
  marketState: string | undefined;
  regularMarketPrice: number | undefined;
  regularMarketChange: number | undefined;
  regularMarketChangePercent: number | undefined;
  regularMarketTime: Date | number | undefined;
  regularMarketVolume: number | undefined;
  averageDailyVolume3Month: number | undefined;
  marketCap: number | undefined;
  trailingPE: number | undefined;
  forwardPE: number | undefined;
  epsTrailingTwelveMonths: number | undefined;
  dividendYield: number | undefined;
  fiftyTwoWeekHigh: number | undefined;
  fiftyTwoWeekLow: number | undefined;
}

export function toQuoteSnapshot(q: QuoteSource): QuoteSnapshot {
  return {
    symbol: q.symbol,
    shortName: q.shortName,
    longName: q.longName,
    currency: q.currency,
    fullExchangeName: q.fullExchangeName,
    marketState: q.marketState,
    regularMarketPrice: q.regularMarketPrice,
    regularMarketChange: q.regularMarketChange,
    regularMarketChangePercent: q.regularMarketChangePercent,
    regularMarketTime: q.regularMarketTime,
    regularMarketVolume: q.regularMarketVolume,
    averageDailyVolume3Month: q.averageDailyVolume3Month,
    marketCap: q.marketCap,
    trailingPE: q.trailingPE,
    forwardPE: q.forwardPE,
    epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
    dividendYield: q.dividendYield,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
  };
}

/**
 * SEC EDGAR is the official US SEC filing system - zero auth, but requires a descriptive User-Agent.
 */
export const SEC_USER_AGENT = 'claude-pilot financial-advisor tools (contact: roydoy7@gmail.com)';

interface SecCikEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

// The ticker->CIK map is ~10,000 entries. Each tool call is a fresh process,
// so it is cached on disk with a 24h TTL. A fetch failure throws even when a
// stale cache file exists - stale data as a fallback is forbidden.
const CIK_CACHE_FILE = path.join(os.tmpdir(), 'claude-pilot-sec-ciks.json');
const CIK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function loadSecCikMap(): Promise<Map<string, SecCikEntry>> {
  let raw: Record<string, SecCikEntry> | null = null;

  if (fs.existsSync(CIK_CACHE_FILE) && Date.now() - fs.statSync(CIK_CACHE_FILE).mtimeMs < CIK_CACHE_TTL_MS) {
    raw = JSON.parse(fs.readFileSync(CIK_CACHE_FILE, 'utf-8')) as Record<string, SecCikEntry>;
  } else {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': SEC_USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`SEC ticker list request failed: HTTP ${String(res.status)}`);
    }
    raw = (await res.json()) as Record<string, SecCikEntry>;
    fs.writeFileSync(CIK_CACHE_FILE, JSON.stringify(raw), 'utf-8');
  }

  const map = new Map<string, SecCikEntry>();
  for (const entry of Object.values(raw)) {
    map.set(entry.ticker.toUpperCase(), entry);
  }
  return map;
}

export async function resolveCik(ticker: string): Promise<{ cik: string; company: string } | null> {
  const map = await loadSecCikMap();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) {
    return null;
  }
  return { cik: String(entry.cik_str).padStart(10, '0'), company: entry.title };
}
