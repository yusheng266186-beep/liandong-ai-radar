import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "public", "data", "catalog.json");
const maxLoadClicks = Number(process.env.CATALOG_MAX_LOAD_CLICKS ?? 60);
const maxVerifications = Number(process.env.CATALOG_MAX_VERIFY ?? 260);
const verificationConcurrency = Number(process.env.CATALOG_VERIFY_CONCURRENCY ?? 6);

const categories = [
  { id: "chatgpt-plus", name: "Plus 试用 / 成品号", shortName: "PLUS", description: "日抛、网页号、已接码与未接码成品号", tags: ["成品号", "网页号", "接码"], url: "https://priceai.cc/products/chatgpt-plus", fallbackTotal: 1108, fallbackInStock: 219 },
  { id: "chatgpt-team-business", name: "Team / Business", shortName: "TEAM", description: "K12、Bug Team、母号、子号与席位邀请", tags: ["席位", "邀请", "K12"], url: "https://priceai.cc/products/chatgpt-team-business", fallbackTotal: 279, fallbackInStock: 96 },
  { id: "chatgpt-plus-recharge", name: "Plus 正价代充", shortName: "RECHARGE", description: "官方渠道、菲区卡充、iOS 与正规代充", tags: ["代充", "CDK", "质保"], url: "https://priceai.cc/products/chatgpt-plus-recharge", fallbackTotal: 253, fallbackInStock: 202 },
  { id: "chatgpt-free-account", name: "ChatGPT 普号", shortName: "FREE", description: "Free 白号、普通账号与 2FA 成品号", tags: ["普号", "2FA", "批发"], url: "https://priceai.cc/products/chatgpt-free-account", fallbackTotal: 217, fallbackInStock: 155 },
  { id: "chatgpt-go", name: "ChatGPT Go", shortName: "GO", description: "Go 月卡、年卡、激活码与自助充值", tags: ["月卡", "卡密", "充值"], url: "https://priceai.cc/products/chatgpt-go", fallbackTotal: 31, fallbackInStock: 24 },
  { id: "chatgpt-pro-20x", name: "ChatGPT Pro 20x", shortName: "PRO 20X", description: "高额度、短期速刷、成品号与正规代开", tags: ["高额度", "速刷", "代开"], url: "https://priceai.cc/products/chatgpt-pro-20x", fallbackTotal: 293, fallbackInStock: 227 },
  { id: "chatgpt-pro-5x", name: "ChatGPT Pro 5x", shortName: "PRO 5X", description: "Pro 5x 成品、iOS 卡密与官方渠道代充", tags: ["iOS", "卡密", "代充"], url: "https://priceai.cc/products/chatgpt-pro-5x", fallbackTotal: 229, fallbackInStock: 182 },
  { id: "chatgpt-services", name: "周边与自助服务", shortName: "SERVICES", description: "提链、扫码、自助充值、邀请与额度服务", tags: ["提链", "扫码", "邀请"], url: "https://priceai.cc/products/chatgpt-codex-service", fallbackTotal: 47, fallbackInStock: 33 },
];

function hash(value, length = 14) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function cleanUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || /(^|\.)priceai\.cc$/i.test(url.hostname)) return null;
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

