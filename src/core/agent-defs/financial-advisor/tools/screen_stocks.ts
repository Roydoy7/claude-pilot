// ---
// description: Run a predefined Yahoo Finance stock screener. HONEST LIMITATION: these screeners cover US-listed stocks only. There is no Japanese screener - for Japanese stock discovery, combine search_symbols, get_quote, get_fundamentals, and web search instead.
// safe: true
// args:
//   screener: enum[day_gainers,day_losers,most_actives,undervalued_large_caps,growth_technology_stocks,undervalued_growth_stocks] (required) - Predefined screener id
//   count: int (default 10, min 1, max 25) - Number of results (1-25)
// ---

import { runTool, yahooFinance, toQuoteSnapshot } from './_shared.js';

interface Args {
  screener:
    | 'day_gainers'
    | 'day_losers'
    | 'most_actives'
    | 'undervalued_large_caps'
    | 'growth_technology_stocks'
    | 'undervalued_growth_stocks';
  count: number;
}

runTool<Args>(async ({ screener, count }) => {
  const result = await yahooFinance.screener({ scrIds: screener, count });
  return {
    screener,
    title: result.title,
    results: result.quotes.map(toQuoteSnapshot),
  };
});
