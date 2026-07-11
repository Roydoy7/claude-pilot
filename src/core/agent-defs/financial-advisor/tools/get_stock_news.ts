// ---
// description: Get recent news articles for a stock symbol or company name from Yahoo Finance.
// safe: true
// args:
//   query: string (required) - Ticker symbol or company name, e.g. "AAPL" or "Tesla"
//   count: int (default 10, min 1, max 25) - Number of articles (1-25)
// ---

import { runTool, yahooFinance } from './_shared.js';

interface Args {
  query: string;
  count: number;
}

runTool<Args>(async ({ query, count }) => {
  const result = await yahooFinance.search(query, { newsCount: count, quotesCount: 0 });
  const articles = result.news.map((n) => ({
    title: n.title,
    publisher: n.publisher,
    link: n.link,
    publishTime: n.providerPublishTime,
    relatedTickers: n.relatedTickers,
  }));
  return { query, articles };
});
