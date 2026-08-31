import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { collectPriceAiOffers, priceAiAdapterMeta } from "./adapters/priceai.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = process.env.CATALOG_OUTPUT_PATH ? path.resolve(process.env.CATALOG_OUTPUT_PATH) : path.join(root, "public", "data", "catalog.json");
const maxLoadClicks = Number(process.env.CATALOG_MAX_LOAD_CLICKS ?? 60);
const maxVerifications = Number(process.env.CATALOG_MAX_VERIFY ?? 320);
const verificationConcurrency = Number(process.env.CATALOG_VERIFY_CONCURRENCY ?? 8);
const discoveryConcurrency = Number(process.env.CATALOG_DISCOVERY_CONCURRENCY ?? 2);
const apiConcurrency = Number(process.env.CATALOG_API_CONCURRENCY ?? 4);
const maxApiPages = Number(process.env.CATALOG_MAX_API_PAGES ?? 80);
const feedFreshHours = Number(process.env.CATALOG_FEED_FRESH_HOURS ?? 6);
const originalPageTimeout = Number(process.env.CATALOG_PAGE_TIMEOUT_MS ?? 11_000);

const categories = [
  { id: "chatgpt-plus", name: "Plus 试用 / 成品号", shortName: "PLUS", description: "日抛、网页号、已接码与未接码成品号", tags: ["成品号", "网页号", "接码"], url: "https://priceai.cc/products/chatgpt-plus", fallbackTotal: 1108, fallbackInStock: 219 },
  { id: "chatgpt-team-business", name: "Team / Business", shortName: "TEAM", description: "K12、Bug Team、母号、子号与席位邀请", tags: ["席位", "邀请", "K12"], url: "https://priceai.cc/products/chatgpt-team-business", fallbackTotal: 279, fallbackInStock: 96 },
  { id: "chatgpt-plus-recharge", name: "Plus 正价代充", shortName: "RECHARGE", description: "官方渠道、菲区卡充、iOS 与正规代充", tags: ["代充", "CDK", "质保"], url: "https://priceai.cc/products/chatgpt-plus-recharge", fallbackTotal: 253, fallbackInStock: 202 },
  { id: "chatgpt-free-account", name: "ChatGPT 普号", shortName: "FREE", description: "Free 白号、普通账号与 2FA 成品号", tags: ["普号", "2FA", "批发"], url: "https://priceai.cc/products/chatgpt-free-account", fallbackTotal: 217, fallbackInStock: 155 },
  { id: "chatgpt-go", name: "ChatGPT Go", shortName: "GO", description: "Go 月卡、年卡、激活码与自助充值", tags: ["月卡", "卡密", "充值"], url: "https://priceai.cc/products/chatgpt-go", fallbackTotal: 31, fallbackInStock: 24 },
  { id: "chatgpt-pro-20x", name: "ChatGPT Pro 20x", shortName: "PRO 20X", description: "高额度、短期速刷、成品号与正规代开", tags: ["高额度", "速刷", "代开"], url: "https://priceai.cc/products/chatgpt-pro-20x", fallbackTotal: 293, fallbackInStock: 227 },
  { id: "chatgpt-pro-5x", name: "ChatGPT Pro 5x", shortName: "PRO 5X", description: "Pro 5x 成品、iOS 卡密与官方渠道代充", tags: ["iOS", "卡密", "代充"], url: "https://priceai.cc/products/chatgpt-pro-5x", fallbackTotal: 229, fallbackInStock: 182 },
  { id: "chatgpt-services", sourceProductId: "chatgpt-codex-service", name: "周边与自助服务", shortName: "SERVICES", description: "提链、扫码、自助充值、邀请与额度服务", tags: ["提链", "扫码", "邀请"], url: "https://priceai.cc/products/chatgpt-codex-service", fallbackTotal: 47, fallbackInStock: 33 },
];

function hash(value, length = 14) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")[0]
    .replace(/https?:\/\/\S+/gi, "[source]")
    .slice(0, 240);
}

function cleanUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || /(^|\.)priceai\.cc$/i.test(url.hostname)) return null;
    if (/^pay\.ldxp\.cn$/i.test(url.hostname)) url.hostname = "www.ldxp.cn";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["source", "ref", "from"].includes(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function domainOf(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
}

function toIso(value, reference = new Date()) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (/^(刚刚|刚才)$/.test(normalized)) return reference.toISOString();
  const relative = normalized.match(/(\d+)\s*(秒|分钟|小时|天)前/);
  if (relative) {
    const unitMs = { 秒: 1_000, 分钟: 60_000, 小时: 3_600_000, 天: 86_400_000 }[relative[2]];
    return new Date(reference.getTime() - Number(relative[1]) * unitMs).toISOString();
  }
  const directTimestamp = Date.parse(value);
  if (Number.isFinite(directTimestamp) && /(?:T|Z|[+-]\d{2}:?\d{2})/.test(value)) return new Date(directTimestamp).toISOString();
  const match = value.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`;
  }
  const shortDate = value.match(/(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (shortDate) {
    const [, month, day, hour, minute] = shortDate;
    return `${reference.getUTCFullYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`;
  }
  return null;
}

function ageHours(value, now = Date.now()) {
  if (!value) return Infinity;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) / 3_600_000 : Infinity;
}

function freshnessFor(value, now = Date.now()) {
  const hours = ageHours(value, now);
  if (hours <= 1) return "live";
  if (hours <= feedFreshHours) return "fresh";
  if (hours <= 24) return "aging";
  if (Number.isFinite(hours)) return "stale";
  return "unknown";
}

function deliveryFor(categoryId, text) {
  if (categoryId === "chatgpt-team-business") return /邀请|自动拉|席位|子号/i.test(text) ? "席位邀请" : "成品账号";
  if (categoryId === "chatgpt-services") return "辅助服务";
  if (/成品|账号|日抛|网页号|白号|普号/i.test(text) && !/充值|代充/i.test(text)) return "成品账号";
  if (/CDK|卡密|激活码|卡冲|卡充/i.test(text)) return "卡密 / CDK";
  if (/自助|自动充值|自动化充值/i.test(text)) return "自助充值";
  if (/代充|直充|充值|代开/i.test(text)) return "人工代充";
  return "其他数字交付";
}

function tagsFor(categoryId, text, deliveryType) {
  const tags = new Set();
  const checks = [
    ["成品号", /成品|账号|日抛|白号|普号/i], ["代充", /代充|直充|充值|代开/i], ["CDK", /CDK|卡密|激活码|卡冲|卡充/i],
    ["自动发货", /自动发货|自助|秒发|自动充值/i], ["质保", /质保|售后|包赔|包换/i], ["席位", /席位|邀请|自动拉|team|business/i],
    ["已接码", /已接码|已接马/i], ["未接码", /未接码|未接马/i], ["iOS", /ios|苹果|美区/i], ["K12", /k12/i], ["Bug Team", /bug\s*team/i],
    ["网页号", /网页|web/i], ["批发", /批发|起购|招代理/i], ["速刷", /速刷|日抛|短期/i], ["官方渠道", /官方|正价|正规/i],
  ];
  for (const [tag, pattern] of checks) if (pattern.test(text)) tags.add(tag);
  if (deliveryType === "成品账号") tags.add("成品号");
  if (deliveryType === "席位邀请") tags.add("席位");
  if (deliveryType === "卡密 / CDK") tags.add("CDK");
  if (categoryId === "chatgpt-services") tags.add("辅助服务");
  return [...tags];
}

const sourceFilterTagLabels = {
  shared_access: "拼车 / 团购",
  web_only_account: "网页号",
  domestic_mirror_site: "国内镜像站",
  delivery_recharge: "充值",
  delivery_account: "成品号",
  account_verified: "已接码",
  account_unverified: "未接码",
  warranty_long: "长期质保",
  team_k12: "K12",
  team_bug: "Bug Team",
  team_official: "官方 Team",
};

function productFormFor(categoryId, text, sourceFilterTags = []) {
  const filters = new Set(sourceFilterTags);
  if (categoryId === "chatgpt-services") return "service";
  if (filters.has("domestic_mirror_site") || /镜像站|国内镜像|mirror/i.test(text)) return "mirror_access";
  if (filters.has("shared_access") || /拼车|团购|合租|车位|共享/i.test(text)) return "shared_access";
  if (filters.has("web_only_account") || /网页号|仅限网页|网页版/i.test(text)) return "web_account";
  if (/席位|邀请|自动拉|子号|加入.*(?:team|business)|上车/i.test(text)) return "seat_membership";
  if (filters.has("delivery_recharge") || /代充|直充|充值|代开/i.test(text)) {
    return /CDK|卡密|激活码|续费码|兑换码|卡冲|卡充/i.test(text) ? "activation_code" : "recharge";
  }
  if (/CDK|卡密|激活码|续费码|兑换码/i.test(text) && !/账号|成品|账密/i.test(text)) return "activation_code";
  if (filters.has("delivery_account") || filters.has("account_verified") || filters.has("account_unverified") || /成品|账号|账密|日抛|白号|普号/i.test(text)) return "finished_account";
  return "other";
}

function purchaseEvidenceFor({ categoryId, priceCny, stockStatus, purchaseUrl, checkoutActionConfirmed = false }) {
  return {
    planMatched: Boolean(categoryId),
    priceMatched: priceCny != null && Number.isFinite(priceCny),
    stockExplicit: stockStatus !== "unverified",
    entryUrlValid: Boolean(cleanUrl(purchaseUrl)),
    checkoutActionConfirmed,
  };
}

function purchaseStatusFor(offer) {
  if (offer.stockStatus === "out_of_stock") return "unavailable";
  const evidence = offer.purchaseEvidence ?? purchaseEvidenceFor(offer);
  if (offer.verification === "direct" && Object.values(evidence).every(Boolean)) return "confirmed";
  if (offer.verification === "feed" && evidence.planMatched && evidence.priceMatched && evidence.stockExplicit && evidence.entryUrlValid) return "channel_candidate";
  return "unverified";
}

async function readPrevious() {
  try { return JSON.parse(await readFile(outputPath, "utf8")); } catch { return { offers: [], categories: [], deltas: [] }; }
}

async function visibleLoadButton(page) {
  const buttons = page.getByRole("button", { name: /(?:继续加载报价|加载更多报价)/ });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    const label = (await candidate.textContent().catch(() => "")) ?? "";
    const ready = !/正在|加载中/.test(label) && await candidate.isEnabled().catch(() => false);
    if (ready && await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function extractRawOffers(page) {
  return page.locator("table tbody tr").evaluateAll((rows) => rows.map((row) => {
    const cells = [...row.querySelectorAll("td")];
    if (cells.length < 5) return null;
    const stockText = cells[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const channelCell = cells[1];
    const productCell = cells[2];
    const priceCell = cells[3];
    const dateCell = cells[4];
    const actionCell = cells.find((cell) => /前往购买|查看|购买/.test(cell.textContent ?? "")) ?? cells.at(-2) ?? cells.at(-1);
    const channelLinks = [...(channelCell?.querySelectorAll("a[href]") ?? [])];
    const shopLink = channelLinks.find((anchor) => (anchor.textContent ?? "").trim() || /店铺主页/.test(anchor.getAttribute("aria-label") ?? ""));
    const purchaseLink = [...(actionCell?.querySelectorAll("a[href]") ?? [])].find((anchor) => /前往购买|查看|购买/.test(anchor.textContent ?? ""));
    const merchantFromAria = shopLink?.getAttribute("aria-label")?.match(/前往(.+?)店铺主页/)?.[1];
    const merchant = merchantFromAria || (shopLink?.textContent ?? "").replace(/\s+/g, " ").trim() || (channelCell?.textContent ?? "").replace(/Image|最低价渠道.*|收录.*|公开运营.*/g, " ").replace(/\s+/g, " ").trim();
    const productName = (productCell?.getAttribute("title") || productCell?.getAttribute("aria-label") || productCell?.textContent || "").replace(/^原始商品名[：:]?\s*/, "").replace(/同名报价\s*\d+\s*条/g, "").replace(/\s+/g, " ").trim();
    return {
      merchant,
      productName,
      stockText,
      priceText: priceCell?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      updatedText: dateCell?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      purchaseUrl: purchaseLink?.href ?? null,
      shopUrl: shopLink?.href ?? null,
    };
  }).filter(Boolean));
}

function normalizeApiOffer(definition, raw, nowDate) {
  const purchaseUrl = cleanUrl(raw.url);
  const productName = String(raw.sourceTitle ?? "").replace(/\s+/g, " ").trim();
  const merchant = String(raw.sourceStoreName || raw.sourceName || raw.sourceId || "").replace(/\s+/g, " ").trim();
  if (!purchaseUrl || !productName || !merchant) return null;

  const numericPrice = Number(raw.price);
  const priceCny = Number.isFinite(numericPrice) ? numericPrice : null;
  const numericStock = Number(raw.stockCount);
  const stockCount = Number.isFinite(numericStock) && numericStock >= 0 ? numericStock : null;
  const rawStatus = `${raw.status ?? ""} ${raw.effectiveStatus ?? ""}`.toLowerCase();
  const stockStatus = /out_of_stock|sold_out|unavailable|expired/.test(rawStatus) || stockCount === 0
    ? "out_of_stock"
    : /in_stock|low_stock|available/.test(rawStatus) || (stockCount != null && stockCount > 0)
      ? "in_stock"
      : "unverified";
  const sourceFilterTags = Array.isArray(raw.filterTags) ? raw.filterTags.map(String) : [];
  const deliveryType = deliveryFor(definition.id, `${productName} ${sourceFilterTags.join(" ")}`);
  const productForm = productFormFor(definition.id, productName, sourceFilterTags);
  const updatedAt = [raw.sourceUpdatedAt, raw.verifiedAt, raw.lastSeenAt, raw.capturedAt]
    .map((value) => toIso(String(value ?? ""), nowDate))
    .find(Boolean) ?? null;
  const freshnessStatus = freshnessFor(updatedAt, nowDate.getTime());
  const feedVerified = stockStatus !== "unverified" && ["live", "fresh"].includes(freshnessStatus);
  const sourceConfidence = Number(raw.confidence);
  const baseConfidence = Number.isFinite(sourceConfidence) ? Math.round(sourceConfidence * 100) : 80;
  const dedupeKey = `${definition.id}|${purchaseUrl}`;
  const tags = new Set([
    ...tagsFor(definition.id, productName, deliveryType),
    ...sourceFilterTags.map((tag) => sourceFilterTagLabels[tag]).filter(Boolean),
  ]);
  const offer = {
    id: `offer-${hash(dedupeKey)}`,
    sourceOfferId: raw.id ? String(raw.id) : null,
    categoryId: definition.id,
    categoryName: definition.name,
    merchant: merchant.slice(0, 120),
    productName: productName.slice(0, 280),
    priceCny,
    previousPriceCny: null,
    historicalLowCny: null,
    channelLowCny: null,
    strictLowCny: null,
    trustedLowCny: null,
    stockStatus,
    stockCount,
    purchaseUrl,
    shopUrl: cleanUrl(raw.shopUrl),
    domain: domainOf(purchaseUrl),
    updatedAt,
    checkedAt: null,
    pageCheckStatus: "not_checked",
    pageCheckReason: "本轮尚未访问原商品页。",
    verification: feedVerified ? "feed" : "indexed",
    verificationReason: feedVerified
      ? `公开渠道接口在 ${feedFreshHours} 小时新鲜窗口内返回${stockStatus === "in_stock" ? "正库存" : "售罄"}状态；该证据不等同原页下单确认。`
      : "公开渠道接口已收录，但库存更新时间不在新鲜窗口内，等待原商品页轮询核验。",
    stockEvidence: feedVerified ? "channel_feed" : stockStatus === "unverified" ? "unknown" : "directory",
    freshnessStatus,
    availabilityConfidence: feedVerified ? Math.max(70, Math.min(90, baseConfidence)) : stockStatus === "unverified" ? 25 : 42,
    deliveryType,
    productForm,
    sourceFilterTags,
    collectorKind: raw.collectorKind ? String(raw.collectorKind) : "public_json_feed",
    sourceConfidence: Number.isFinite(sourceConfidence) ? sourceConfidence : null,
    sourcePriority: Number.isFinite(Number(raw.sourcePriority)) ? Number(raw.sourcePriority) : null,
    sourceExpiresAt: toIso(String(raw.expiresAt ?? ""), nowDate),
    tags: [...tags],
    minPurchase: Number.isFinite(Number(raw.minOrderQuantity)) && Number(raw.minOrderQuantity) > 0 ? Number(raw.minOrderQuantity) : null,
    firstSeenAt: nowDate.toISOString(),
    lastSeenAt: nowDate.toISOString(),
    priceHistory: [],
    stockHistory: [],
    stockDepletion7d: null,
    salesCount: null,
    salesSource: null,
    salesCheckedAt: null,
  };
  offer.purchaseEvidence = purchaseEvidenceFor(offer);
  offer.purchaseStatus = purchaseStatusFor(offer);
  return offer;
}

async function discoverCategoryFromApi(definition) {
  const result = await collectPriceAiOffers(definition.sourceProductId ?? definition.id, {
    concurrency: apiConcurrency,
    maxPages: maxApiPages,
  });
  if (!result.ok) {
    return {
      ok: false,
      total: definition.fallbackTotal,
      inStock: definition.fallbackInStock,
      offers: [],
      clickCount: 0,
      pageCount: result.pageCount,
      transport: priceAiAdapterMeta.transport,
      sourceGeneratedAt: result.generatedAt,
      complete: false,
      error: result.error,
    };
  }
  const nowDate = new Date();
  const offers = result.offers.map((raw) => normalizeApiOffer(definition, raw, nowDate)).filter(Boolean);
  return {
    ok: offers.length > 0,
    total: result.total,
    inStock: result.inStock,
    offers,
    clickCount: 0,
    pageCount: result.pageCount,
    transport: priceAiAdapterMeta.transport,
    sourceGeneratedAt: result.generatedAt,
    complete: result.complete && offers.length >= result.total,
    error: offers.length > 0 ? null : "公开报价接口没有返回可用商品链接。",
  };
}

async function discoverCategoryFromPage(context, definition) {
  const page = await context.newPage();
  try {
    await page.goto(definition.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(1_200);
    const rawOfferMap = new Map();
    const collectVisibleOffers = async () => {
      const batch = await extractRawOffers(page);
      for (const offer of batch) {
        const key = offer.purchaseUrl || `${offer.merchant}|${offer.productName}|${offer.priceText}`;
        rawOfferMap.set(key, offer);
      }
      return rawOfferMap.size;
    };
    await collectVisibleOffers();
    let clickCount = 0;
    let stagnant = 0;
    while (clickCount < maxLoadClicks && stagnant < 3) {
      const button = await visibleLoadButton(page);
      if (!button) break;
      const before = await page.locator("table tbody tr").count();
      const beforeCollected = rawOfferMap.size;
      const beforeLabel = (await button.textContent().catch(() => "")) ?? "";
      await button.scrollIntoViewIfNeeded().catch(() => undefined);
      const clicked = await button.click({ timeout: 12_000 }).then(() => true).catch(() => false);
      if (!clicked) {
        stagnant += 1;
        continue;
      }
      await page.waitForFunction(({ label, rowCount }) => {
        const buttonTexts = [...document.querySelectorAll("button")].map((node) => node.textContent?.trim() ?? "");
        const loading = buttonTexts.some((text) => /正在.*加载|加载中/.test(text));
        const rows = document.querySelectorAll("table tbody tr").length;
        return !loading && (rows !== rowCount || !buttonTexts.includes(label));
      }, { label: beforeLabel, rowCount: before }, { timeout: 35_000 }).catch(() => undefined);
      await page.waitForTimeout(250);
      const after = await page.locator("table tbody tr").count();
      const afterCollected = await collectVisibleOffers();
      const nextButton = await visibleLoadButton(page);
      const afterLabel = nextButton ? ((await nextButton.textContent().catch(() => "")) ?? "") : "complete";
      stagnant = afterCollected > beforeCollected || after > before || afterLabel !== beforeLabel ? 0 : stagnant + 1;
      clickCount += 1;
    }

    const bodyText = await page.locator("body").innerText();
    const summaryMatch = bodyText.match(/([\d,]+)\s*条报价\s*[·•]\s*([\d,]+)\s*有货/);
    const total = summaryMatch ? Number(summaryMatch[1].replaceAll(",", "")) : definition.fallbackTotal;
    const inStock = summaryMatch ? Number(summaryMatch[2].replaceAll(",", "")) : definition.fallbackInStock;
    const rawOffers = [...rawOfferMap.values()];

    const seen = new Set();
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const offers = [];
    for (const raw of rawOffers) {
      const purchaseUrl = cleanUrl(raw.purchaseUrl);
      if (!purchaseUrl || !raw.merchant || !raw.productName) continue;
      const dedupeKey = `${definition.id}|${purchaseUrl}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const priceMatch = raw.priceText.match(/[¥￥]\s*([\d,]+(?:\.\d+)?)/);
      const stockMatch = raw.stockText.match(/库存\s*([\d,]+)/);
      const minimumMatch = raw.priceText.match(/(\d+)\s*件起购/);
      const priceCny = priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : null;
      const stockCount = stockMatch ? Number(stockMatch[1].replaceAll(",", "")) : null;
      const stockStatus = /缺货|售罄/.test(raw.stockText) ? "out_of_stock" : /有货/.test(raw.stockText) ? "in_stock" : "unverified";
      const deliveryType = deliveryFor(definition.id, `${raw.productName} ${raw.stockText}`);
      const productForm = productFormFor(definition.id, raw.productName);
      const updatedAt = toIso(raw.updatedText, nowDate);
      const freshnessStatus = freshnessFor(updatedAt, nowDate.getTime());
      const feedVerified = stockStatus !== "unverified" && ["live", "fresh"].includes(freshnessStatus);
      const offer = {
        id: `offer-${hash(dedupeKey)}`,
        sourceOfferId: null,
        categoryId: definition.id,
        categoryName: definition.name,
        merchant: raw.merchant.slice(0, 120),
        productName: raw.productName.slice(0, 280),
        priceCny: Number.isFinite(priceCny) ? priceCny : null,
        previousPriceCny: null,
        historicalLowCny: null,
        trustedLowCny: null,
        stockStatus,
        stockCount: Number.isFinite(stockCount) ? stockCount : null,
        purchaseUrl,
        shopUrl: cleanUrl(raw.shopUrl),
        domain: domainOf(purchaseUrl),
        updatedAt,
        checkedAt: null,
        pageCheckStatus: "not_checked",
        pageCheckReason: "本轮尚未访问原商品页。",
        verification: feedVerified ? "feed" : "indexed",
        verificationReason: feedVerified
          ? `上游渠道在 ${feedFreshHours} 小时新鲜窗口内返回${stockStatus === "in_stock" ? "正库存" : "售罄"}状态；该证据不等同原页下单确认。`
          : "公开目录已收录，但库存更新时间不在新鲜窗口内，等待原商品页轮询核验。",
        stockEvidence: feedVerified ? "channel_feed" : stockStatus === "unverified" ? "unknown" : "directory",
        freshnessStatus,
        availabilityConfidence: feedVerified ? 82 : stockStatus === "unverified" ? 25 : 42,
        deliveryType,
        productForm,
        sourceFilterTags: [],
        collectorKind: "rendered_page",
        sourceConfidence: null,
        sourcePriority: null,
        sourceExpiresAt: null,
        tags: tagsFor(definition.id, raw.productName, deliveryType),
        minPurchase: minimumMatch ? Number(minimumMatch[1]) : null,
        firstSeenAt: now,
        lastSeenAt: now,
        priceHistory: [],
        stockHistory: [],
        stockDepletion7d: null,
        salesCount: null,
        salesSource: null,
        salesCheckedAt: null,
      };
      offer.purchaseEvidence = purchaseEvidenceFor(offer);
      offer.purchaseStatus = purchaseStatusFor(offer);
      offers.push(offer);
    }
    return { ok: true, total, inStock, offers, clickCount, pageCount: clickCount + 1, transport: "rendered_page_fallback", sourceGeneratedAt: null, complete: offers.length >= total, error: null };
  } catch (error) {
    return { ok: false, total: definition.fallbackTotal, inStock: definition.fallbackInStock, offers: [], clickCount: 0, pageCount: 0, transport: "rendered_page_fallback", sourceGeneratedAt: null, complete: false, error: safeError(error) };
  } finally {
    await page.close();
  }
}

