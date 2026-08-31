export type StockStatus = "in_stock" | "out_of_stock" | "unverified";
export type ProductType = "plus" | "business";
export type RiskLevel = "low" | "medium" | "high" | "very_high";
export type Verification = "double_signal" | "official" | "partial" | "failed";

export type Offer = {
  sourceId: string;
  merchant: string;
  productName: string;
  productType: ProductType;
  deliveryType: string;
  price: number | null;
  currency: "CNY" | "USD";
  priceCny: number | null;
  stockStatus: StockStatus;
  stockCount: number | null;
  verification: Verification;
  evidence: string[];
  risk: RiskLevel;
  url: string;
  checkedAt: string | null;
  latencyMs: number | null;
  historicalLowCny: number | null;
  previousPriceCny: number | null;
  isOfficial?: boolean;
};

type Parsed = Pick<Offer, "price" | "stockStatus" | "stockCount" | "verification" | "evidence">;

type SourceDefinition = {
  id: string;
  merchant: string;
  productName: string;
  productType: ProductType;
  deliveryType: string;
  currency: "CNY" | "USD";
  risk: RiskLevel;
  url: string;
  isOfficial?: boolean;
  parse: (text: string) => Parsed;
};

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&dollar;/gi, "$")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function visibleText(html: string) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function around(text: string, needle: string, before = 80, after = 700) {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return "";
  return text.slice(Math.max(0, index - before), Math.min(text.length, index + needle.length + after));
}

