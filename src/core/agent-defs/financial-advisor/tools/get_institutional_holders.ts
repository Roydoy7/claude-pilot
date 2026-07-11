// ---
// description: Get institutional ownership for a symbol: top institutional holders plus insider/institution ownership percentages.
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
    modules: ['institutionOwnership', 'majorHoldersBreakdown'],
  });
  const mhb = s.majorHoldersBreakdown;
  const topHolders = (s.institutionOwnership?.ownershipList ?? []).slice(0, 10).map((h) => ({
    organization: h.organization,
    shares: h.position,
    value: h.value,
    pctHeld: h.pctHeld,
    reportDate: h.reportDate,
  }));
  return {
    symbol,
    overview: {
      insidersPercentHeld: mhb?.insidersPercentHeld,
      institutionsPercentHeld: mhb?.institutionsPercentHeld,
      institutionsFloatPercentHeld: mhb?.institutionsFloatPercentHeld,
      institutionsCount: mhb?.institutionsCount,
    },
    topHolders,
  };
});
