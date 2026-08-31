import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectPriceAiOffers } from "../scripts/adapters/priceai.mjs";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("public/data/catalog.json", root), "utf8"));
const css = await readFile(new URL("app/globals.css", root), "utf8");
const dashboard = await readFile(new URL("app/radar-dashboard.tsx", root), "utf8");
const crawler = await readFile(new URL("scripts/crawl-catalog.mjs", root), "utf8");
const workflow = await readFile(new URL(".github/workflows/pages-next.yml", root), "utf8");

test("schema v5 payload is internally consistent", () => {
  assert.equal(catalog.schemaVersion, 5);
  assert.equal(catalog.coverage.loadedOffers, catalog.offers.length);
  assert.equal(catalog.categories.length, 8);
  assert.ok(catalog.coverage.listedOffers >= catalog.offers.length);
  assert.equal(catalog.coverage.feedVerified, catalog.offers.filter((offer) => offer.purchaseStatus === "channel_candidate").length);
  assert.equal(catalog.coverage.strictPurchasable, catalog.offers.filter((offer) => offer.purchaseStatus === "confirmed").length);
  assert.equal(catalog.coverage.channelCandidates, catalog.offers.filter((offer) => offer.purchaseStatus === "channel_candidate").length);
  assert.ok(Array.isArray(catalog.sourceDiagnostics));
});

test("every exposed link goes directly to a merchant", () => {
  for (const offer of catalog.offers) {
    const purchase = new URL(offer.purchaseUrl);
    assert.match(purchase.protocol, /^https?:$/);
    assert.doesNotMatch(purchase.hostname, /(^|\.)priceai\.cc$/i);
    if (offer.shopUrl) assert.doesNotMatch(new URL(offer.shopUrl).hostname, /(^|\.)priceai\.cc$/i);
    assert.ok(offer.merchant.length > 0);
    assert.ok(offer.productName.length > 0);
  }
});

test("evidence, freshness, history, and sales remain explicit", () => {
  for (const offer of catalog.offers) {
    assert.ok(["direct", "feed", "reachable", "indexed", "failed"].includes(offer.verification));
    assert.ok(["live", "fresh", "aging", "stale", "unknown"].includes(offer.freshnessStatus));
    assert.ok(["original_page", "channel_feed", "directory", "unknown"].includes(offer.stockEvidence));
    assert.ok(Number.isFinite(offer.availabilityConfidence));
    assert.ok(Array.isArray(offer.priceHistory));
    assert.ok(Array.isArray(offer.stockHistory));
    assert.ok(["confirmed", "channel_candidate", "unavailable", "unverified"].includes(offer.purchaseStatus));
    assert.ok(["finished_account", "seat_membership", "recharge", "activation_code", "shared_access", "mirror_access", "web_account", "service", "other"].includes(offer.productForm));
    assert.deepEqual(Object.keys(offer.purchaseEvidence).sort(), ["checkoutActionConfirmed", "entryUrlValid", "planMatched", "priceMatched", "stockExplicit"]);
    assert.ok(offer.verificationReason.length > 12);
    if (offer.verification === "direct") {
      assert.equal(offer.stockStatus, "in_stock");
      assert.ok(offer.checkedAt);
      assert.ok(offer.priceCny != null);
      assert.equal(offer.stockEvidence, "original_page");
      assert.equal(offer.purchaseStatus, "confirmed");
      assert.ok(Object.values(offer.purchaseEvidence).every(Boolean));
    }
    if (offer.verification === "feed") {
      assert.ok(offer.updatedAt);
      assert.equal(offer.stockEvidence, "channel_feed");
    }
    if (offer.salesCount != null) {
      assert.equal(offer.salesSource, "original_page");
      assert.ok(offer.salesCheckedAt);
    }
  }
});

test("filters and sorting expose the requested market controls", () => {
  for (const value of ["strict_price_asc", "candidate_price_asc", "price_asc", "price_desc", "sales_desc", "depletion_desc", "stock_desc", "stock_asc", "freshness", "price_drop", "long_term_low"]) {
    assert.match(dashboard, new RegExp(`value=["']${value}["']`));
  }
  for (const field of ["availability", "productForm", "priceMin", "priceMax", "stockMin", "demandMin", "domain", "freshness"]) assert.match(dashboard, new RegExp(field));
  assert.match(dashboard, /5 \* 60_000/);
  assert.doesNotMatch(dashboard, /href=["'][^"']*priceai\.cc/i);
});

test("crawler uses structured pagination, parses time, and applies domain circuit breaking", () => {
  assert.match(crawler, /秒\|分钟\|小时\|天/);
  assert.match(crawler, /circuit_open/);
  assert.match(crawler, /disclosedSales/);
  assert.match(crawler, /stockDepletion7d/);
  assert.match(crawler, /collectPriceAiOffers/);
  assert.match(crawler, /purchaseEvidence/);
  assert.match(crawler, /productForm/);
  assert.match(crawler, /priceUnchanged/);
  assert.match(crawler, /current\.stockStatus === "in_stock"/);
});

test("public JSON adapter paginates and deduplicates without authentication", async () => {
  const originalFetch = globalThis.fetch;
  const offsets = [];
  globalThis.fetch = async (url) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    offsets.push(offset);
    const offers = offset === 0
      ? [{ id: "a", status: "in_stock", stockCount: 2 }, { id: "b", status: "out_of_stock", stockCount: 0 }]
      : [{ id: "b", status: "out_of_stock", stockCount: 0 }, { id: "c", status: "low_stock", stockCount: 1 }];
    return new Response(JSON.stringify({ total: 60, offers, degraded: false, generatedAt: "2026-08-31T00:00:00Z" }), { status: 200 });
  };
  try {
    const result = await collectPriceAiOffers("chatgpt-plus", { maxPages: 2, concurrency: 2, retries: 0 });
    assert.equal(result.ok, true);
    assert.deepEqual(offsets.sort((a, b) => a - b), [0, 30]);
    assert.equal(result.offers.length, 3);
    assert.equal(result.inStock, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("responsive styles avoid hidden mobile actions and respect reduced motion", () => {
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /offer-mobile-list/);
  assert.match(css, /mobile-filter-content/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /\.mobile-filter-overlay[\s\S]{0,1000}\.apply-filters\s*\{[^}]*position:\s*absolute/);
});

test("one workflow refreshes, preserves history, and deploys without repository writes", () => {
  assert.match(workflow, /cron: "17,47 \* \* \* \*"/);
  assert.match(workflow, /actions\/cache\/restore@v4/);
  assert.match(workflow, /actions\/cache\/save@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /git push/);
});