function prices(segment: string, symbol: "¥" | "$" = "¥") {
  const escaped = symbol === "$" ? "\\$" : "¥";
  return [...segment.matchAll(new RegExp(`${escaped}\\s*(\\d+(?:\\.\\d{1,2})?)`, "g"))]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function minimum(values: number[]) {
  return values.length ? Math.min(...values) : null;
}

function explicitOutOfStock(segment: string) {
  return /缺货|暂不可购买|out of stock|sold out/i.test(segment);
}

function officialParser(plan: "Plus" | "Business", fixedPrice: number): SourceDefinition["parse"] {
  return (text) => {
    const hasPlan = plan === "Business"
      ? /ChatGPT\s+Business|Business\s+(?:plan|pricing)|Standard seat/i.test(text)
      : /ChatGPT\s+Plus|Plus\s+plan/i.test(text);
    if (!hasPlan) return { price: null, stockStatus: "unverified", stockCount: null, verification: "failed", evidence: ["官方页面可访问，但未识别到对应套餐"] };
    return {
      price: fixedPrice,
      stockStatus: "in_stock",
      stockCount: null,
      verification: "official",
      evidence: ["官方定价页可访问", `识别到 ${plan} 套餐`, "实际可订阅性仍受地区与支付方式影响"],
    };
  };
}

export const sources: SourceDefinition[] = [
  {
    id: "openai-plus",
    merchant: "OpenAI 官方",
    productName: "ChatGPT Plus",
    productType: "plus",
    deliveryType: "本人账号订阅",
    currency: "USD",
    risk: "low",
    url: "https://chatgpt.com/pricing/",
    isOfficial: true,
    parse: officialParser("Plus", 20),
  },
  {
    id: "openai-business",
    merchant: "OpenAI 官方",
    productName: "ChatGPT Business 标准席位（月付）",
    productType: "business",
    deliveryType: "自建工作区 · 至少 2 席",
    currency: "USD",
    risk: "low",
    url: "https://openai.com/business/pricing/",
    isOfficial: true,
    parse: officialParser("Business", 25),
  },
  {
    id: "xiaoheiwan-plus",
    merchant: "小黑丸",
    productName: "ChatGPT Plus 一个月激活码",
    productType: "plus",
    deliveryType: "激活码 / 代订阅",
    currency: "CNY",
    risk: "medium",
    url: "https://upgrade.xiaoheiwan.com/",
    parse: (text) => {
      const segment = around(text, "菲区", 100, 520) || around(text, "ChatGPT Plus 一个月会员自助充值激活码", 80, 520);
      if (!segment) return { price: null, stockStatus: "unverified", stockCount: null, verification: "failed", evidence: ["未识别到目标商品"] };
      const price = minimum(prices(segment));
      const out = explicitOutOfStock(segment);
      const available = /可购买/.test(segment) && /查看详情|购买/.test(segment) && !out;
      return {
        price,
        stockStatus: out ? "out_of_stock" : available ? "in_stock" : "unverified",
        stockCount: null,
        verification: out ? "double_signal" : available && price != null ? "double_signal" : "partial",
        evidence: [price == null ? "价格未识别" : `页面价 ¥${price}`, out ? "页面明确标记缺货" : available ? "“可购买”状态与详情入口同时存在" : "缺少明确库存信号"],
      };
    },
  },
  {
    id: "xiaoheiwan-team",
    merchant: "小黑丸",
    productName: "GPT Team 自动邀请兑换码",
    productType: "business",
    deliveryType: "第三方工作区邀请",
    currency: "CNY",
    risk: "high",
    url: "https://upgrade.xiaoheiwan.com/",
    parse: (text) => {
      const segment = around(text, "GPT team 自动邀请兑换码", 80, 320);
      if (!segment) return { price: null, stockStatus: "unverified", stockCount: null, verification: "failed", evidence: ["未识别到目标商品"] };
      const price = minimum(prices(segment));
      const out = explicitOutOfStock(segment);
      return {
        price,
        stockStatus: out ? "out_of_stock" : /可购买/.test(segment) ? "in_stock" : "unverified",
        stockCount: null,
        verification: out || (/可购买/.test(segment) && price != null) ? "double_signal" : "partial",
        evidence: [price == null ? "价格未识别" : `页面价 ¥${price}`, out ? "页面明确标记缺货" : "页面未给出数字库存"],
      };
    },
  },
  {
    id: "supercool-shared-plus",
    merchant: "超酷 AI",
    productName: "ChatGPT Plus 8 人共享 30 天",
    productType: "plus",
    deliveryType: "多人共享",
    currency: "CNY",
    risk: "very_high",
    url: "https://supercoolaigc.live/",
    parse: (text) => {
      const segment = around(text, "8人共享30天", 120, 420);
      const match = segment.match(/8人共享30天[\s\S]{0,260}?(\d+\.\d{2})[\s\S]{0,160}?库存[：:]?\s*(\d+)/i);
      const price = match ? Number(match[1]) : null;
      const stockCount = match ? Number(match[2]) : null;
      const buy = /下单/.test(segment);
      const inStock = stockCount != null && stockCount > 0 && buy;
      return {
        price,
        stockStatus: stockCount === 0 ? "out_of_stock" : inStock ? "in_stock" : "unverified",
        stockCount,
        verification: inStock || stockCount === 0 ? "double_signal" : segment ? "partial" : "failed",
        evidence: [price == null ? "价格未识别" : `页面价 ¥${price}`, stockCount == null ? "库存数未识别" : `库存 ${stockCount}`, buy ? "下单入口存在" : "下单入口未识别"],
      };
    },
  },
  {
    id: "digitalchose-plus",
    merchant: "数字严选",
    productName: "ChatGPT Plus 成品账号（最低规格）",
    productType: "plus",
    deliveryType: "独享 / 共享多规格",
    currency: "CNY",
    risk: "high",
    url: "https://digitalchose.com/product/chatgpt-plus-%E4%BC%9A%E5%91%98-%E5%8C%85%E6%8D%A2%E5%8C%85%E8%B5%94/",
    parse: (text) => {
      const segment = around(text, "ChatGPT Go / Plus / Pro", 80, 900);
      const range = segment.match(/价格\s*¥\s*(\d+(?:\.\d+)?)\s*[–—-]\s*¥?\s*(\d+(?:\.\d+)?)/);
      const price = range ? Number(range[1]) : null;
      const out = explicitOutOfStock(segment);
      const buy = /立即购买/.test(segment) && /加入购物车/.test(segment);
      return {
        price,
        stockStatus: out ? "out_of_stock" : "unverified",
        stockCount: null,
        verification: out ? "double_signal" : buy && price != null ? "partial" : "failed",
        evidence: [price == null ? "最低规格价未识别" : `多规格起价 ¥${price}`, buy ? "购买入口存在" : "购买入口未识别", out ? "页面明确标记售罄" : "无明确数字库存，不能确认有货"],
      };
    },
  },
  {
    id: "uzaai-plus",
    merchant: "UzaAI",
    productName: "ChatGPT Plus 独享账号",
    productType: "plus",
    deliveryType: "成品独享",
    currency: "CNY",
    risk: "high",
    url: "https://shop.chatgptroot.com/buy/7",
    parse: (text) => {
      const segment = around(text, "ChatGPT Plus独享账号", 40, 600);
      const stockMatch = segment.match(/库存[：:]?\s*(\d+)/);
      const priceMatch = segment.match(/价格[：:]?\s*[￥¥]?\s*(\d+(?:\.\d+)?)/);
      const stockCount = stockMatch ? Number(stockMatch[1]) : null;
      const price = priceMatch ? Number(priceMatch[1]) : null;
      const buy = /下单/.test(segment);
      const inStock = stockCount != null && stockCount > 0 && buy;
      return {
        price,
        stockStatus: stockCount === 0 ? "out_of_stock" : inStock ? "in_stock" : "unverified",
        stockCount,
        verification: inStock || stockCount === 0 ? "double_signal" : segment ? "partial" : "failed",
        evidence: [price == null ? "价格未识别" : `页面价 ¥${price}`, stockCount == null ? "库存数未识别" : `库存 ${stockCount}`, buy ? "下单入口存在" : "下单入口未识别"],
      };
    },
  },
  {
    id: "g2a-business",
    merchant: "G2A",
    productName: "ChatGPT Business（原 Team）1 席 / 月",
    productType: "business",
    deliveryType: "第三方工作区席位",
    currency: "USD",
    risk: "high",
    url: "https://www.g2a.com/chatgpt-team-1-user-1-month-chatgpt-account-global-i10000505514005",
    parse: (text) => {
      const segment = around(text, "This item is out of stock", 120, 220) || around(text, "ChatGPT Team", 80, 500);
      const out = explicitOutOfStock(segment);
      const offerPrice = segment.match(/(\d+(?:\.\d{2})?)\s*USD/i);
      return {
        price: out ? null : offerPrice ? Number(offerPrice[1]) : null,
        stockStatus: out ? "out_of_stock" : "unverified",
        stockCount: out ? 0 : null,
        verification: out ? "double_signal" : segment ? "partial" : "failed",
        evidence: [out ? "商品页明确标记 out of stock" : "未取得明确库存", "相似商品价格不会冒充目标商品报价"],
      };
    },
  },
];

function emptyOffer(source: SourceDefinition, checkedAt: string | null = null): Offer {
  return {
    sourceId: source.id,
    merchant: source.merchant,
    productName: source.productName,
    productType: source.productType,
    deliveryType: source.deliveryType,
    price: null,
    currency: source.currency,
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "failed",
    evidence: ["尚无可用实时快照"],
    risk: source.risk,
    url: source.url,
    checkedAt,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
    isOfficial: source.isOfficial,
  };
}

export function emptyOffers() {
  return sources.map((source) => emptyOffer(source));
}

async function usdToCny() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
      signal: AbortSignal.timeout(6500),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { rates?: { CNY?: number } };
    const rate = payload.rates?.CNY;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

async function fetchSource(source: SourceDefinition, rate: number | null): Promise<Offer> {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const target = new URL(source.url);
    target.searchParams.set("_radar", String(Date.now()));
    const response = await fetch(target, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(10500),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (compatible; LiandongPriceRadar/1.0; public-product-page-check)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const parsed = source.parse(visibleText(html));
    const priceCny = parsed.price == null ? null : source.currency === "CNY" ? parsed.price : rate == null ? null : Number((parsed.price * rate).toFixed(2));
    return {
      ...emptyOffer(source, checkedAt),
      ...parsed,
      priceCny,
      latencyMs: Date.now() - started,
      evidence: [...parsed.evidence, `HTTP ${response.status}`],
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "请求超时" : error instanceof Error ? error.message : "请求失败";
    return {
      ...emptyOffer(source, checkedAt),
      latencyMs: Date.now() - started,
      evidence: [`实时访问失败：${message}`, "本轮不判定为有货"],
    };
  }
}

export async function refreshAllSources() {
  const rate = await usdToCny();
  return Promise.all(sources.map((source) => fetchSource(source, rate)));
}

export function isVerifiedAvailable(offer: Offer) {
  return offer.stockStatus === "in_stock" && (offer.verification === "double_signal" || offer.verification === "official");
}
