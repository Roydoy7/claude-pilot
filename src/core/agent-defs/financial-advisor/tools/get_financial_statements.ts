// ---
// description: Get historical financial statement line items (income statement, balance sheet, or cash flow) for a symbol, annually or quarterly. Returns the full set of line items Yahoo Finance reports for the period (the set of fields varies by company). "financials" = income statement.
// safe: true
// args:
//   symbol: string (required) - Ticker symbol, e.g. "AAPL" or "7203.T"
//   statement: enum[financials,balance-sheet,cash-flow] (required) - "financials" = income statement, or "balance-sheet" / "cash-flow"
//   period1: string (required) - Earliest period start date, YYYY-MM-DD
//   period2: string - Latest period end date, YYYY-MM-DD (default: today)
//   type: enum[annual,quarterly] (default annual) - Reporting period granularity
// ---

import { runTool, yahooFinance } from './_shared.js';

interface Args {
  symbol: string;
  statement: 'financials' | 'balance-sheet' | 'cash-flow';
  period1: string;
  period2?: string;
  type: 'annual' | 'quarterly';
}

runTool<Args>(async ({ symbol, statement, period1, period2, type }) => {
  const rows = await yahooFinance.fundamentalsTimeSeries(symbol, {
    period1,
    period2,
    type,
    module: statement,
  });
  return { symbol, statement, type, rows };
});
