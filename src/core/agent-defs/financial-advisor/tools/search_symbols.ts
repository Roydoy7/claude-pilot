// ---
// description: Search Yahoo Finance for ticker symbols by company name. IMPORTANT: the query must be in English/romaji - Yahoo's search API rejects Japanese-script queries (translate company names to English first, e.g. "トヨタ自動車" -> "Toyota"). Japanese listings appear with a .T suffix.
// safe: true
// args:
//   query: string (required) - Company name or ticker fragment, in English
// ---

import { runTool, yahooFinance } from './_shared.js';

interface Args {
  query: string;
}

runTool<Args>(async ({ query }) => {
  const result = await yahooFinance.search(query);
  const matches = result.quotes.flatMap((q) =>
    'symbol' in q
      ? [
          {
            symbol: q.symbol,
            shortname: 'shortname' in q ? q.shortname : undefined,
            longname: 'longname' in q ? q.longname : undefined,
            exchange: q.exchange,
            exchangeDisplay: 'exchDisp' in q ? q.exchDisp : undefined,
            quoteType: 'quoteType' in q ? q.quoteType : undefined,
          },
        ]
      : [],
  );
  return { query, matches };
});
