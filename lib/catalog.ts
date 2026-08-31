export type CatalogProductType = "plus" | "business";

export type CatalogCategory = {
  id: string;
  name: string;
  productType: CatalogProductType;
  description: string;
  url: string;
  totalChannels: number;
  inStockChannels: number;
  outOfStockChannels: number;
  loadedOffers: number;
  updatedLabel: string | null;
  status: "live" | "fallback" | "failed";
};

export type CatalogOffer = {
  id: string;
  categoryId: string;
  categoryName: string;
  productType: CatalogProductType;
  merchant: string;
  productName: string;
  priceCny: number | null;
  stockStatus: "in_stock" | "out_of_stock" | "unverified";
  stockCount: number | null;
  updatedAt: string | null;
  purchaseUrl: string;
  shopUrl: string | null;
  sourceUrl: string;
  verification: "upstream_index";
};

export type CatalogPayload = {
  mode: "live" | "partial" | "fallback";
  checkedAt: string | null;
  categories: CatalogCategory[];
  offers: CatalogOffer[];
  coverage: {
    totalChannels: number;
    inStockChannels: number;
    outOfStockChannels: number;
    loadedOffers: number;
    uniqueLoadedMerchants: number;
    liveCategories: number;
    totalCategories: number;
  };
  message?: string;
};

type CategoryDefinition = Pick<CatalogCategory, "id" | "name" | "productType" | "description" | "url"> & {
  fallbackTotal: number;
  fallbackInStock: number;
};

const PRICE_AI_ROOT = "https://priceai.cc";