function selectVerificationTargets(offers, previousMap) {
  const cycle = Math.floor(Date.now() / (30 * 60 * 1000));
  const priority = new Map();
  for (const definition of categories) {
    offers
      .filter((offer) => offer.categoryId === definition.id && offer.stockStatus === "in_stock")
      .sort((a, b) => (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity))
      .slice(0, 24)
      .forEach((offer, index) => priority.set(offer.id, 12_000 - index));
  }
  const scored = [...offers].sort((a, b) => {
    const aPrevious = previousMap.get(a.id);
    const bPrevious = previousMap.get(b.id);
    const aAge = aPrevious?.checkedAt ? Date.now() - new Date(aPrevious.checkedAt).getTime() : Infinity;
    const bAge = bPrevious?.checkedAt ? Date.now() - new Date(bPrevious.checkedAt).getTime() : Infinity;
    const formScore = (offer) => offer.productForm === "finished_account" ? 2600 : offer.productForm === "seat_membership" ? 1800 : ["mirror_access", "shared_access"].includes(offer.productForm) ? -3500 : 0;
    const aScore = (priority.get(a.id) ?? 0) + formScore(a) + (aPrevious?.verification === "direct" && aAge > 6 * 60 * 60 * 1000 ? 5000 : 0) + (aPrevious?.salesCount != null ? 700 : 0) + (Number.parseInt(hash(`${a.id}-${cycle}`, 8), 16) % 2500);
    const bScore = (priority.get(b.id) ?? 0) + formScore(b) + (bPrevious?.verification === "direct" && bAge > 6 * 60 * 60 * 1000 ? 5000 : 0) + (bPrevious?.salesCount != null ? 700 : 0) + (Number.parseInt(hash(`${b.id}-${cycle}`, 8), 16) % 2500);
    return bScore - aScore;
  });

  // Round-robin domains so one large platform cannot consume the entire budget.
  const buckets = new Map();
  for (const offer of scored) {
    if (!buckets.has(offer.domain)) buckets.set(offer.domain, []);
    buckets.get(offer.domain).push(offer);
  }
  const result = [];
  while (result.length < maxVerifications && buckets.size) {
    for (const [domain, bucket] of buckets) {
      const next = bucket.shift();
      if (next) result.push(next);
      if (!bucket.length) buckets.delete(domain);
      if (result.length >= maxVerifications) break;
    }
  }
  return result;
}

