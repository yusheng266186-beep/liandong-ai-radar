const DEFAULT_BASE_URL = "https://priceai.cc";
const PAGE_SIZE = 30;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/https?:\/\/\S+/gi, "[source]")
    .split("\n")[0]
    .slice(0, 220);
}

async function fetchPage(productId, offset, options) {
  const { baseUrl, timeoutMs, retries } = options;
  const url = new URL(`/api/products/${encodeURIComponent(productId)}/offers`, baseUrl);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
          "User-Agent": "LiandongMarketRadar/5.0 (+https://github.com/yusheng266186-beep/liandong-ai-radar)",
        },
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= retries) throw new Error(`公开报价接口返回 HTTP ${response.status}`);
        lastError = new Error(`公开报价接口返回 HTTP ${response.status}`);
      } else {
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.offers) || !Number.isFinite(payload.total)) {
          throw new Error("公开报价接口返回了无法识别的数据结构");
        }
        return payload;
      }
    } catch (error) {
      lastError = error;
      if (attempt >= retries || (error instanceof Error && error.name === "AbortError")) throw error;
    } finally {
      clearTimeout(timer);
    }
    await sleep(350 * (attempt + 1));
  }
  throw lastError ?? new Error("公开报价接口请求失败");
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
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run));
  return results;
}

function isAvailable(offer) {
  if (["in_stock", "low_stock"].includes(String(offer.status))) return true;
  return offer.effectiveStatus === "available" && Number(offer.stockCount) > 0;
}

export async function collectPriceAiOffers(productId, {
  baseUrl = DEFAULT_BASE_URL,
  concurrency = 4,
  maxPages = 80,
  reconcilePasses = 1,
  retries = 2,
  timeoutMs = 24_000,
} = {}) {
  try {
    const options = { baseUrl, retries, timeoutMs };
    const first = await fetchPage(productId, 0, options);
    if (first.degraded) throw new Error(first.message || "公开报价接口当前处于降级状态");

    let observedTotal = first.total;
    const naturalPageCount = Math.ceil(observedTotal / PAGE_SIZE);
    const pageCount = Math.min(naturalPageCount, Math.max(1, maxPages));
    const offsets = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => (index + 1) * PAGE_SIZE);
    const rest = await mapLimit(offsets, concurrency, (offset) => fetchPage(productId, offset, options));
    const deduped = new Map();
    let requestCount = 1 + rest.length;
    const ingest = (pages) => {
      for (const page of pages) {
        if (page.degraded) continue;
        observedTotal = Math.max(observedTotal, page.total);
        for (const offer of page.offers) {
          const key = String(offer.id || offer.url || `${offer.sourceId}|${offer.sourceTitle}|${offer.price}`);
          deduped.set(key, offer);
        }
      }
    };
    ingest([first, ...rest]);

    // Live feeds can reorder while pages are fetched concurrently. One bounded
    // reconciliation pass usually recovers rows that moved across page edges.
    // It only runs for near-complete, uncapped reads to avoid amplifying partial jobs.
    for (let pass = 0; pass < reconcilePasses; pass += 1) {
      const completeness = observedTotal ? deduped.size / observedTotal : 1;
      if (deduped.size >= observedTotal || completeness < 0.9 || pageCount < Math.ceil(observedTotal / PAGE_SIZE)) break;
      const pages = await mapLimit(Array.from({ length: pageCount }, (_, index) => index * PAGE_SIZE), concurrency, (offset) => fetchPage(productId, offset, options));
      requestCount += pages.length;
      const before = deduped.size;
      ingest(pages);
      if (deduped.size === before) break;
    }
    const offers = [...deduped.values()];
    return {
      ok: true,
      total: observedTotal,
      inStock: offers.filter(isAvailable).length,
      offers,
      pageCount,
      requestCount,
      generatedAt: first.generatedAt || null,
      degraded: false,
      complete: pageCount >= Math.ceil(observedTotal / PAGE_SIZE) && offers.length >= observedTotal,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      total: 0,
      inStock: 0,
      offers: [],
      pageCount: 0,
      requestCount: 0,
      generatedAt: null,
      degraded: false,
      complete: false,
      error: safeMessage(error),
    };
  }
}

export const priceAiAdapterMeta = {
  id: "priceai-public-json",
  transport: "public_json_feed",
  pageSize: PAGE_SIZE,
};
