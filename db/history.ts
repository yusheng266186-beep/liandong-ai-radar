import { env } from "cloudflare:workers";

import { emptyOffers, sources, type Offer } from "@/lib/monitor";

type SnapshotRow = {
  source_id: string;
  price: number | null;
  currency: "CNY" | "USD";
  price_cny: number | null;
  stock_status: Offer["stockStatus"];
  stock_count: number | null;
  verification: Offer["verification"];
  evidence_json: string;
  checked_at: string;
  latency_ms: number | null;
};

type MinimumRow = { source_id: string; historical_low_cny: number | null };
type PreviousRow = { source_id: string; price_cny: number | null };
type HistoryRow = { source_id: string; price_cny: number };

function safeEvidence(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : ["快照证据格式异常"];
  } catch {
    return ["快照证据无法读取"];
  }
}

export async function saveSnapshots(offers: Offer[]) {
  const statements = offers.map((offer) =>
    env.DB.prepare(`
      INSERT INTO price_snapshots (
        source_id, price, currency, price_cny, stock_status, stock_count,
        verification, evidence_json, checked_at, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      offer.sourceId,
      offer.price,
      offer.currency,
      offer.priceCny,
      offer.stockStatus,
      offer.stockCount,
      offer.verification,
      JSON.stringify(offer.evidence),
      offer.checkedAt ?? new Date().toISOString(),
      offer.latencyMs
    )
  );
  await env.DB.batch(statements);
}

export async function readLatestOffers(): Promise<Offer[]> {
  const latest = env.DB.prepare(`
    SELECT
      ps.source_id, ps.price, ps.currency, ps.price_cny, ps.stock_status,
      ps.stock_count, ps.verification, ps.evidence_json, ps.checked_at, ps.latency_ms
    FROM price_snapshots ps
    INNER JOIN (
      SELECT source_id, MAX(id) AS max_id
      FROM price_snapshots
      GROUP BY source_id
    ) newest ON newest.max_id = ps.id
    ORDER BY ps.id ASC
  `);
  const minimums = env.DB.prepare(`
    SELECT source_id, MIN(price_cny) AS historical_low_cny
    FROM price_snapshots
    WHERE price_cny IS NOT NULL
      AND stock_status = 'in_stock'
      AND verification IN ('double_signal', 'official')
    GROUP BY source_id
  `);
  const previous = env.DB.prepare(`
    SELECT source_id, price_cny
    FROM (
      SELECT
        source_id,
        price_cny,
        ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY id DESC) AS row_number
      FROM price_snapshots
      WHERE price_cny IS NOT NULL
    ) ranked
    WHERE row_number = 2
  `);
  const history = env.DB.prepare(`
    SELECT source_id, price_cny
    FROM (
      SELECT
        source_id,
        price_cny,
        id,
        ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY id DESC) AS row_number
      FROM price_snapshots
      WHERE price_cny IS NOT NULL
        AND stock_status = 'in_stock'
        AND verification IN ('double_signal', 'official')
    ) ranked
    WHERE row_number <= 12
    ORDER BY source_id ASC, id ASC
  `);

  const [latestResult, minimumResult, previousResult, historyResult] = await env.DB.batch([latest, minimums, previous, history]);
  const latestRows = (latestResult.results ?? []) as SnapshotRow[];
  if (!latestRows.length) return emptyOffers();

  const minimumMap = new Map(((minimumResult.results ?? []) as MinimumRow[]).map((row) => [row.source_id, row.historical_low_cny]));
  const previousMap = new Map(((previousResult.results ?? []) as PreviousRow[]).map((row) => [row.source_id, row.price_cny]));
  const historyMap = new Map<string, number[]>();
  for (const row of (historyResult.results ?? []) as HistoryRow[]) {
    const values = historyMap.get(row.source_id) ?? [];
    values.push(row.price_cny);
    historyMap.set(row.source_id, values);
  }
  const latestMap = new Map(latestRows.map((row) => [row.source_id, row]));

  return sources.map((source) => {
    const row = latestMap.get(source.id);
    if (!row) return emptyOffers().find((offer) => offer.sourceId === source.id)!;
    return {
      sourceId: source.id,
      merchant: source.merchant,
      productName: source.productName,
      productType: source.productType,
      deliveryType: source.deliveryType,
      price: row.price,
      currency: row.currency,
      priceCny: row.price_cny,
      stockStatus: row.stock_status,
      stockCount: row.stock_count,
      verification: row.verification,
      evidence: safeEvidence(row.evidence_json),
      risk: source.risk,
      url: source.url,
      checkedAt: row.checked_at,
      latencyMs: row.latency_ms,
      historicalLowCny: minimumMap.get(source.id) ?? null,
      previousPriceCny: previousMap.get(source.id) ?? null,
      priceHistoryCny: historyMap.get(source.id) ?? [],
      isOfficial: source.isOfficial,
    };
  });
}