function pageText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&yen;|&#165;/gi, "¥").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function disclosedSales(text) {
  const matches = [...text.matchAll(/(?:累计)?(?:已售|销量|售出|购买人数|人购买)\s*(?:[:：为]|约)?\s*([\d,.]+)\s*(万|千|k)?/gi)];
  const values = matches.map((match) => {
    const base = Number(match[1].replaceAll(",", ""));
    const multiplier = /万/i.test(match[2] ?? "") ? 10_000 : /千|k/i.test(match[2] ?? "") ? 1_000 : 1;
    return Number.isFinite(base) ? Math.round(base * multiplier) : null;
  }).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function planSignalFor(offer, text) {
  const lower = text.toLowerCase();
  const patterns = {
    "chatgpt-plus": /(?:chat\s*gpt|gpt|codex|g)\s*[-_]?\s*plus|plus\s*(?:账号|成品|account)/i,
    "chatgpt-team-business": /chat\s*gpt\s*(?:team|business)|\b(?:team|business)\b|k12/i,
    "chatgpt-plus-recharge": /(?:chat\s*gpt|gpt|codex|g)\s*[-_]?\s*plus|plus\s*(?:充值|代充|cdk|卡)/i,
    "chatgpt-free-account": /chat\s*gpt|gpt|codex/i,
    "chatgpt-go": /chat\s*gpt\s*go|gpt\s*go|\bgo\b/i,
    "chatgpt-pro-20x": /(?:chat\s*gpt|gpt)?\s*pro\s*(?:20\s*x|20倍)/i,
    "chatgpt-pro-5x": /(?:chat\s*gpt|gpt)?\s*pro\s*(?:5\s*x|5倍)/i,
    "chatgpt-services": /chat\s*gpt|gpt|codex|提链|扫码|邀请|充值/i,
  };
  return (patterns[offer.categoryId] ?? /chat\s*gpt|gpt|codex/i).test(lower);
}

