// ---
// description: Get analyst EPS/revenue estimate trends and analyst rating upgrade/downgrade history for a symbol. (For the current buy/hold/sell recommendation distribution, use get_fundamentals instead.)
// safe: true
// args:
//   symbol: string (required) - Ticker symbol, e.g. "AAPL" or "7203.T"
// ---

import { runTool, yahooFinance } from './_shared.js';

interface Args {
  symbol: string;
}

runTool<Args>(async ({ symbol }) => {
  const s = await yahooFinance.quoteSummary(symbol, {
    modules: ['earningsTrend', 'upgradeDowngradeHistory'],
  });
  const epsTrend = (s.earningsTrend?.trend ?? []).map((t) => ({
    period: t.period,
    endDate: t.endDate,
    epsEstimateAvg: t.earningsEstimate?.avg,
    epsEstimateHigh: t.earningsEstimate?.high,
    epsEstimateLow: t.earningsEstimate?.low,
    numberOfAnalysts: t.earningsEstimate?.numberOfAnalysts,
    revenueEstimateAvg: t.revenueEstimate?.avg,
  }));
  const upgradeDowngrade = (s.upgradeDowngradeHistory?.history ?? []).slice(0, 20).map((u) => ({
    date: u.epochGradeDate,
    firm: u.firm,
    toGrade: u.toGrade,
    fromGrade: u.fromGrade,
    action: u.action,
  }));
  return { symbol, epsTrend, upgradeDowngrade };
});
