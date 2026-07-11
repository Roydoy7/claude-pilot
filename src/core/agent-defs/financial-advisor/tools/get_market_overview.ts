// ---
// description: Get a snapshot of major US and Japanese market indicators: S&P 500, NASDAQ, Dow Jones, Nikkei 225, a TOPIX ETF (explicit proxy - the TOPIX index itself is not on Yahoo Finance), and USD/JPY. Instruments that fail to load are reported individually with their real error.
// safe: true
// ---

import { runTool, yahooFinance, toQuoteSnapshot, type QuoteSource } from './_shared.js';

const OVERVIEW_INSTRUMENTS: ReadonlyArray<{ symbol: string; label: string }> = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ Composite' },
  { symbol: '^DJI', label: 'Dow Jones Industrial Average' },
  { symbol: '^N225', label: 'Nikkei 225' },
  { symbol: '1306.T', label: 'NEXT FUNDS TOPIX ETF — proxy for the TOPIX index (the index itself is not available on Yahoo Finance)' },
  { symbol: 'USDJPY=X', label: 'USD/JPY exchange rate' },
];

runTool(async () => {
  const settled = await Promise.allSettled(
    OVERVIEW_INSTRUMENTS.map(async ({ symbol }) => {
      const quotes = await yahooFinance.quote([symbol]);
      const quote = quotes[0];
      if (quote === undefined) {
        throw new Error(`Yahoo Finance returned no data for ${symbol}`);
      }
      return quote;
    }),
  );
  const instruments = settled.map((outcome, i) => {
    const { symbol, label } = OVERVIEW_INSTRUMENTS[i] as { symbol: string; label: string };
    if (outcome.status === 'rejected') {
      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      return { symbol, label, error: message };
    }
    // Same QuoteECNQuote assertion rationale as in get_quote.
    return { symbol, label, quote: toQuoteSnapshot(outcome.value as QuoteSource) };
  });
  if (instruments.every((entry) => 'error' in entry)) {
    throw new Error('all instruments failed to load');
  }
  return { instruments };
});
