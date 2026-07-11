// ---
// description: Get structured US-GAAP financial metrics from SEC EDGAR XBRL filings (10-K/10-Q) for a US-listed company - e.g. revenue, net income, EPS, assets, liabilities across multiple years/quarters. Omit `metrics` to list all available GAAP metric names for the company first, then call again with specific names.
// safe: true
// args:
//   ticker: string (required) - US ticker symbol, e.g. "AAPL"
//   metrics: string[] - XBRL concept names, e.g. ["NetIncomeLoss", "EarningsPerShareDiluted", "Revenues"]. Omit to list available names.
// ---

import { runTool, resolveCik, SEC_USER_AGENT } from './_shared.js';

interface Args {
  ticker: string;
  metrics?: string[];
}

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

runTool<Args>(async ({ ticker, metrics }) => {
  const resolved = await resolveCik(ticker);
  if (!resolved) {
    throw new Error(`No SEC CIK mapping found for ticker "${ticker}" (US-listed companies only)`);
  }
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${resolved.cik}.json`, {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed: HTTP ${String(res.status)}`);
  }
  const data = (await res.json()) as SecXbrlFactsResponse;
  const usGaap = data.facts?.['us-gaap'] ?? {};

  if (!metrics || metrics.length === 0) {
    const availableMetrics = Object.entries(usGaap).map(([name, concept]) => ({
      name,
      label: concept.label ?? name,
      units: Object.keys(concept.units),
    }));
    return {
      ticker: ticker.toUpperCase(),
      company: data.entityName,
      totalMetrics: availableMetrics.length,
      availableMetrics,
    };
  }

  const facts: Record<string, SecXbrlUnitEntry[]> = {};
  for (const name of metrics) {
    const concept = usGaap[name];
    if (!concept) {
      facts[name] = [];
      continue;
    }
    const unitKey = 'USD' in concept.units ? 'USD' : Object.keys(concept.units)[0];
    const entries = unitKey ? concept.units[unitKey] ?? [] : [];
    facts[name] = entries.filter((e) => e.form === '10-K' || e.form === '10-Q').slice(-20);
  }
  return { ticker: ticker.toUpperCase(), company: data.entityName, metrics: facts };
});