async function verifyOffer(offer, domainState) {
  const state = domainState.get(offer.domain) ?? { blocks: 0, skipped: 0 };
  if (state.blocks >= 2) {
    state.skipped += 1;
    domainState.set(offer.domain, state);
    return {
      verification: "failed",
      checkedAt: new Date().toISOString(),
      pageCheckStatus: "circuit_open",
      pageCheckReason: "该域名连续返回访问验证，本轮已启用域名级熔断，避免重复无效请求。",
      blocked: true,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), originalPageTimeout);
  const checkedAt = new Date().toISOString();
  try {
    await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 180)));
    const response = await fetch(offer.purchaseUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (compatible; LiandongMarketRadar/3.0; +https://github.com/yusheng266186-beep/liandong-ai-radar)",
      },
    });
    const html = (await response.text()).slice(0, 2_500_000);
    const text = pageText(html);
    const lower = text.toLowerCase();
    const blocked = /cf_app_waf|access denied|请求过于频繁|验证后继续|request id|captcha challenge|验证您是真人|human verification/.test(lower) || text.length < 90;
    if (!response.ok || blocked) {
      if (blocked) state.blocks += 1;
      domainState.set(offer.domain, state);
      return {
        verification: "failed",
        checkedAt,
        pageCheckStatus: blocked ? "blocked" : "http_error",
        pageCheckReason: blocked ? "原站返回访问拦截或人机验证页，本轮不能确认下单状态。" : `原站返回 HTTP ${response.status}，本轮不能确认下单状态。`,
        blocked,
      };
    }
    const amount = offer.priceCny;
    const variants = amount == null ? [] : [amount.toFixed(2), String(amount), amount.toLocaleString("en-US", { maximumFractionDigits: 2 })];
    const hasPrice = variants.some((value) => text.includes(value)) && /[¥￥$]|价格|price/i.test(text);
    const stockMatches = [...text.matchAll(/(?:库存|stock)\s*(?:[:：]|in)?\s*([\d,]+)/gi)];
    const positiveStock = stockMatches.some((match) => Number(match[1].replaceAll(",", "")) > 0) || /库存充足|stock\s*in\s*stock|fully\s*stocked|现货|有货/i.test(text);
    const soldOut = /售罄|缺货|sold\s*out|out\s*of\s*stock|库存\s*[:：]?\s*0\b|stock\s*[:：]?\s*0\b/i.test(text);
    const purchaseSignal = /立即购买|购买数量|立即下单|提交订单|支付方式|付款|\bbuy\b|add\s*to\s*cart|payment/i.test(text);
    const productSignal = planSignalFor(offer, lower);
    const redirectedToLogin = /\/(?:login|signin|auth)(?:\/|\?|$)/i.test(new URL(response.url).pathname);
    const observedStock = stockMatches.map((match) => Number(match[1].replaceAll(",", ""))).find((value) => Number.isFinite(value));
    const salesCount = productSignal ? disclosedSales(text) : null;
    const purchaseEvidence = purchaseEvidenceFor({
      categoryId: productSignal ? offer.categoryId : "",
      priceCny: hasPrice ? offer.priceCny : null,
      stockStatus: positiveStock && !soldOut ? "in_stock" : soldOut ? "out_of_stock" : "unverified",
      purchaseUrl: redirectedToLogin ? null : offer.purchaseUrl,
      checkoutActionConfirmed: purchaseSignal && !redirectedToLogin,
    });
    if (Object.values(purchaseEvidence).every(Boolean) && !soldOut) {
      return {
        verification: "direct",
        checkedAt,
        pageCheckStatus: "confirmed",
        pageCheckReason: "原商品页同时识别到商品、价格、正库存与下单动作，且未发现售罄信号。",
        observedStockCount: observedStock ?? null,
        salesCount,
        purchaseEvidence,
      };
    }
    const missing = [!hasPrice && "匹配价格", !positiveStock && "正库存", !purchaseSignal && "下单动作", !productSignal && "匹配套餐", redirectedToLogin && "免登录下单入口", soldOut && "无售罄冲突"].filter(Boolean).join("、");
    return {
      verification: "reachable",
      checkedAt,
      pageCheckStatus: "reachable",
      pageCheckReason: `原商品页可访问，但缺少${missing || "足够"}证据，未标记为确认可购买。`,
      observedStockCount: observedStock ?? null,
      salesCount,
      purchaseEvidence,
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "原商品页访问超时，本轮不能确认库存。" : "原商品页本轮访问失败，已保留直达链接但不确认可购买。";
    return { verification: "failed", checkedAt, pageCheckStatus: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error", pageCheckReason: reason, blocked: false };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function mergePrevious(current, previous, now) {
  current.freshnessStatus = current.freshnessStatus ?? freshnessFor(current.updatedAt);
  const currentFeedFresh = current.stockStatus !== "unverified" && ["live", "fresh"].includes(current.freshnessStatus);
  if (currentFeedFresh && !["direct", "feed"].includes(current.verification)) {
    current.verification = "feed";
    current.verificationReason = `上游渠道在 ${feedFreshHours} 小时新鲜窗口内返回明确库存状态；该证据不等同原页下单确认。`;
  }
  current.pageCheckStatus = current.pageCheckStatus ?? "not_checked";
  current.pageCheckReason = current.pageCheckReason ?? "本轮尚未完成原商品页复核。";
  current.stockEvidence = current.stockEvidence ?? (current.verification === "direct" ? "original_page" : currentFeedFresh ? "channel_feed" : current.stockStatus === "unverified" ? "unknown" : "directory");
  current.availabilityConfidence = current.availabilityConfidence ?? (current.verification === "direct" ? 96 : current.verification === "feed" ? 82 : current.verification === "reachable" ? 58 : current.verification === "failed" ? 18 : 42);
  current.priceHistory = Array.isArray(current.priceHistory) ? current.priceHistory : [];
  current.stockHistory = Array.isArray(current.stockHistory) ? current.stockHistory : [];
  current.salesCount = current.salesCount ?? null;
  current.salesSource = current.salesSource ?? null;
  current.salesCheckedAt = current.salesCheckedAt ?? null;
  current.stockDepletion7d = current.stockDepletion7d ?? null;
  current.productForm = current.productForm ?? productFormFor(current.categoryId, current.productName, current.sourceFilterTags ?? []);
  current.sourceFilterTags = Array.isArray(current.sourceFilterTags) ? current.sourceFilterTags : [];
  current.collectorKind = current.collectorKind ?? "unknown";
  current.sourceConfidence = current.sourceConfidence ?? null;
  current.sourcePriority = current.sourcePriority ?? null;
  current.sourceExpiresAt = current.sourceExpiresAt ?? null;
  current.purchaseEvidence = current.purchaseEvidence ?? purchaseEvidenceFor(current);
  current.purchaseStatus = current.purchaseStatus ?? purchaseStatusFor(current);
  current.channelLowCny = current.channelLowCny ?? null;
  current.strictLowCny = current.strictLowCny ?? null;
  if (!previous) return current;
  current.firstSeenAt = previous.firstSeenAt || current.firstSeenAt;
  current.previousPriceCny = previous.priceCny ?? null;
  current.priceHistory = Array.isArray(previous.priceHistory)
    ? previous.priceHistory.slice(-47).map((point) => ({
      ...point,
      evidence: point.evidence ?? previous.verification ?? "indexed",
      purchaseStatus: point.purchaseStatus ?? (point.evidence === "direct" ? "confirmed" : point.evidence === "feed" ? "channel_candidate" : undefined),
    }))
    : [];
  current.stockHistory = Array.isArray(previous.stockHistory) ? previous.stockHistory.slice(-47) : [];
  current.historicalLowCny = previous.historicalLowCny ?? null;
  current.channelLowCny = previous.channelLowCny ?? previous.trustedLowCny ?? null;
  current.strictLowCny = previous.strictLowCny ?? null;
  current.trustedLowCny = previous.strictLowCny ?? null;
  current.salesCount = previous.salesCount ?? null;
  current.salesSource = previous.salesSource ?? null;
  current.salesCheckedAt = previous.salesCheckedAt ?? null;
  current.stockDepletion7d = previous.stockDepletion7d ?? null;
  const verificationAge = previous.checkedAt ? Date.now() - new Date(previous.checkedAt).getTime() : Infinity;
  const priceUnchanged = current.priceCny != null && previous.priceCny != null && Math.abs(current.priceCny - previous.priceCny) < 0.005;
  if (verificationAge <= 12 * 60 * 60 * 1000 && previous.verification === "direct" && current.stockStatus === "in_stock" && priceUnchanged) {
    current.verification = previous.verification;
    current.checkedAt = previous.checkedAt;
    current.pageCheckStatus = previous.pageCheckStatus ?? "confirmed";
    current.pageCheckReason = previous.pageCheckReason ?? previous.verificationReason;
    current.verificationReason = `${previous.verificationReason}（沿用 12 小时内最近原页确认）`;
    current.stockEvidence = "original_page";
    current.availabilityConfidence = 96;
    current.purchaseEvidence = previous.purchaseEvidence ?? purchaseEvidenceFor({ ...current, checkoutActionConfirmed: true });
    current.purchaseEvidence.checkoutActionConfirmed = true;
    current.purchaseStatus = "confirmed";
  }
  if (current.verification !== "direct") current.purchaseStatus = purchaseStatusFor(current);
  current.lastSeenAt = now;
  return current;
}

function applyPageCheck(offer, check) {
  offer.checkedAt = check.checkedAt;
  offer.pageCheckStatus = check.pageCheckStatus;
  offer.pageCheckReason = check.pageCheckReason;
  if (check.salesCount != null) {
    offer.salesCount = check.salesCount;
    offer.salesSource = "original_page";
    offer.salesCheckedAt = check.checkedAt;
  }
  if (check.verification === "direct") {
    offer.verification = "direct";
    offer.verificationReason = check.pageCheckReason;
    offer.stockEvidence = "original_page";
    offer.freshnessStatus = "live";
    offer.availabilityConfidence = 96;
    offer.purchaseEvidence = check.purchaseEvidence ?? purchaseEvidenceFor({ ...offer, checkoutActionConfirmed: true });
    offer.purchaseStatus = "confirmed";
    if (check.observedStockCount != null) offer.stockCount = check.observedStockCount;
    return;
  }
  if (check.verification === "reachable") {
    offer.verification = "reachable";
    offer.verificationReason = check.pageCheckReason;
    offer.availabilityConfidence = offer.stockStatus === "in_stock" ? 58 : 45;
    offer.purchaseEvidence = check.purchaseEvidence ?? offer.purchaseEvidence;
    offer.purchaseStatus = offer.stockStatus === "out_of_stock" ? "unavailable" : "unverified";
    if (check.observedStockCount != null) offer.stockCount = check.observedStockCount;
    return;
  }
  if (offer.verification === "feed") {
    offer.verificationReason = `${offer.verificationReason} 原页复核未完成：${check.pageCheckReason}`;
    offer.purchaseStatus = purchaseStatusFor(offer);
    return;
  }
  offer.verification = "failed";
  offer.verificationReason = check.pageCheckReason;
  offer.availabilityConfidence = 18;
  offer.purchaseStatus = offer.stockStatus === "out_of_stock" ? "unavailable" : "unverified";
}

function appendObservationHistory(offer, now) {
  if (offer.priceCny != null) {
    const lastPrice = offer.priceHistory.at(-1);
    const oldEnough = !lastPrice || Date.now() - new Date(lastPrice.at).getTime() >= 20 * 60 * 1000;
    if (!lastPrice || lastPrice.priceCny !== offer.priceCny || oldEnough) {
      offer.priceHistory.push({ at: now, priceCny: offer.priceCny, evidence: offer.verification, purchaseStatus: offer.purchaseStatus });
    }
    offer.priceHistory = offer.priceHistory.slice(-48);
    offer.historicalLowCny = Math.min(...offer.priceHistory.map((point) => point.priceCny));
    const channelTrusted = offer.priceHistory.filter((point) => ["confirmed", "channel_candidate"].includes(point.purchaseStatus ?? "") || (!point.purchaseStatus && ["direct", "feed"].includes(point.evidence ?? "")));
    const strictTrusted = offer.priceHistory.filter((point) => point.purchaseStatus === "confirmed" || (!point.purchaseStatus && point.evidence === "direct"));
    offer.channelLowCny = channelTrusted.length ? Math.min(...channelTrusted.map((point) => point.priceCny)) : null;
    offer.strictLowCny = strictTrusted.length ? Math.min(...strictTrusted.map((point) => point.priceCny)) : null;
    offer.trustedLowCny = offer.strictLowCny;
  }
  if (offer.stockCount != null) {
    const lastStock = offer.stockHistory.at(-1);
    const oldEnough = !lastStock || Date.now() - new Date(lastStock.at).getTime() >= 20 * 60 * 1000;
    if (!lastStock || lastStock.stockCount !== offer.stockCount || lastStock.status !== offer.stockStatus || oldEnough) {
      offer.stockHistory.push({ at: now, stockCount: offer.stockCount, status: offer.stockStatus });
    }
    offer.stockHistory = offer.stockHistory.slice(-48);
  }
  const cutoff = Date.now() - 7 * 86_400_000;
  const recent = offer.stockHistory.filter((point) => new Date(point.at).getTime() >= cutoff && point.stockCount != null);
  let depletion = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const drop = recent[index - 1].stockCount - recent[index].stockCount;
    if (drop > 0) depletion += drop;
  }
  offer.stockDepletion7d = recent.length >= 2 ? depletion : null;
}

