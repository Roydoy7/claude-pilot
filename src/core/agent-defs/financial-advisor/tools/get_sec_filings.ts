// ---
// description: Get SEC EDGAR filing history (10-K, 10-Q, 8-K, etc.) for a US-listed company. HONEST LIMITATION: US equities only - SEC EDGAR has no coverage for foreign-listed companies (e.g. Japanese .T tickers).
// safe: true
// args:
//   ticker: string (required) - US ticker symbol, e.g. "AAPL"
//   formType: string - Filter by form type, e.g. "10-K", "10-Q", "8-K" (omit for all recent filings)
//   limit: int (default 50, min 1, max 100) - Max filings to return
// ---

import { runTool, resolveCik, SEC_USER_AGENT } from './_shared.js';

interface Args {
  ticker: string;
  formType?: string;
  limit: number;
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

runTool<Args>(async ({ ticker, formType, limit }) => {
  const resolved = await resolveCik(ticker);
  if (!resolved) {
    throw new Error(`No SEC CIK mapping found for ticker "${ticker}" (US-listed companies only)`);
  }
  const res = await fetch(`https://data.sec.gov/submissions/CIK${resolved.cik}.json`, {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed: HTTP ${String(res.status)}`);
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
        .filter((f) => !formType || f.form === formType)
        .slice(0, limit)
    : [];
  return { ticker: ticker.toUpperCase(), cik: resolved.cik, company: data.name, filings };
});