export const catalogDefinitions: CategoryDefinition[] = [
  { id: "chatgpt-plus", name: "Plus 试用 / 成品号", productType: "plus", description: "日抛、网页号、已/未接码成品号", url: `${PRICE_AI_ROOT}/products/chatgpt-plus`, fallbackTotal: 1101, fallbackInStock: 274 },
  { id: "chatgpt-team-business", name: "Team / Business", productType: "business", description: "K12、Bug Team、母号/子号与邀请", url: `${PRICE_AI_ROOT}/products/chatgpt-team-business`, fallbackTotal: 275, fallbackInStock: 89 },
  { id: "chatgpt-plus-recharge", name: "Plus 正价代充", productType: "plus", description: "官方充值、正价/正规与真实付费", url: `${PRICE_AI_ROOT}/products/chatgpt-plus-recharge`, fallbackTotal: 245, fallbackInStock: 209 },
  { id: "chatgpt-free-account", name: "ChatGPT 普号", productType: "plus", description: "普通账号、Free 号与白号", url: `${PRICE_AI_ROOT}/products/chatgpt-free-account`, fallbackTotal: 218, fallbackInStock: 175 },
  { id: "chatgpt-go", name: "ChatGPT Go", productType: "plus", description: "Go 月卡、年卡、激活码与直充", url: `${PRICE_AI_ROOT}/products/chatgpt-go`, fallbackTotal: 31, fallbackInStock: 24 },
  { id: "chatgpt-pro-20x", name: "ChatGPT Pro 20x", productType: "plus", description: "Pro 高额度、成品号与代开", url: `${PRICE_AI_ROOT}/products/chatgpt-pro-20x`, fallbackTotal: 294, fallbackInStock: 230 },
  { id: "chatgpt-pro-5x", name: "ChatGPT Pro 5x", productType: "plus", description: "Pro 5x 会员、成品号与代开", url: `${PRICE_AI_ROOT}/products/chatgpt-pro-5x`, fallbackTotal: 229, fallbackInStock: 183 },
  { id: "chatgpt-services", name: "ChatGPT 周边服务", productType: "plus", description: "提链、扫码、自助充值与邀请", url: `${PRICE_AI_ROOT}/products/chatgpt-codex-service`, fallbackTotal: 47, fallbackInStock: 33 },
];

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromHtml(value: string) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function safeUrl(value: string | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(decodeEntities(value), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function anchors(rowHtml: string, base: string) {
  return [...rowHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => {
    const href = match[1].match(/href=["']([^"']+)["']/i)?.[1];
    const aria = match[1].match(/aria-label=["']([^"']+)["']/i)?.[1];
    return { url: safeUrl(href, base), text: textFromHtml(match[2]), aria: aria ? decodeEntities(aria) : "" };
  }).filter((item): item is { url: string; text: string; aria: string } => Boolean(item.url));
}

function parseRows(html: string, definition: CategoryDefinition): CatalogOffer[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const offers: CatalogOffer[] = [];

  for (const rowHtml of rows) {
    const rowText = textFromHtml(rowHtml);
    if (!/前往购买|查看/.test(rowText) || !/¥\s*[\d,]+/.test(rowText)) continue;
    const rowAnchors = anchors(rowHtml, definition.url);
    const purchase = rowAnchors.find((item) => /前往购买|查看/.test(item.text) && !/店铺主页/.test(item.aria));
    if (!purchase) continue;
    const shop = rowAnchors.find((item) => /店铺主页/.test(item.aria) || /\/shop\//.test(item.url));
    const ariaMerchant = shop?.aria.match(/前往(.+?)店铺主页/)?.[1];
    const merchant = (ariaMerchant || shop?.text || "未知渠道").trim();
    const stockMatch = rowText.match(/库存\s*([\d,]+)/);
    const priceMatch = rowText.match(/¥\s*([\d,]+(?:\.\d+)?)/);
    const dateMatch = rowText.match(/(20\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
    const titleMatch = rowHtml.match(/(?:title|aria-label)=["']原始商品名[：:]\s*([^"']+)["']/i);
    const productName = titleMatch ? decodeEntities(titleMatch[1]).trim() : rowText
      .replace(/^.*?(?:公开运营\s*\S+\s*)?原始商品名[：:]?\s*/i, "")
      .split(/¥\s*[\d,]+/)[0]
      .replace(/同名报价\s*\d+\s*条\s*$/, "")
      .trim();
    const stockCount = stockMatch ? Number(stockMatch[1].replace(/,/g, "")) : null;
    const explicitOut = /缺货|售罄|查看\s*$/.test(rowText) && !/有货/.test(rowText);
    const stockStatus = explicitOut ? "out_of_stock" : /有货/.test(rowText) ? "in_stock" : "unverified";
    const priceCny = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;
    const updatedAt = dateMatch ? `${dateMatch[1].replace(" ", "T")}:00+08:00` : null;
    const key = `${definition.id}|${merchant}|${purchase.url}|${productName}`;

    offers.push({
      id: `catalog-${hash(key)}`,
      categoryId: definition.id,
      categoryName: definition.name,
      productType: definition.productType,
      merchant,
      productName: productName || definition.name,
      priceCny: Number.isFinite(priceCny) ? priceCny : null,
      stockStatus,
      stockCount: Number.isFinite(stockCount) ? stockCount : null,
      updatedAt,
      purchaseUrl: purchase.url,
      shopUrl: shop?.url ?? null,
      sourceUrl: definition.url,
      verification: "upstream_index",
    });
  }

  return offers;
}

function fallbackCategory(definition: CategoryDefinition, status: CatalogCategory["status"] = "fallback"): CatalogCategory {
  return {
    id: definition.id,
    name: definition.name,
    productType: definition.productType,
    description: definition.description,
    url: definition.url,
    totalChannels: definition.fallbackTotal,
    inStockChannels: definition.fallbackInStock,
    outOfStockChannels: Math.max(0, definition.fallbackTotal - definition.fallbackInStock),
    loadedOffers: 0,
    updatedLabel: null,
    status,
  };
}

async function fetchCategory(definition: CategoryDefinition) {
  try {
    const response = await fetch(`${definition.url}?_radar=${Date.now()}`, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (compatible; LiandongPriceRadar/2.0; public-catalog-index)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const text = textFromHtml(html);
    const countMatch = text.match(/([\d,]+)\s*条报价\s*[·•]\s*([\d,]+)\s*有货/);
    const updatedMatch = text.match(/最近记录\s*([^筛选库存]{1,24})/);
    const offers = parseRows(html, definition);
    if (!countMatch) throw new Error("summary not found");
    const totalChannels = Number(countMatch[1].replace(/,/g, ""));
    const inStockChannels = Number(countMatch[2].replace(/,/g, ""));
    return {
      category: {
        ...fallbackCategory(definition),
        totalChannels,
        inStockChannels,
        outOfStockChannels: Math.max(0, totalChannels - inStockChannels),
        loadedOffers: offers.length,
        updatedLabel: updatedMatch?.[1]?.trim() ?? null,
        status: "live" as const,
      },
      offers,
    };
  } catch {
    return { category: fallbackCategory(definition, "failed"), offers: [] as CatalogOffer[] };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function fallbackCatalog(): CatalogPayload {
  const categories = catalogDefinitions.map((definition) => fallbackCategory(definition));
  return buildPayload(categories, [], null, "fallback", "当前显示最近一次公开规模基线，逐条跳转报价需等待实时目录同步。");
}

function buildPayload(categories: CatalogCategory[], offers: CatalogOffer[], checkedAt: string | null, mode: CatalogPayload["mode"], message?: string): CatalogPayload {
  return {
    mode,
    checkedAt,
    categories,
    offers,
    coverage: {
      totalChannels: categories.reduce((sum, item) => sum + item.totalChannels, 0),
      inStockChannels: categories.reduce((sum, item) => sum + item.inStockChannels, 0),
      outOfStockChannels: categories.reduce((sum, item) => sum + item.outOfStockChannels, 0),
      loadedOffers: offers.length,
      uniqueLoadedMerchants: new Set(offers.map((item) => item.merchant)).size,
      liveCategories: categories.filter((item) => item.status === "live").length,
      totalCategories: categories.length,
    },
    message,
  };
}

export async function refreshCatalog(): Promise<CatalogPayload> {
  const results = await mapWithConcurrency(catalogDefinitions, 3, fetchCategory);
  const categories = results.map((result) => result.category);
  const offers = results.flatMap((result) => result.offers);
  const liveCategories = categories.filter((item) => item.status === "live").length;
  const mode: CatalogPayload["mode"] = liveCategories === categories.length ? "live" : liveCategories ? "partial" : "fallback";
  const message = mode === "live"
    ? undefined
    : liveCategories
      ? `${categories.length - liveCategories} 个品类本轮访问失败，已保留公开规模基线。`
      : "上游目录本轮不可访问，已保留公开规模基线；未返回逐条跳转报价。";
  return buildPayload(categories, offers, new Date().toISOString(), mode, message);
}