function makeDeltas(offers, previousMap, now) {
  const deltas = [];
  for (const offer of offers) {
    const previous = previousMap.get(offer.id);
    if (!previous) {
      deltas.push({ id: `delta-${hash(`new-${offer.id}-${now}`)}`, type: "new", merchant: offer.merchant, productName: offer.productName, before: "未收录", after: "新增商品", at: now });
      continue;
    }
    if (previous.priceCny != null && offer.priceCny != null && Math.abs(previous.priceCny - offer.priceCny) >= 0.01) {
      deltas.push({ id: `delta-${hash(`price-${offer.id}-${now}`)}`, type: offer.priceCny < previous.priceCny ? "price_down" : "price_up", merchant: offer.merchant, productName: offer.productName, before: `¥${previous.priceCny}`, after: `¥${offer.priceCny}`, at: now });
    }
    if (previous.stockStatus !== offer.stockStatus && [previous.stockStatus, offer.stockStatus].includes("in_stock")) {
      deltas.push({ id: `delta-${hash(`stock-${offer.id}-${now}`)}`, type: offer.stockStatus === "in_stock" ? "restocked" : "sold_out", merchant: offer.merchant, productName: offer.productName, before: previous.stockStatus === "in_stock" ? "有货" : "无货", after: offer.stockStatus === "in_stock" ? "恢复有货" : "已售罄", at: now });
    }
    if (previous.purchaseStatus !== offer.purchaseStatus && [previous.purchaseStatus, offer.purchaseStatus].includes("confirmed")) {
      deltas.push({
        id: `delta-${hash(`purchase-${offer.id}-${now}`)}`,
        type: offer.purchaseStatus === "confirmed" ? "purchase_confirmed" : "purchase_unconfirmed",
        merchant: offer.merchant,
        productName: offer.productName,
        before: previous.purchaseStatus === "confirmed" ? "原页确认可购" : "未完成原页确认",
        after: offer.purchaseStatus === "confirmed" ? "原页确认可购" : "确认已失效",
        at: now,
      });
    }
  }
  const importance = { purchase_confirmed: 0, restocked: 1, price_down: 2, purchase_unconfirmed: 3, sold_out: 4, price_up: 5, new: 6 };
  return deltas.sort((a, b) => importance[a.type] - importance[b.type]).slice(0, 80);
}