function toIso(value) {
  if (!value) return null;
  const match = value.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`;
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

async function discoverCategory(context, definition) {
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
    const now = new Date().toISOString();
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
      offers.push({
        id: `offer-${hash(dedupeKey)}`,
        categoryId: definition.id,
        categoryName: definition.name,
        merchant: raw.merchant.slice(0, 120),
        productName: raw.productName.slice(0, 280),
        priceCny: Number.isFinite(priceCny) ? priceCny : null,
        previousPriceCny: null,
        historicalLowCny: null,
        stockStatus,
        stockCount: Number.isFinite(stockCount) ? stockCount : null,
        purchaseUrl,
        shopUrl: cleanUrl(raw.shopUrl),
        domain: domainOf(purchaseUrl),
        updatedAt: toIso(raw.updatedText),
        checkedAt: null,
        verification: "indexed",
        verificationReason: "公开目录已收录，等待原商品页轮询核验。",
        deliveryType,
        tags: tagsFor(definition.id, raw.productName, deliveryType),
        minPurchase: minimumMatch ? Number(minimumMatch[1]) : null,
        firstSeenAt: now,
        lastSeenAt: now,
        priceHistory: [],
      });
    }
    return { ok: true, total, inStock, offers, clickCount, error: null };
  } catch (error) {
    return { ok: false, total: definition.fallbackTotal, inStock: definition.fallbackInStock, offers: [], clickCount: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await page.close();
  }
}

function selectVerificationTargets(offers, previousMap) {
  const cycle = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
  const priority = new Map();
  for (const definition of categories) {
    offers.filter((offer) => offer.categoryId === definition.id && offer.stockStatus === "in_stock").sort((a, b) => (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity)).slice(0, 18).forEach((offer, index) => priority.set(offer.id, 10_000 - index));
  }
  return [...offers].sort((a, b) => {
    const aPrevious = previousMap.get(a.id);
    const bPrevious = previousMap.get(b.id);
    const aAge = aPrevious?.checkedAt ? Date.now() - new Date(aPrevious.checkedAt).getTime() : Infinity;
    const bAge = bPrevious?.checkedAt ? Date.now() - new Date(bPrevious.checkedAt).getTime() : Infinity;
    const aScore = (priority.get(a.id) ?? 0) + (aPrevious?.verification === "direct" && aAge > 8 * 60 * 60 * 1000 ? 4000 : 0) + ((Number.parseInt(hash(`${a.id}-${cycle}`, 8), 16) % 2000));
    const bScore = (priority.get(b.id) ?? 0) + (bPrevious?.verification === "direct" && bAge > 8 * 60 * 60 * 1000 ? 4000 : 0) + ((Number.parseInt(hash(`${b.id}-${cycle}`, 8), 16) % 2000));
    return bScore - aScore;
  }).slice(0, maxVerifications);
}

function pageText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&yen;|&#165;/gi, "¥").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

async function verifyOffer(offer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14_000);
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
    const blocked = /cf_app_waf|access denied|请求过于频繁|验证后继续|request id|captcha challenge/.test(lower) || text.length < 90;
    if (!response.ok || blocked) return { verification: "failed", checkedAt, verificationReason: blocked ? "原站返回访问拦截或验证页，本轮不能确认库存。" : `原站返回 HTTP ${response.status}，本轮不能确认库存。` };
    const amount = offer.priceCny;
    const variants = amount == null ? [] : [amount.toFixed(2), String(amount), amount.toLocaleString("en-US", { maximumFractionDigits: 2 })];
    const hasPrice = variants.some((value) => text.includes(value)) && /[¥￥$]|价格|price/i.test(text);
    const stockMatches = [...text.matchAll(/(?:库存|stock)\s*(?:[:：]|in)?\s*([\d,]+)/gi)];
    const positiveStock = stockMatches.some((match) => Number(match[1].replaceAll(",", "")) > 0) || /库存充足|stock\s*in\s*stock|fully\s*stocked|现货|有货/i.test(text);
    const soldOut = /售罄|缺货|sold\s*out|out\s*of\s*stock|库存\s*[:：]?\s*0\b|stock\s*[:：]?\s*0\b/i.test(text);
    const purchaseSignal = /立即购买|购买数量|立即下单|提交订单|支付方式|付款|\bbuy\b|add\s*to\s*cart|payment/i.test(text);
    const productSignal = /chat\s*gpt|gpt|codex|plus|team|business|pro\s*5x|pro\s*20x/i.test(lower);
    if (hasPrice && positiveStock && purchaseSignal && productSignal && !soldOut) {
      return { verification: "direct", checkedAt, verificationReason: "原商品页同时识别到商品、价格、正库存与下单动作，且未发现售罄信号。" };
    }
    const missing = [!hasPrice && "价格", !positiveStock && "正库存", !purchaseSignal && "下单动作", !productSignal && "商品标识", soldOut && "无售罄冲突"].filter(Boolean).join("、");
    return { verification: "reachable", checkedAt, verificationReason: `原商品页可访问，但缺少${missing || "足够"}证据，未标记为确认可购买。` };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "原商品页访问超时，本轮不能确认库存。" : "原商品页本轮访问失败，已保留直达链接但不确认可购买。";
    return { verification: "failed", checkedAt, verificationReason: reason };
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
  if (!previous) return current;
  current.firstSeenAt = previous.firstSeenAt || current.firstSeenAt;
  current.previousPriceCny = previous.priceCny ?? null;
  current.priceHistory = Array.isArray(previous.priceHistory) ? previous.priceHistory.slice(-29) : [];
  current.historicalLowCny = previous.historicalLowCny ?? null;
  const verificationAge = previous.checkedAt ? Date.now() - new Date(previous.checkedAt).getTime() : Infinity;
  if (verificationAge <= 20 * 60 * 60 * 1000 && previous.verification && current.stockStatus !== "out_of_stock") {
    current.verification = previous.verification;
    current.checkedAt = previous.checkedAt;
    current.verificationReason = `${previous.verificationReason}（沿用 20 小时内最近核验）`;
  }
  current.lastSeenAt = now;
  return current;
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
  }
  const importance = { restocked: 0, price_down: 1, sold_out: 2, price_up: 3, new: 4 };
  return deltas.sort((a, b) => importance[a.type] - importance[b.type]).slice(0, 80);
}

async function main() {
  const previous = await readPrevious();
  const previousMap = new Map((previous.offers ?? []).map((offer) => [offer.id, offer]));
  const now = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "zh-CN", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36" });
  const discovered = [];
  try {
    for (const definition of categories) {
      const result = await discoverCategory(context, definition);
      process.stdout.write(`${definition.id}: ${result.ok ? `${result.offers.length}/${result.total} direct rows after ${result.clickCount} load clicks` : `failed (${result.error})`}\n`);
      discovered.push(result);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const offers = [];
  for (let index = 0; index < categories.length; index += 1) {
    const definition = categories[index];
    const result = discovered[index];
    const currentOffers = result.ok ? result.offers : (previous.offers ?? []).filter((offer) => offer.categoryId === definition.id);
    for (const offer of currentOffers) offers.push(mergePrevious({ ...offer }, previousMap.get(offer.id), now));
  }

  const targetOffers = selectVerificationTargets(offers.filter((offer) => offer.stockStatus !== "out_of_stock"), previousMap);
  const checks = await mapLimit(targetOffers, verificationConcurrency, verifyOffer);
  checks.forEach((check, index) => Object.assign(targetOffers[index], check));

  for (const offer of offers) {
    if (offer.verification === "direct" && offer.stockStatus === "in_stock" && offer.priceCny != null) {
      const last = offer.priceHistory.at(-1);
      if (!last || last.priceCny !== offer.priceCny || Date.now() - new Date(last.at).getTime() > 60 * 60 * 1000) offer.priceHistory.push({ at: offer.checkedAt || now, priceCny: offer.priceCny });
      offer.priceHistory = offer.priceHistory.slice(-30);
      offer.historicalLowCny = Math.min(...offer.priceHistory.map((point) => point.priceCny));
    } else if (offer.historicalLowCny == null && offer.priceHistory.length) {
      offer.historicalLowCny = Math.min(...offer.priceHistory.map((point) => point.priceCny));
    }
  }

  const categoryPayload = categories.map((definition, index) => {
    const result = discovered[index];
    const categoryOffers = offers.filter((offer) => offer.categoryId === definition.id);
    const prices = categoryOffers.filter((offer) => offer.stockStatus === "in_stock" && offer.priceCny != null).map((offer) => offer.priceCny);
    return {
      id: definition.id, name: definition.name, shortName: definition.shortName, description: definition.description, tags: definition.tags,
      offerCount: result.total, inStockCount: result.inStock,
      verifiedCount: categoryOffers.filter((offer) => offer.verification === "direct").length,
      floorPriceCny: prices.length ? Math.min(...prices) : null,
    };
  });

  const uniqueMerchants = new Set(offers.map((offer) => offer.merchant.trim().toLocaleLowerCase("zh-CN"))).size;
  const domains = new Set(offers.map((offer) => offer.domain).filter((domain) => domain && domain !== "unknown")).size;
  const failedDirectories = discovered.filter((result) => !result.ok).length;
  const failedVerifications = offers.filter((offer) => offer.verification === "failed").length;
  const payload = {
    schemaVersion: 3,
    generatedAt: now,
    runId: `run-${now.slice(0, 13).replace(/[-T:]/g, "")}-${hash(String(offers.length), 4)}`,
    sourceWindow: `${categories.length - failedDirectories}/${categories.length} 个目录完成 · 本轮抽查 ${targetOffers.length} 个原商品页`,
    coverage: {
      listedOffers: categoryPayload.reduce((sum, category) => sum + category.offerCount, 0),
      loadedOffers: offers.length,
      uniqueMerchants,
      inStock: offers.filter((offer) => offer.stockStatus === "in_stock").length,
      directVerified: offers.filter((offer) => offer.verification === "direct").length,
      reachable: offers.filter((offer) => offer.verification === "reachable").length,
      domains,
      failedSources: failedDirectories + failedVerifications,
    },
    categories: categoryPayload,
    offers: offers.sort((a, b) => a.categoryId.localeCompare(b.categoryId) || (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity)),
    deltas: makeDeltas(offers, previousMap, now),
    notices: [
      "渠道报价可能包含同一商家多规格、同名报价组或同平台多店铺，不等于相同数量的独立商家。",
      "原页确认代表核验时识别到商品、价格、正库存与下单动作，不构成对第三方履约或售后的担保。",
      `${failedDirectories} 个公开目录、${failedVerifications} 个原商品页本轮访问失败；失败记录不会推断为有货。`,
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`wrote ${offers.length} offers, ${uniqueMerchants} merchants, ${payload.coverage.directVerified} direct verifications\n`);
}

await main();
