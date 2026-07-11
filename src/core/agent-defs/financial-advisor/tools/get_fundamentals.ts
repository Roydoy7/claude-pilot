// ---
// description: Get fundamentals for one symbol (US or Japanese .T ticker): valuation ratios, margins, revenue/earnings history, analyst recommendation trend, upcoming earnings dates, and company profile.
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
    modules: [
      'price',
      'summaryDetail',
      'financialData',
      'defaultKeyStatistics',
      'earnings',
      'calendarEvents',
      'recommendationTrend',
      'assetProfile',
    ],
  });
  return {
    symbol,
    company: {
      name: s.price?.longName ?? s.price?.shortName,
      sector: s.assetProfile?.sector,
      industry: s.assetProfile?.industry,
      country: s.assetProfile?.country,
      employees: s.assetProfile?.fullTimeEmployees,
      businessSummary: s.assetProfile?.longBusinessSummary,
    },
    valuation: {
      currency: s.price?.currency,
      marketCap: s.price?.marketCap,
      trailingPE: s.summaryDetail?.trailingPE,
      forwardPE: s.defaultKeyStatistics?.forwardPE,
      pegRatio: s.defaultKeyStatistics?.pegRatio,
      priceToBook: s.defaultKeyStatistics?.priceToBook,
      enterpriseToEbitda: s.defaultKeyStatistics?.enterpriseToEbitda,
      dividendYield: s.summaryDetail?.dividendYield,
      payoutRatio: s.summaryDetail?.payoutRatio,
      beta: s.summaryDetail?.beta,
    },
    financialData: {
      totalRevenue: s.financialData?.totalRevenue,
      revenueGrowth: s.financialData?.revenueGrowth,
      earningsGrowth: s.financialData?.earningsGrowth,
      grossMargins: s.financialData?.grossMargins,
      operatingMargins: s.financialData?.operatingMargins,
      profitMargins: s.financialData?.profitMargins,
      returnOnEquity: s.financialData?.returnOnEquity,
      totalCash: s.financialData?.totalCash,
      totalDebt: s.financialData?.totalDebt,
      debtToEquity: s.financialData?.debtToEquity,
      freeCashflow: s.financialData?.freeCashflow,
      analystTargetMeanPrice: s.financialData?.targetMeanPrice,
      analystRecommendation: s.financialData?.recommendationKey,
      numberOfAnalystOpinions: s.financialData?.numberOfAnalystOpinions,
    },
    earningsHistory: s.earnings?.financialsChart,
    quarterlyEps: s.earnings?.earningsChart.quarterly,
    nextEarningsDates: s.calendarEvents?.earnings.earningsDate,
    recommendationTrend: s.recommendationTrend?.trend,
  };
});