function makeSourceDeltas(discovered, previous, now) {
  const previousDiagnostics = new Map((previous.sourceDiagnostics ?? []).map((item) => [item.id, item]));
  const deltas = [];
  for (let index = 0; index < categories.length; index += 1) {
    const definition = categories[index];
    const current = discovered[index];
    const before = previousDiagnostics.get(definition.id);
    if (!before || before.ok === current.ok) continue;
    deltas.push({
      id: `delta-${hash(`source-${definition.id}-${now}`)}`,
      type: current.ok ? "source_recovered" : "source_failed",
      merchant: definition.name,
      productName: "公开数据来源",
      before: before.ok ? "来源可用" : "来源异常",
      after: current.ok ? "来源恢复" : "来源异常",
      at: now,
    });
  }
  return deltas;
}

async function main() {
  const previous = await readPrevious();
  const previousMap = new Map((previous.offers ?? []).map((offer) => [offer.id, offer]));
  const now = new Date().toISOString();
  const discovered = await mapLimit(categories, discoveryConcurrency, (definition) => discoverCategoryFromApi(definition));
  const failedIndexes = discovered.map((result, index) => result.ok ? -1 : index).filter((index) => index >= 0);
  if (failedIndexes.length) {
    let browser;
    let context;
    try {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({ locale: "zh-CN", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36" });
      const fallbacks = await mapLimit(failedIndexes, discoveryConcurrency, (index) => discoverCategoryFromPage(context, categories[index]));
      fallbacks.forEach((fallback, position) => {
        const index = failedIndexes[position];
        const primaryError = discovered[index].error;
        discovered[index] = fallback.ok
          ? { ...fallback, primaryError }
          : { ...fallback, primaryError, error: `结构化接口：${primaryError || "失败"}；页面回退：${fallback.error || "失败"}`.slice(0, 240) };
      });
    } catch (error) {
      for (const index of failedIndexes) discovered[index].error = `结构化接口：${discovered[index].error || "失败"}；页面回退不可用：${safeError(error)}`.slice(0, 240);
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }
  for (let index = 0; index < categories.length; index += 1) {
    const result = discovered[index];
    process.stdout.write(`${categories[index].id}: ${result.ok ? `${result.offers.length}/${result.total} rows via ${result.transport}${result.complete ? "" : " (partial)"}` : `failed (${result.error})`}\n`);
  }

  const offers = [];
  for (let index = 0; index < categories.length; index += 1) {
    const definition = categories[index];
    const result = discovered[index];
    const currentOffers = result.ok ? result.offers : (previous.offers ?? []).filter((offer) => offer.categoryId === definition.id);
    for (const offer of currentOffers) offers.push(mergePrevious({ ...offer }, previousMap.get(offer.id), now));
  }

  const targetOffers = selectVerificationTargets(offers.filter((offer) => offer.stockStatus !== "out_of_stock"), previousMap);
  const domainState = new Map();
  const checks = await mapLimit(targetOffers, verificationConcurrency, (offer) => verifyOffer(offer, domainState));
  checks.forEach((check, index) => applyPageCheck(targetOffers[index], check));

  for (const offer of offers) appendObservationHistory(offer, now);

  const categoryPayload = categories.map((definition, index) => {
    const result = discovered[index];
    const categoryOffers = offers.filter((offer) => offer.categoryId === definition.id);
    const comparableForms = definition.id === "chatgpt-plus"
      ? new Set(["finished_account", "web_account"])
      : definition.id === "chatgpt-team-business"
        ? new Set(["finished_account", "seat_membership"])
        : null;
    const comparable = categoryOffers.filter((offer) => !comparableForms || comparableForms.has(offer.productForm));
    const candidatePrices = comparable.filter((offer) => ["confirmed", "channel_candidate"].includes(offer.purchaseStatus) && offer.priceCny != null).map((offer) => offer.priceCny);
    const strictPrices = comparable.filter((offer) => offer.purchaseStatus === "confirmed" && offer.priceCny != null).map((offer) => offer.priceCny);
    const finishedAccountPrices = categoryOffers.filter((offer) => offer.productForm === "finished_account" && ["confirmed", "channel_candidate"].includes(offer.purchaseStatus) && offer.priceCny != null).map((offer) => offer.priceCny);
    return {
      id: definition.id, name: definition.name, shortName: definition.shortName, description: definition.description, tags: definition.tags,
      offerCount: Math.max(result.total, categoryOffers.length), loadedCount: categoryOffers.length, inStockCount: result.inStock, sourceComplete: Boolean(result.complete),
      verifiedCount: categoryOffers.filter((offer) => ["confirmed", "channel_candidate"].includes(offer.purchaseStatus)).length,
      directVerifiedCount: categoryOffers.filter((offer) => offer.purchaseStatus === "confirmed").length,
      feedVerifiedCount: categoryOffers.filter((offer) => offer.purchaseStatus === "channel_candidate").length,
      floorPriceCny: candidatePrices.length ? Math.min(...candidatePrices) : null,
      channelFloorPriceCny: candidatePrices.length ? Math.min(...candidatePrices) : null,
      strictFloorPriceCny: strictPrices.length ? Math.min(...strictPrices) : null,
      finishedAccountFloorPriceCny: finishedAccountPrices.length ? Math.min(...finishedAccountPrices) : null,
    };
  });

  const uniqueMerchants = new Set(offers.map((offer) => offer.merchant.trim().toLocaleLowerCase("zh-CN"))).size;
  const domains = new Set(offers.map((offer) => offer.domain).filter((domain) => domain && domain !== "unknown")).size;
  const failedDirectories = discovered.filter((result) => !result.ok).length;
  const failedVerifications = offers.filter((offer) => offer.verification === "failed").length;
  const blockedDomains = [...domainState.entries()].filter(([, state]) => state.blocks >= 2).map(([domain, state]) => ({ domain, blockedChecks: state.blocks, skippedChecks: state.skipped }));
  const payload = {
    schemaVersion: 5,
    generatedAt: now,
    runId: `run-${now.slice(0, 13).replace(/[-T:]/g, "")}-${hash(String(offers.length), 4)}`,
    sourceWindow: `${categories.length - failedDirectories}/${categories.length} 个目录完成 · 本轮抽查 ${targetOffers.length} 个原商品页`,
    coverage: {
      listedOffers: Math.max(categoryPayload.reduce((sum, category) => sum + category.offerCount, 0), offers.length),
      loadedOffers: offers.length,
      uniqueMerchants,
      inStock: offers.filter((offer) => offer.stockStatus === "in_stock").length,
      directVerified: offers.filter((offer) => offer.purchaseStatus === "confirmed").length,
      strictPurchasable: offers.filter((offer) => offer.purchaseStatus === "confirmed").length,
      feedVerified: offers.filter((offer) => offer.purchaseStatus === "channel_candidate").length,
      channelCandidates: offers.filter((offer) => offer.purchaseStatus === "channel_candidate").length,
      finishedAccounts: offers.filter((offer) => offer.productForm === "finished_account").length,
      reachable: offers.filter((offer) => offer.verification === "reachable").length,
      freshOffers: offers.filter((offer) => ["live", "fresh"].includes(offer.freshnessStatus)).length,
      staleOffers: offers.filter((offer) => offer.freshnessStatus === "stale").length,
      salesObserved: offers.filter((offer) => offer.salesCount != null).length,
      domains,
      failedSources: failedDirectories + failedVerifications,
      blockedDomains: blockedDomains.length,
      activeSources: discovered.filter((result) => result.ok).length,
      completeSources: discovered.filter((result) => result.ok && result.complete).length,
      partialSources: discovered.filter((result) => result.ok && !result.complete).length,
    },
    categories: categoryPayload,
    offers: offers.sort((a, b) => a.categoryId.localeCompare(b.categoryId) || (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity)),
    deltas: [...makeSourceDeltas(discovered, previous, now), ...makeDeltas(offers, previousMap, now)].slice(0, 80),
    sourceDiagnostics: categories.map((definition, index) => ({
      id: definition.id,
      source: priceAiAdapterMeta.id,
      transport: discovered[index].transport,
      ok: discovered[index].ok,
      offersLoaded: discovered[index].offers.length,
      listedOffers: discovered[index].total,
      loadClicks: discovered[index].clickCount,
      pageCount: discovered[index].pageCount ?? 0,
      requestCount: discovered[index].requestCount ?? discovered[index].pageCount ?? 0,
      complete: Boolean(discovered[index].complete),
      completeness: discovered[index].total ? Math.min(1, discovered[index].offers.length / discovered[index].total) : 0,
      sourceGeneratedAt: discovered[index].sourceGeneratedAt ?? null,
      primaryError: discovered[index].primaryError ?? null,
      error: discovered[index].error,
    })),
    domainDiagnostics: blockedDomains,
    notices: [
      "渠道报价可能包含同一商家多规格、同名报价组或同平台多店铺，不等于相同数量的独立商家。",
      "渠道候选代表公开结构化接口最近返回套餐、价格、明确库存与原商家入口；严格可购还要求原商品页同页确认下单动作。两者不会混为一谈。",
      "Plus 与 Business 的成品号、席位、网页号、镜像站、拼车和充值已拆分为不同商品形态，最低价不会再跨形态混算。",
      "销量只在原商品页明确披露时记录；否则展示基于库存历史下降的估算，并明确标为估算。",
      `${failedDirectories} 个公开目录、${failedVerifications} 个原商品页本轮访问失败；失败记录不会推断为有货。`,
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`wrote ${offers.length} offers, ${uniqueMerchants} merchants, ${payload.coverage.directVerified} direct + ${payload.coverage.feedVerified} fresh feed verifications\n`);
}

await main();
