/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Finance MCP Server - Stock market data tools backed by Yahoo Finance
 *
 * Tools:
 * - get_quote: Real-time quotes for up to 20 symbols
 * - get_historical_prices: Historical OHLCV price data
 * - get_fundamentals: Valuation, margins, earnings, analyst data
 * - search_symbols: Search ticker symbols by company name
 * - get_market_overview: Snapshot of major US/Japanese market indicators
 * - screen_stocks: Run a predefined Yahoo Finance stock screener
 * - get_trending: Currently trending US tickers
 * - get_institutional_holders: Top institutional holders and ownership breakdown
 * - get_analyst_estimates: EPS/revenue estimate trends and upgrade/downgrade history
 * - get_financial_statements: Historical income statement, balance sheet, or cash flow line items
 * - get_options_chain: Options chain (calls + puts) for a symbol
 * - get_stock_news: Recent news articles for a symbol or company
 * - get_sec_filings: SEC EDGAR filing history (10-K/10-Q/8-K) for US-listed companies
 * - get_sec_xbrl_facts: Structured US-GAAP financial metrics from SEC EDGAR XBRL
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import YahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import { getErrorMessage } from '../errors.js';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const DATA_SOURCE = 'Yahoo Finance via yahoo-finance2';
const READ_ONLY = { annotations: { readOnlyHint: true } };

function ok(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ source: DATA_SOURCE, fetchedAt: new Date().toISOString(), data }),
      },
    ],
  };
}

function fail(context: string, err: unknown): CallToolResult {
  const message = getErrorMessage(err);
  console.error(`[finance tool error] ${context}: ${message}`);
  return {
    content: [{ type: 'text', text: `Error (${context}): ${message}` }],
    isError: true,
  };
}

