// ---
// description: Get currently trending ticker symbols on Yahoo Finance. HONEST LIMITATION: US market only - Yahoo's trending endpoint does not work for Japan. Follow up with get_quote for details on the returned symbols.
// safe: true
// ---

import { runTool, yahooFinance } from './_shared.js';

runTool(async () => {
  const result = await yahooFinance.trendingSymbols('US');
  return { region: 'US', symbols: result.quotes.map((q) => q.symbol) };
});
