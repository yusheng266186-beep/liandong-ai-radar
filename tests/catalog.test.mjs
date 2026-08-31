import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("public/data/catalog.json", root), "utf8"));
const css = await readFile(new URL("app/globals.css", root), "utf8");

test("catalog payload is internally consistent", () => {
  assert.equal(catalog.schemaVersion, 3);
  assert.equal(catalog.coverage.loadedOffers, catalog.offers.length);
  assert.equal(catalog.categories.length, 8);
  assert.ok(catalog.coverage.listedOffers >= catalog.offers.length);
});

test("every exposed purchase link goes directly to a merchant", () => {
  for (const offer of catalog.offers) {
    const purchase = new URL(offer.purchaseUrl);
    assert.match(purchase.protocol, /^https?:$/);
    assert.doesNotMatch(purchase.hostname, /(^|\.)priceai\.cc$/i);
    if (offer.shopUrl) assert.doesNotMatch(new URL(offer.shopUrl).hostname, /(^|\.)priceai\.cc$/i);
    assert.ok(offer.merchant.length > 0);
    assert.ok(offer.productName.length > 0);
  }
});

test("verification labels do not overstate failed or indexed records", () => {
  for (const offer of catalog.offers) {
    assert.ok(["direct", "reachable", "indexed", "failed"].includes(offer.verification));
    assert.ok(offer.verificationReason.length > 12);
    if (offer.verification === "direct") {
      assert.equal(offer.stockStatus, "in_stock");
      assert.ok(offer.checkedAt);
      assert.ok(offer.priceCny != null);
    }
  }
});

test("responsive and reduced-motion styles are present", () => {
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /offer-mobile-list/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