// Structural view of the yahoo-finance2 quote fields this tool reads.
// The library's own Quote union degrades to `any` member access (its
// QuoteECNQuote variant is an Omit<> over an any-index-signature interface),
// so we type the extraction explicitly; assignability is checked at call sites.
interface QuoteSource {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  fullExchangeName?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: Date | number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

interface QuoteSnapshot {
  symbol: string | undefined;
  shortName: string | undefined;
  longName: string | undefined;
  currency: string | undefined;
  fullExchangeName: string | undefined;
  marketState: string | undefined;
  regularMarketPrice: number | undefined;
  regularMarketChange: number | undefined;
  regularMarketChangePercent: number | undefined;
  regularMarketTime: Date | number | undefined;
  regularMarketVolume: number | undefined;
  averageDailyVolume3Month: number | undefined;
  marketCap: number | undefined;
  trailingPE: number | undefined;
  forwardPE: number | undefined;
  epsTrailingTwelveMonths: number | undefined;
  dividendYield: number | undefined;
  fiftyTwoWeekHigh: number | undefined;
  fiftyTwoWeekLow: number | undefined;
}

function toQuoteSnapshot(q: QuoteSource): QuoteSnapshot {
  return {
    symbol: q.symbol,
    shortName: q.shortName,
    longName: q.longName,
    currency: q.currency,
    fullExchangeName: q.fullExchangeName,
    marketState: q.marketState,
    regularMarketPrice: q.regularMarketPrice,
    regularMarketChange: q.regularMarketChange,
    regularMarketChangePercent: q.regularMarketChangePercent,
    regularMarketTime: q.regularMarketTime,
    regularMarketVolume: q.regularMarketVolume,
    averageDailyVolume3Month: q.averageDailyVolume3Month,
    marketCap: q.marketCap,
    trailingPE: q.trailingPE,
    forwardPE: q.forwardPE,
    epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
    dividendYield: q.dividendYield,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
  };
}

const getQuote = tool(
  'get_quote',
  'Get real-time quotes (price, change, market cap, P/E, 52-week range) for up to 20 stock symbols. ' +
    'US tickers as-is (e.g. AAPL); Japanese stocks use the 4-digit code with .T suffix (e.g. Toyota = 7203.T). ' +
    'Yahoo data may be delayed 15-20 minutes. Symbols with no data are listed in noDataFor.',
  { symbols: z.array(z.string()).min(1).max(20).describe('Ticker symbols, e.g. ["AAPL", "7203.T"]') },
  async (args) => {
    try {
      // Assertion needed: the library's Quote union contains QuoteECNQuote,
      // whose declared members are erased by an Omit<> over an any-index-signature
      // interface, making the union unusable as-is.
      const quotes = (await yahooFinance.quote(args.symbols)) as QuoteSource[];
      const snapshots = quotes.map((q) => toQuoteSnapshot(q));
      const returned = new Set(snapshots.map((s) => s.symbol));
      const noDataFor = args.symbols.filter((s) => !returned.has(s));
      if (snapshots.length === 0) {
        return fail('get_quote', `Yahoo Finance returned no data for any of: ${args.symbols.join(', ')}`);
      }
      return ok({ quotes: snapshots, noDataFor });
    } catch (err) {
      return fail('get_quote', err);
    }
  },
  READ_ONLY,
);

const MAX_HISTORY_ROWS = 300;

const getHistoricalPrices = tool(
  'get_historical_prices',
  'Get historical OHLCV price data for one symbol (US or Japanese .T ticker). ' +
    'Choose the interval so the range stays under 300 rows; excess rows are truncated (oldest dropped) and reported.',
  {
    symbol: z.string().describe('Ticker symbol, e.g. "AAPL" or "7203.T"'),
    period1: z.string().describe('Start date, YYYY-MM-DD'),
    period2: z.string().optional().describe('End date, YYYY-MM-DD (default: today)'),
    interval: z.enum(['1d', '1wk', '1mo']).describe('Bar interval'),
  },
  async (args) => {
    try {
      const result = await yahooFinance.chart(args.symbol, {
        period1: args.period1,
        period2: args.period2,
        interval: args.interval,
      });
      const rows = result.quotes.map((row) => ({
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }));
      const truncated = rows.length > MAX_HISTORY_ROWS;
      return ok({
        symbol: args.symbol,
        currency: result.meta.currency,
        interval: args.interval,
        rows: truncated ? rows.slice(rows.length - MAX_HISTORY_ROWS) : rows,
        note: truncated
          ? `${String(rows.length - MAX_HISTORY_ROWS)} oldest rows omitted (limit ${String(MAX_HISTORY_ROWS)}); request a coarser interval for full coverage`
          : undefined,
      });
    } catch (err) {
      return fail('get_historical_prices', err);
    }
  },
  READ_ONLY,
);

const getFundamentals = tool(
  'get_fundamentals',
  'Get fundamentals for one symbol (US or Japanese .T ticker): valuation ratios, margins, revenue/earnings history, ' +
    'analyst recommendation trend, upcoming earnings dates, and company profile.',
  { symbol: z.string().describe('Ticker symbol, e.g. "AAPL" or "7203.T"') },
  async (args) => {
    try {
      const s = await yahooFinance.quoteSummary(args.symbol, {
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
      return ok({
        symbol: args.symbol,
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
      });
    } catch (err) {
      return fail('get_fundamentals', err);
    }
  },
  READ_ONLY,
);

const searchSymbols = tool(
  'search_symbols',
  'Search Yahoo Finance for ticker symbols by company name. ' +
    "IMPORTANT: the query must be in English/romaji — Yahoo's search API rejects Japanese-script queries " +
    '(translate company names to English first, e.g. "トヨタ自動車" -> "Toyota"). ' +
    'Japanese listings appear with a .T suffix.',
  { query: z.string().describe('Company name or ticker fragment, in English') },
  async (args) => {
    try {
      const result = await yahooFinance.search(args.query);
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
      return ok({ query: args.query, matches });
    } catch (err) {
      return fail('search_symbols', err);
    }
  },
  READ_ONLY,
);

const OVERVIEW_INSTRUMENTS: ReadonlyArray<{ symbol: string; label: string }> = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ Composite' },
  { symbol: '^DJI', label: 'Dow Jones Industrial Average' },
  { symbol: '^N225', label: 'Nikkei 225' },
  { symbol: '1306.T', label: 'NEXT FUNDS TOPIX ETF — proxy for the TOPIX index (the index itself is not available on Yahoo Finance)' },
  { symbol: 'USDJPY=X', label: 'USD/JPY exchange rate' },
];

const getMarketOverview = tool(
  'get_market_overview',
  'Get a snapshot of major US and Japanese market indicators: S&P 500, NASDAQ, Dow Jones, Nikkei 225, ' +
    'a TOPIX ETF (explicit proxy — the TOPIX index itself is not on Yahoo Finance), and USD/JPY. ' +
    'Instruments that fail to load are reported individually with their real error.',
  {},
  async () => {
    const settled = await Promise.allSettled(
      OVERVIEW_INSTRUMENTS.map(async ({ symbol }) => {
        const quotes = await yahooFinance.quote([symbol]);
        const quote = quotes[0];
        if (quote === undefined) {
          throw new Error(`Yahoo Finance returned no data for ${symbol}`);
        }
        return quote;
      }),
    );
    const instruments = settled.map((outcome, i) => {
      const { symbol, label } = OVERVIEW_INSTRUMENTS[i] as { symbol: string; label: string };
      if (outcome.status === 'rejected') {
        const message = getErrorMessage(outcome.reason);
        console.error(`[finance tool error] get_market_overview ${symbol}: ${message}`);
        return { symbol, label, error: message };
      }
      // Same QuoteECNQuote assertion rationale as in get_quote.
      return { symbol, label, quote: toQuoteSnapshot(outcome.value as QuoteSource) };
    });
    if (instruments.every((entry) => 'error' in entry)) {
      return fail('get_market_overview', 'all instruments failed to load');
    }
    return ok({ instruments });
  },
  READ_ONLY,
);

const SCREENER_IDS = [
  'day_gainers',
  'day_losers',
  'most_actives',
  'undervalued_large_caps',
  'growth_technology_stocks',
  'undervalued_growth_stocks',
] as const;

const screenStocks = tool(
  'screen_stocks',
  'Run a predefined Yahoo Finance stock screener. ' +
    'HONEST LIMITATION: these screeners cover US-listed stocks only. There is no Japanese screener — ' +
    'for Japanese stock discovery, combine search_symbols, get_quote, get_fundamentals, and web search instead.',
  {
    screener: z.enum(SCREENER_IDS).describe('Predefined screener id'),
    count: z.number().int().min(1).max(25).default(10).describe('Number of results (1-25)'),
  },
  async (args) => {
    try {
      const result = await yahooFinance.screener({ scrIds: args.screener, count: args.count });
      return ok({
        screener: args.screener,
        title: result.title,
        results: result.quotes.map(toQuoteSnapshot),
      });
    } catch (err) {
      return fail('screen_stocks', err);
    }
  },
  READ_ONLY,
);

const getTrending = tool(
  'get_trending',
  'Get currently trending ticker symbols on Yahoo Finance. ' +
    "HONEST LIMITATION: US market only — Yahoo's trending endpoint does not work for Japan. " +
    'Follow up with get_quote for details on the returned symbols.',
  {},
  async () => {
    try {
      const result = await yahooFinance.trendingSymbols('US');
      return ok({ region: 'US', symbols: result.quotes.map((q) => q.symbol) });
    } catch (err) {
      return fail('get_trending', err);
    }
  },
  READ_ONLY,
);

const getInstitutionalHolders = tool(
  'get_institutional_holders',
  'Get institutional ownership for a symbol: top institutional holders plus insider/institution ownership percentages.',
  { symbol: z.string().describe('Ticker symbol, e.g. "AAPL" or "7203.T"') },
  async (args) => {
    try {
      const s = await yahooFinance.quoteSummary(args.symbol, {
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
      return ok({
        symbol: args.symbol,
        overview: {
          insidersPercentHeld: mhb?.insidersPercentHeld,
          institutionsPercentHeld: mhb?.institutionsPercentHeld,
          institutionsFloatPercentHeld: mhb?.institutionsFloatPercentHeld,
          institutionsCount: mhb?.institutionsCount,
        },
        topHolders,
      });
    } catch (err) {
      return fail('get_institutional_holders', err);
    }
  },
  READ_ONLY,
);

const getAnalystEstimates = tool(
  'get_analyst_estimates',
  'Get analyst EPS/revenue estimate trends and analyst rating upgrade/downgrade history for a symbol. ' +
    '(For the current buy/hold/sell recommendation distribution, use get_fundamentals instead.)',
  { symbol: z.string().describe('Ticker symbol, e.g. "AAPL" or "7203.T"') },
  async (args) => {
    try {
      const s = await yahooFinance.quoteSummary(args.symbol, {
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
      return ok({ symbol: args.symbol, epsTrend, upgradeDowngrade });
    } catch (err) {
      return fail('get_analyst_estimates', err);
    }
  },
  READ_ONLY,
);

const FINANCIAL_STATEMENT_MODULES = ['financials', 'balance-sheet', 'cash-flow'] as const;

const getFinancialStatements = tool(
  'get_financial_statements',
  'Get historical financial statement line items (income statement, balance sheet, or cash flow) for a symbol, annually or quarterly. ' +
    'Returns the full set of line items Yahoo Finance reports for the period (the set of fields varies by company).',
  {
    symbol: z.string().describe('Ticker symbol, e.g. "AAPL" or "7203.T"'),
    statement: z.enum(FINANCIAL_STATEMENT_MODULES).describe('"financials" = income statement, or "balance-sheet" / "cash-flow"'),
    period1: z.string().describe('Earliest period start date, YYYY-MM-DD'),
    period2: z.string().optional().describe('Latest period end date, YYYY-MM-DD (default: today)'),
    type: z.enum(['annual', 'quarterly']).default('annual').describe('Reporting period granularity'),
  },
  async (args) => {
    try {
      const rows = await yahooFinance.fundamentalsTimeSeries(args.symbol, {
        period1: args.period1,
        period2: args.period2,
        type: args.type,
        module: args.statement,
      });
      return ok({ symbol: args.symbol, statement: args.statement, type: args.type, rows });
    } catch (err) {
      return fail('get_financial_statements', err);
    }
  },
  READ_ONLY,
);

const getOptionsChain = tool(
  'get_options_chain',
  'Get the options chain (calls + puts) for a symbol, with strikes, bid/ask, volume, open interest, and implied volatility. ' +
    'HONEST LIMITATION: reliable for US equities; coverage for Japanese (.T) tickers is inconsistent on Yahoo Finance.',
  {
    symbol: z.string().describe('Ticker symbol, e.g. "AAPL"'),
    expiration: z.string().optional().describe('Expiration date YYYY-MM-DD (omit for the nearest expiration)'),
  },
  async (args) => {
    try {
      const result = await yahooFinance.options(args.symbol, args.expiration ? { date: args.expiration } : {});
      const chain = result.options[0];
      if (!chain) {
        return fail('get_options_chain', `No options chain available for ${args.symbol}`);
      }
      return ok({
        symbol: args.symbol,
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
      });
    } catch (err) {
      return fail('get_options_chain', err);
    }
  },
  READ_ONLY,
);

const getStockNews = tool(
  'get_stock_news',
  'Get recent news articles for a stock symbol or company name from Yahoo Finance.',
  {
    query: z.string().describe('Ticker symbol or company name, e.g. "AAPL" or "Tesla"'),
    count: z.number().int().min(1).max(25).default(10).describe('Number of articles (1-25)'),
  },
  async (args) => {
    try {
      const result = await yahooFinance.search(args.query, { newsCount: args.count, quotesCount: 0 });
      const articles = result.news.map((n) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishTime: n.providerPublishTime,
        relatedTickers: n.relatedTickers,
      }));
      return ok({ query: args.query, articles });
    } catch (err) {
      return fail('get_stock_news', err);
    }
  },
  READ_ONLY,
);

/**
 * SEC EDGAR is the official US SEC filing system — zero auth, but requires a descriptive User-Agent.
 */
const SEC_USER_AGENT = 'claude-pilot finance-mcp-server (contact: roydoy7@gmail.com)';

interface SecCikEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

// Module-level cache: the ticker->CIK map is ~10,000 entries and only needs fetching once per process.
let secCikCache: Map<string, SecCikEntry> | null = null;

async function loadSecCikMap(): Promise<Map<string, SecCikEntry>> {
  if (secCikCache) {
    return secCikCache;
  }
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`SEC ticker list request failed: HTTP ${String(res.status)}`);
  }
  const raw = (await res.json()) as Record<string, SecCikEntry>;
  const map = new Map<string, SecCikEntry>();
  for (const entry of Object.values(raw)) {
    map.set(entry.ticker.toUpperCase(), entry);
  }
  secCikCache = map;
  return map;
}

async function resolveCik(ticker: string): Promise<{ cik: string; company: string } | null> {
  const map = await loadSecCikMap();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) {
    return null;
  }
  return { cik: String(entry.cik_str).padStart(10, '0'), company: entry.title };
}

interface SecSubmissionsRecent {
  form: string[];
  filingDate: string[];
  accessionNumber: string[];
  primaryDocument: string[];
  primaryDocDescription?: string[];
}

interface SecSubmissionsResponse {
  name: string;
  tickers?: string[];
  filings?: { recent?: SecSubmissionsRecent };
}

const getSecFilings = tool(
  'get_sec_filings',
  'Get SEC EDGAR filing history (10-K, 10-Q, 8-K, etc.) for a US-listed company. ' +
    'HONEST LIMITATION: US equities only — SEC EDGAR has no coverage for foreign-listed companies (e.g. Japanese .T tickers).',
  {
    ticker: z.string().describe('US ticker symbol, e.g. "AAPL"'),
    formType: z.string().optional().describe('Filter by form type, e.g. "10-K", "10-Q", "8-K" (omit for all recent filings)'),
    limit: z.number().int().min(1).max(100).default(50).describe('Max filings to return'),
  },
  async (args) => {
    try {
      const resolved = await resolveCik(args.ticker);
      if (!resolved) {
        return fail('get_sec_filings', `No SEC CIK mapping found for ticker "${args.ticker}" (US-listed companies only)`);
      }
      const res = await fetch(`https://data.sec.gov/submissions/CIK${resolved.cik}.json`, {
        headers: { 'User-Agent': SEC_USER_AGENT },
      });
      if (!res.ok) {
        return fail('get_sec_filings', `SEC EDGAR request failed: HTTP ${String(res.status)}`);
      }
      const data = (await res.json()) as SecSubmissionsResponse;
      const recent = data.filings?.recent;
      const filings = recent
        ? recent.form
            .map((form, i) => ({
              form,
              date: recent.filingDate[i],
              accessionNumber: recent.accessionNumber[i],
              primaryDocument: recent.primaryDocument[i],
              description: recent.primaryDocDescription?.[i],
              url: `https://www.sec.gov/Archives/edgar/data/${String(Number(resolved.cik))}/${(recent.accessionNumber[i] ?? '').replace(/-/g, '')}/${recent.primaryDocument[i] ?? ''}`,
            }))
            .filter((f) => !args.formType || f.form === args.formType)
            .slice(0, args.limit)
        : [];
      return ok({ ticker: args.ticker.toUpperCase(), cik: resolved.cik, company: data.name, filings });
    } catch (err) {
      return fail('get_sec_filings', err);
    }
  },
  READ_ONLY,
);

interface SecXbrlUnitEntry {
  end: string;
  val: number;
  form: string;
  filed: string;
  fy?: number;
  fp?: string;
}

interface SecXbrlConcept {
  label?: string;
  units: Record<string, SecXbrlUnitEntry[]>;
}

interface SecXbrlFactsResponse {
  entityName: string;
  facts?: { 'us-gaap'?: Record<string, SecXbrlConcept> };
}

const getSecXbrlFacts = tool(
  'get_sec_xbrl_facts',
  'Get structured US-GAAP financial metrics from SEC EDGAR XBRL filings (10-K/10-Q) for a US-listed company — ' +
    'e.g. revenue, net income, EPS, assets, liabilities across multiple years/quarters. ' +
    'Omit `metrics` to list all available GAAP metric names for the company first, then call again with specific names.',
  {
    ticker: z.string().describe('US ticker symbol, e.g. "AAPL"'),
    metrics: z
      .array(z.string())
      .optional()
      .describe('XBRL concept names, e.g. ["NetIncomeLoss", "EarningsPerShareDiluted", "Revenues"]. Omit to list available names.'),
  },
  async (args) => {
    try {
      const resolved = await resolveCik(args.ticker);
      if (!resolved) {
        return fail('get_sec_xbrl_facts', `No SEC CIK mapping found for ticker "${args.ticker}" (US-listed companies only)`);
      }
      const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${resolved.cik}.json`, {
        headers: { 'User-Agent': SEC_USER_AGENT },
      });
      if (!res.ok) {
        return fail('get_sec_xbrl_facts', `SEC EDGAR request failed: HTTP ${String(res.status)}`);
      }
      const data = (await res.json()) as SecXbrlFactsResponse;
      const usGaap = data.facts?.['us-gaap'] ?? {};

      if (!args.metrics || args.metrics.length === 0) {
        const availableMetrics = Object.entries(usGaap).map(([name, concept]) => ({
          name,
          label: concept.label ?? name,
          units: Object.keys(concept.units),
        }));
        return ok({
          ticker: args.ticker.toUpperCase(),
          company: data.entityName,
          totalMetrics: availableMetrics.length,
          availableMetrics,
        });
      }

      const metrics: Record<string, SecXbrlUnitEntry[]> = {};
      for (const name of args.metrics) {
        const concept = usGaap[name];
        if (!concept) {
          metrics[name] = [];
          continue;
        }
        const unitKey = 'USD' in concept.units ? 'USD' : Object.keys(concept.units)[0];
        const entries = unitKey ? concept.units[unitKey] ?? [] : [];
        metrics[name] = entries.filter((e) => e.form === '10-K' || e.form === '10-Q').slice(-20);
      }
      return ok({ ticker: args.ticker.toUpperCase(), company: data.entityName, metrics });
    } catch (err) {
      return fail('get_sec_xbrl_facts', err);
    }
  },
  READ_ONLY,
);

/**
 * Finance MCP server instance (Yahoo Finance + SEC EDGAR backed market data tools)
 */
export const financeMcpServer = createSdkMcpServer({
  name: 'finance',
  version: '1.0.0',
  tools: [
    getQuote,
    getHistoricalPrices,
    getFundamentals,
    searchSymbols,
    getMarketOverview,
    screenStocks,
    getTrending,
    getInstitutionalHolders,
    getAnalystEstimates,
    getFinancialStatements,
    getOptionsChain,
    getStockNews,
    getSecFilings,
    getSecXbrlFacts,
  ],
});
