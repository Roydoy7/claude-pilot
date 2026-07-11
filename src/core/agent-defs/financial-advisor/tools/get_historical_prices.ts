// ---
// description: Get historical OHLCV price data for one symbol (US or Japanese .T ticker). Choose the interval so the range stays under 300 rows; excess rows are truncated (oldest dropped) and reported.
// safe: true
// args:
//   symbol: string (required) - Ticker symbol, e.g. "AAPL" or "7203.T"
//   period1: string (required) - Start date, YYYY-MM-DD
//   period2: string - End date, YYYY-MM-DD (default: today)
//   interval: enum[1d,1wk,1mo] (required) - Bar interval
// ---

import { runTool, yahooFinance } from './_shared.js';

interface Args {
  symbol: string;
  period1: string;
  period2?: string;
  interval: '1d' | '1wk' | '1mo';
}

const MAX_HISTORY_ROWS = 300;

runTool<Args>(async ({ symbol, period1, period2, interval }) => {
  const result = await yahooFinance.chart(symbol, { period1, period2, interval });
  const rows = result.quotes.map((row) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
  const truncated = rows.length > MAX_HISTORY_ROWS;
  return {
    symbol,
    currency: result.meta.currency,
    interval,
    rows: truncated ? rows.slice(rows.length - MAX_HISTORY_ROWS) : rows,
    note: truncated
      ? `${String(rows.length - MAX_HISTORY_ROWS)} oldest rows omitted (limit ${String(MAX_HISTORY_ROWS)}); request a coarser interval for full coverage`
      : undefined,
  };
});
