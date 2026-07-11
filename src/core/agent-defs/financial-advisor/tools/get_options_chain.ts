// ---
// description: Get the options chain (calls + puts) for a symbol, with strikes, bid/ask, volume, open interest, and implied volatility. HONEST LIMITATION: reliable for US equities; coverage for Japanese (.T) tickers is inconsistent on Yahoo Finance.
// safe: true
// args:
//   symbol: string (required) - Ticker symbol, e.g. "AAPL"
//   expiration: string - Expiration date YYYY-MM-DD (omit for the nearest expiration)
// ---

import { runTool, yahooFinance } from './_shared.js';

interface Args {
  symbol: string;
  expiration?: string;
}

runTool<Args>(async ({ symbol, expiration }) => {
  const result = await yahooFinance.options(symbol, expiration ? { date: expiration } : {});
  const chain = result.options[0];
  if (!chain) {
    throw new Error(`No options chain available for ${symbol}`);
  }
  return {
    symbol,
    underlyingPrice: result.quote.regularMarketPrice,
    expirationDates: result.expirationDates,
    expiration: chain.expirationDate,
    calls: chain.calls.map((c) => ({
      contractSymbol: c.contractSymbol,
      strike: c.strike,
      lastPrice: c.lastPrice,
      bid: c.bid,
      ask: c.ask,
      volume: c.volume,
      openInterest: c.openInterest,
      impliedVolatility: c.impliedVolatility,
      inTheMoney: c.inTheMoney,
    })),
    puts: chain.puts.map((c) => ({
      contractSymbol: c.contractSymbol,
      strike: c.strike,
      lastPrice: c.lastPrice,
      bid: c.bid,
      ask: c.ask,
      volume: c.volume,
      openInterest: c.openInterest,
      impliedVolatility: c.impliedVolatility,
      inTheMoney: c.inTheMoney,
    })),
  };
});
