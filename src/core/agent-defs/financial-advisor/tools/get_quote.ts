// ---
// description: Get real-time quotes (price, change, market cap, P/E, 52-week range) for up to 20 stock symbols. US tickers as-is (e.g. AAPL); Japanese stocks use the 4-digit code with .T suffix (e.g. Toyota = 7203.T). Yahoo data may be delayed 15-20 minutes. Symbols with no data are listed in noDataFor.
// safe: true
// args:
//   symbols: string[] (required, min 1, max 20) - Ticker symbols, e.g. ["AAPL", "7203.T"]
// ---

import { runTool, yahooFinance, toQuoteSnapshot, type QuoteSource } from './_shared.js';

interface Args {
  symbols: string[];
}

runTool<Args>(async ({ symbols }) => {
  // Assertion needed: the library's Quote union contains QuoteECNQuote,
  // whose declared members are erased by an Omit<> over an any-index-signature
  // interface, making the union unusable as-is.
  const quotes = (await yahooFinance.quote(symbols)) as QuoteSource[];
  const snapshots = quotes.map((q) => toQuoteSnapshot(q));
  const returned = new Set(snapshots.map((s) => s.symbol));
  const noDataFor = symbols.filter((s) => !returned.has(s));
  if (snapshots.length === 0) {
    throw new Error(`Yahoo Finance returned no data for any of: ${symbols.join(', ')}`);
  }
  return { quotes: snapshots, noDataFor };
});
