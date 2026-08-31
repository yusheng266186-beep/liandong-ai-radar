"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Filter,
  GitFork,
  GitCompareArrows,
  Info,
  Layers3,
  Link2,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingDown,
  X,
  Zap,
} from "lucide-react";

type Verification = "direct" | "reachable" | "indexed" | "failed";
type StockStatus = "in_stock" | "out_of_stock" | "unverified";

type PricePoint = { at: string; priceCny: number };

type CatalogOffer = {
  id: string;
  categoryId: string;
  categoryName: string;
  merchant: string;
  productName: string;
  priceCny: number | null;
  previousPriceCny?: number | null;
  historicalLowCny?: number | null;
  stockStatus: StockStatus;
  stockCount: number | null;
  purchaseUrl: string;
  shopUrl: string | null;
  domain: string;
  updatedAt: string | null;
  checkedAt: string | null;
  verification: Verification;
  verificationReason: string;
  deliveryType: string;
  tags: string[];
  minPurchase: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  priceHistory: PricePoint[];
};

type CatalogCategory = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  tags: string[];
  offerCount: number;
  inStockCount: number;
  verifiedCount: number;
  floorPriceCny: number | null;
};

type RunDelta = {
  id: string;
  type: "price_down" | "price_up" | "restocked" | "sold_out" | "new";
  merchant: string;
  productName: string;
  before: string;
  after: string;
  at: string;
};

type CatalogData = {
  schemaVersion: number;
  generatedAt: string;
  runId: string;
  sourceWindow: string;
  coverage: {
    listedOffers: number;
    loadedOffers: number;
    uniqueMerchants: number;
    inStock: number;
    directVerified: number;
    reachable: number;
    domains: number;
    failedSources: number;
  };
  categories: CatalogCategory[];
  offers: CatalogOffer[];
  deltas: RunDelta[];
  notices: string[];
};

const categoryFallbacks: CatalogCategory[] = [
  { id: "chatgpt-plus", name: "Plus 试用 / 成品号", shortName: "PLUS", description: "日抛、网页号、已接码与未接码成品号", tags: ["成品号", "网页号", "接码"], offerCount: 1108, inStockCount: 219, verifiedCount: 0, floorPriceCny: 10.82 },
  { id: "chatgpt-team-business", name: "Team / Business", shortName: "TEAM", description: "K12、Bug Team、母号、子号与席位邀请", tags: ["席位", "邀请", "K12"], offerCount: 279, inStockCount: 96, verifiedCount: 0, floorPriceCny: 15 },
  { id: "chatgpt-plus-recharge", name: "Plus 正价代充", shortName: "RECHARGE", description: "官方渠道、菲区卡充、iOS 与正规代充", tags: ["代充", "CDK", "质保"], offerCount: 253, inStockCount: 202, verifiedCount: 0, floorPriceCny: 111 },
  { id: "chatgpt-free-account", name: "ChatGPT 普号", shortName: "FREE", description: "Free 白号、普通账号与 2FA 成品号", tags: ["普号", "2FA", "批发"], offerCount: 217, inStockCount: 155, verifiedCount: 0, floorPriceCny: 0.22 },
  { id: "chatgpt-go", name: "ChatGPT Go", shortName: "GO", description: "Go 月卡、年卡、激活码与自助充值", tags: ["月卡", "卡密", "充值"], offerCount: 31, inStockCount: 24, verifiedCount: 0, floorPriceCny: 33 },
  { id: "chatgpt-pro-20x", name: "ChatGPT Pro 20x", shortName: "PRO 20X", description: "高额度、短期速刷、成品号与正规代开", tags: ["高额度", "速刷", "代开"], offerCount: 293, inStockCount: 227, verifiedCount: 0, floorPriceCny: 270 },
  { id: "chatgpt-pro-5x", name: "ChatGPT Pro 5x", shortName: "PRO 5X", description: "Pro 5x 成品、iOS 卡密与官方渠道代充", tags: ["iOS", "卡密", "代充"], offerCount: 229, inStockCount: 182, verifiedCount: 0, floorPriceCny: 590.84 },
  { id: "chatgpt-services", name: "周边与自助服务", shortName: "SERVICES", description: "提链、扫码、自助充值、邀请与额度服务", tags: ["提链", "扫码", "邀请"], offerCount: 47, inStockCount: 33, verifiedCount: 0, floorPriceCny: 1.01 },
];

const emptyData: CatalogData = {
  schemaVersion: 3,
  generatedAt: "",
  runId: "waiting",
  sourceWindow: "等待读取数据快照",
  coverage: {
    listedOffers: categoryFallbacks.reduce((sum, item) => sum + item.offerCount, 0),
    loadedOffers: 0,
    uniqueMerchants: 0,
    inStock: categoryFallbacks.reduce((sum, item) => sum + item.inStockCount, 0),
    directVerified: 0,
    reachable: 0,
    domains: 0,
    failedSources: 0,
  },
  categories: categoryFallbacks,
  offers: [],
  deltas: [],
  notices: ["正在读取公开目录与原商品页核验快照。"],
};

const verificationMeta: Record<Verification, { label: string; detail: string }> = {
  direct: { label: "原页确认", detail: "原商品页同时出现价格、库存与下单信号" },
  reachable: { label: "页面可达", detail: "原商品页可访问，但本轮证据不足以确认可购买" },
  indexed: { label: "目录收录", detail: "公开目录有记录，尚未完成原商品页复核" },
  failed: { label: "本轮失败", detail: "超时、拦截或页面结构变化，不能确认状态" },
};

const planRows = [
  { name: "Plus 成品号", owner: "商家交付账号", duration: "多为短期 / 首登质保", fit: "低成本临时体验", risk: "账号归属、封号与找回风险高" },
  { name: "Plus 正价代充", owner: "使用自己的账号", duration: "通常按月订阅", fit: "希望保留本人账号与历史", risk: "仍需核对渠道、地区与售后" },
  { name: "Business / Team", owner: "加入他人工作区", duration: "取决于席位与母号", fit: "团队协作或高额度需求", risk: "管理员可移除席位，母号失效会波及成员" },
  { name: "ChatGPT Go", owner: "本人账号充值为主", duration: "月卡 / 年卡", fit: "轻量订阅与较低预算", risk: "地区、覆盖续费与卡密规则不同" },
  { name: "Pro 5x / 20x", owner: "本人账号或成品号", duration: "月度 / 短期", fit: "高强度、较高额度使用", risk: "价格高；速刷和异常渠道风险显著" },
];

const quickTags = ["成品号", "代充", "CDK", "自动发货", "质保", "席位", "已接码", "未接码", "iOS"];
const PAGE_SIZE = 24;

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待核验";
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "尚无记录";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "未核验";
  const age = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(age) || age < 0) return "刚刚";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function isFreshDirect(offer: CatalogOffer) {
  if (offer.verification !== "direct" || offer.stockStatus !== "in_stock" || !offer.checkedAt) return false;
  const age = Date.now() - new Date(offer.checkedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= 24 * 60 * 60 * 1000;
}

function cleanDirectUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || /(^|\.)priceai\.cc$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function priceMovement(offer: CatalogOffer) {
  if (offer.priceCny == null || offer.previousPriceCny == null) return null;
  const delta = offer.priceCny - offer.previousPriceCny;
  if (Math.abs(delta) < 0.005) return { kind: "flat", label: "持平" };
  return delta < 0
    ? { kind: "down", label: `降 ${formatMoney(Math.abs(delta))}` }
    : { kind: "up", label: `涨 ${formatMoney(delta)}` };
}

function VerificationPill({ offer }: { offer: CatalogOffer }) {
  return <span className={`verification-pill verification-${offer.verification}`} title={verificationMeta[offer.verification].detail}>{offer.verification === "direct" ? <CheckCircle2 /> : offer.verification === "failed" ? <CircleAlert /> : <Activity />}{verificationMeta[offer.verification].label}</span>;
}

function StockPill({ offer }: { offer: CatalogOffer }) {
  const label = offer.stockStatus === "in_stock" ? `有货${offer.stockCount == null ? "" : ` · ${offer.stockCount}`}` : offer.stockStatus === "out_of_stock" ? "已售罄" : "库存未确认";
  return <span className={`stock-pill stock-${offer.stockStatus}`}><span />{label}</span>;
}

function Sparkline({ points }: { points: PricePoint[] }) {
  const values = points.slice(-16).map((point) => point.priceCny).filter(Number.isFinite);
  if (values.length < 2) return <span className="spark-empty">样本累积中</span>;
  const width = 112;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const line = values.map((value, index) => {
    const x = 3 + (index / (values.length - 1)) * (width - 6);
    const y = 3 + ((max - value) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-label={`最近 ${values.length} 次价格轨迹`}><polyline points={line} /></svg>;
}

function CategoryCard({ category, active, onClick }: { category: CatalogCategory; active: boolean; onClick: () => void }) {
  return <button type="button" className={`category-card ${active ? "active" : ""}`} onClick={onClick}><div className="category-top"><span>{category.shortName}</span><ChevronRight /></div><h3>{category.name}</h3><p>{category.description}</p><div className="category-stats"><strong>{compactNumber(category.offerCount)}</strong><span>条报价</span><i /><strong>{formatMoney(category.floorPriceCny)}</strong><span>当前起</span></div><div className="category-tags">{category.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></button>;
}

function OfferActions({ offer, compact = false }: { offer: CatalogOffer; compact?: boolean }) {
  const purchaseUrl = cleanDirectUrl(offer.purchaseUrl);
  const shopUrl = cleanDirectUrl(offer.shopUrl);
  return <div className={`offer-actions ${compact ? "compact" : ""}`}>{shopUrl && <a className="icon-link" href={shopUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${offer.merchant} 店铺`} title="商家店铺"><Store /></a>}{purchaseUrl ? <a className={`purchase-link ${offer.stockStatus === "out_of_stock" ? "disabled" : ""}`} href={purchaseUrl} target="_blank" rel="noopener noreferrer">{offer.stockStatus === "out_of_stock" ? "查看商品" : "直达购买"}<ExternalLink /></a> : <span className="purchase-link disabled">链接待恢复</span>}</div>;
}

function OfferDetail({ offer, onClose }: { offer: CatalogOffer; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X /></button><div className="detail-kicker"><ShieldCheck /> VERIFICATION RECORD</div><h2 id="detail-title">{offer.merchant}</h2><p className="detail-product">{offer.productName}</p><div className="detail-status"><StockPill offer={offer} /><VerificationPill offer={offer} /></div><div className="detail-metrics"><div><span>当前价格</span><strong>{formatMoney(offer.priceCny)}</strong></div><div><span>历史最低</span><strong>{formatMoney(offer.historicalLowCny)}</strong></div><div><span>最低起购</span><strong>{offer.minPurchase ? `${offer.minPurchase} 件` : "1 件 / 未标注"}</strong></div></div><div className="detail-record"><div><span>核验层级</span><strong>{verificationMeta[offer.verification].label}</strong></div><p>{offer.verificationReason}</p><div className="record-grid"><span>目录更新时间</span><strong>{formatDate(offer.updatedAt)}</strong><span>原页核验时间</span><strong>{formatDate(offer.checkedAt)}</strong><span>交付类型</span><strong>{offer.deliveryType}</strong><span>原站域名</span><strong>{offer.domain}</strong></div></div><div className="risk-note"><CircleAlert /><p>原页有货只代表核验时页面显示可下单，不等于本站为交付、账号归属或售后背书。请勿提交常用账号密码、验证码或恢复邮箱。</p></div><OfferActions offer={offer} /></section></div>;
}

function CompareModal({ offers, onClose, onRemove }: { offers: CatalogOffer[]; onClose: () => void; onRemove: (id: string) => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><div className="compare-modal-head"><div><span>MERCHANT COMPARISON</span><h2 id="compare-title">商家并排对比</h2><p>最多 4 个商品；价格相近时优先看核验等级、交付方式与最低起购量。</p></div><button className="modal-close static" type="button" onClick={onClose} aria-label="关闭"><X /></button></div><div className="compare-grid" style={{ "--compare-count": Math.max(offers.length, 1) } as React.CSSProperties}><div className="compare-label">对比项</div>{offers.map((offer) => <div className="compare-title-cell" key={offer.id}><button type="button" onClick={() => onRemove(offer.id)} aria-label={`移除 ${offer.merchant}`}><X /></button><strong>{offer.merchant}</strong><span>{offer.categoryName}</span></div>)}<div className="compare-label">价格</div>{offers.map((offer) => <div key={offer.id}><b>{formatMoney(offer.priceCny)}</b><small>历史低 {formatMoney(offer.historicalLowCny)}</small></div>)}<div className="compare-label">库存</div>{offers.map((offer) => <div key={offer.id}><StockPill offer={offer} /></div>)}<div className="compare-label">核验</div>{offers.map((offer) => <div key={offer.id}><VerificationPill offer={offer} /><small>{relativeTime(offer.checkedAt)}</small></div>)}<div className="compare-label">交付</div>{offers.map((offer) => <div key={offer.id}><b>{offer.deliveryType}</b><small>{offer.minPurchase ? `${offer.minPurchase} 件起购` : "未标注起购量"}</small></div>)}<div className="compare-label">价格轨迹</div>{offers.map((offer) => <div key={offer.id}><Sparkline points={offer.priceHistory} /></div>)}<div className="compare-label">购买</div>{offers.map((offer) => <div key={offer.id}><OfferActions offer={offer} compact /></div>)}</div></section></div>;
}

function FilterPanel({ category, setCategory, stock, setStock, verification, setVerification, delivery, setDelivery, priceMax, setPriceMax, sort, setSort, activeTags, toggleTag, categories, onReset }: { category: string; setCategory: (value: string) => void; stock: string; setStock: (value: string) => void; verification: string; setVerification: (value: string) => void; delivery: string; setDelivery: (value: string) => void; priceMax: string; setPriceMax: (value: string) => void; sort: string; setSort: (value: string) => void; activeTags: string[]; toggleTag: (tag: string) => void; categories: CatalogCategory[]; onReset: () => void }) {
  return <div className="filter-panel"><div className="filter-grid"><label><span>商品类别</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部类别</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown /></label><label><span>库存状态</span><select value={stock} onChange={(event) => setStock(event.target.value)}><option value="all">全部状态</option><option value="in_stock">目录显示有货</option><option value="out_of_stock">已售罄</option><option value="unverified">库存未确认</option></select><ChevronDown /></label><label><span>核验等级</span><select value={verification} onChange={(event) => setVerification(event.target.value)}><option value="all">全部等级</option><option value="direct">原页确认</option><option value="reachable">页面可达</option><option value="indexed">目录收录</option><option value="failed">本轮失败</option></select><ChevronDown /></label><label><span>交付方式</span><select value={delivery} onChange={(event) => setDelivery(event.target.value)}><option value="all">全部交付</option><option value="成品账号">成品账号</option><option value="卡密 / CDK">卡密 / CDK</option><option value="自助充值">自助充值</option><option value="人工代充">人工代充</option><option value="席位邀请">席位邀请</option><option value="辅助服务">辅助服务</option></select><ChevronDown /></label><label><span>最高价格（¥）</span><input inputMode="decimal" value={priceMax} onChange={(event) => setPriceMax(event.target.value.replace(/[^\d.]/g, ""))} placeholder="不限" /></label><label><span>排序方式</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">可信推荐</option><option value="price_asc">价格从低到高</option><option value="price_desc">价格从高到低</option><option value="updated">最近更新</option><option value="merchant">商家名称</option></select><ChevronDown /></label></div><div className="tag-filter"><span>快速标签</span><div>{quickTags.map((tag) => <button type="button" className={activeTags.includes(tag) ? "active" : ""} key={tag} onClick={() => toggleTag(tag)}>{activeTags.includes(tag) && <Check />}{tag}</button>)}</div><button type="button" className="reset-filter" onClick={onReset}>重置筛选</button></div></div>;
}

export function RadarDashboard() {
  const [data, setData] = useState<CatalogData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("正在读取最新数据快照…");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [verification, setVerification] = useState("all");
  const [delivery, setDelivery] = useState("all");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState("recommended");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detailOffer, setDetailOffer] = useState<CatalogOffer | null>(null);

  const loadCatalog = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    try {
      const base = new URL("data/catalog.json", document.baseURI);
      base.searchParams.set("v", String(Date.now()));
      const response = await fetch(base, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as CatalogData;
      if (!Array.isArray(payload.offers) || !Array.isArray(payload.categories)) throw new Error("invalid payload");
      setData((current) => {
        const same = current.generatedAt && current.generatedAt === payload.generatedAt;
        setMessage(manual ? (same ? "已是当前最新快照" : "已载入新的数据快照") : "数据快照载入完成");
        return payload;
      });
    } catch {
      setMessage("数据文件暂时不可用，已保留公开规模基线");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // The initial static snapshot is an external resource synchronized after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  // Keep pagination valid whenever any filter changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [query, category, stock, verification, delivery, priceMax, sort, activeTags]);
  useEffect(() => {
    if (!mobileFilters && !compareOpen && !detailOffer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mobileFilters, compareOpen, detailOffer]);

  const offers = useMemo(() => {
    const searchTerm = query.trim().toLocaleLowerCase("zh-CN");
    const ceiling = priceMax ? Number(priceMax) : null;
    const rank: Record<Verification, number> = { direct: 0, reachable: 1, indexed: 2, failed: 3 };
    const result = data.offers.filter((offer) => {
      if (category !== "all" && offer.categoryId !== category) return false;
      if (stock !== "all" && offer.stockStatus !== stock) return false;
      if (verification !== "all" && offer.verification !== verification) return false;
      if (delivery !== "all" && offer.deliveryType !== delivery) return false;
      if (ceiling != null && Number.isFinite(ceiling) && (offer.priceCny == null || offer.priceCny > ceiling)) return false;
      if (activeTags.length && !activeTags.every((tag) => offer.tags.includes(tag))) return false;
      if (searchTerm && !`${offer.merchant} ${offer.productName} ${offer.domain} ${offer.tags.join(" ")}`.toLocaleLowerCase("zh-CN").includes(searchTerm)) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === "price_asc") return (a.priceCny ?? Number.POSITIVE_INFINITY) - (b.priceCny ?? Number.POSITIVE_INFINITY);
      if (sort === "price_desc") return (b.priceCny ?? Number.NEGATIVE_INFINITY) - (a.priceCny ?? Number.NEGATIVE_INFINITY);
      if (sort === "updated") return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
      if (sort === "merchant") return a.merchant.localeCompare(b.merchant, "zh-CN");
      const stockScore = (item: CatalogOffer) => item.stockStatus === "in_stock" ? 0 : item.stockStatus === "unverified" ? 1 : 2;
      return rank[a.verification] - rank[b.verification] || stockScore(a) - stockScore(b) || (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity);
    });
  }, [activeTags, category, data.offers, delivery, priceMax, query, sort, stock, verification]);

  const pageCount = Math.max(1, Math.ceil(offers.length / PAGE_SIZE));
  const pageOffers = offers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedOffers = selectedIds.map((id) => data.offers.find((offer) => offer.id === id)).filter((offer): offer is CatalogOffer => Boolean(offer));
  const verifiedPicks = useMemo(() => data.offers.filter(isFreshDirect).sort((a, b) => (b.priceHistory?.length ?? 0) - (a.priceHistory?.length ?? 0) || (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity)).slice(0, 4), [data.offers]);

  const toggleCompare = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) { setMessage("最多同时对比 4 个商品"); return current; }
      return [...current, id];
    });
  };

  const resetFilters = () => { setQuery(""); setCategory("all"); setStock("all"); setVerification("all"); setDelivery("all"); setPriceMax(""); setSort("recommended"); setActiveTags([]); };
  const filterProps = { category, setCategory, stock, setStock, verification, setVerification, delivery, setDelivery, priceMax, setPriceMax, sort, setSort, activeTags, toggleTag: (tag: string) => setActiveTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]), categories: data.categories, onReset: resetFilters };

  return <main>
    <header className="topbar"><a href="#top" className="brand" aria-label="链动小铺首页"><span className="brand-mark"><span /><span /><span /></span><div><strong>链动小铺</strong><small>AI ACCOUNT MARKET RADAR</small></div></a><nav><a href="#catalog">商品目录</a><a href="#changes">变动对比</a><a href="#differences">账号差异</a><a href="#method">核验方法</a></nav><div className="top-actions"><span className="auto-update"><i />每 3 小时自动更新</span><button type="button" className="refresh-button" onClick={() => void loadCatalog(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} />{refreshing ? "读取中" : "读取最新"}</button></div></header>

    <section className="hero" id="top"><div className="hero-grid" /><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-content"><div className="eyebrow"><span><Zap />LIVE CATALOG</span><i />原商家直达 · 分层核验 · 公开数据</div><h1>不绕路，直接找到<br /><em>真正能买</em>的 AI 账号。</h1><p>所有搜索、分类、筛选和商家对比都在本站完成。购买按钮只打开原商家商品页；每条记录明确区分“目录收录”“页面可达”和“原页确认”。</p><div className="hero-actions"><a className="primary-cta" href="#catalog">开始筛选<ArrowDown /></a><a className="secondary-cta" href="#method"><ShieldCheck />查看核验标准</a></div><div className="hero-status"><span><Activity />{message}</span><span><Clock3 />快照 {relativeTime(data.generatedAt)}</span><span><GitFork />公开仓库自动构建</span></div></div><div className="hero-console" aria-label="数据覆盖概览"><div className="console-head"><span>RADAR / COVERAGE</span><i>{data.runId}</i></div><div className="console-radar"><div className="radar-ring ring-1" /><div className="radar-ring ring-2" /><div className="radar-ring ring-3" /><div className="radar-sweep" /><span className="radar-dot dot-1" /><span className="radar-dot dot-2" /><span className="radar-dot dot-3" /></div><div className="console-stats"><div><span>目录报价</span><strong>{compactNumber(data.coverage.listedOffers)}</strong></div><div><span>已载入明细</span><strong>{compactNumber(data.coverage.loadedOffers)}</strong></div><div><span>独立商家</span><strong>{compactNumber(data.coverage.uniqueMerchants)}</strong></div><div><span>原页确认</span><strong>{compactNumber(data.coverage.directVerified)}</strong></div></div><div className="console-foot"><span><i />{data.coverage.domains} 个原站域名</span><span>{data.sourceWindow}</span></div></div></section>

    <section className="metric-strip" aria-label="关键指标"><div><span><Layers3 />目录报价规模</span><strong>{compactNumber(data.coverage.listedOffers)}</strong><small>报价条目不等于独立商家</small></div><div><span><Store />独立商家</span><strong>{compactNumber(data.coverage.uniqueMerchants)}</strong><small>按商家名称去重</small></div><div><span><PackageCheck />目录显示有货</span><strong>{compactNumber(data.coverage.inStock)}</strong><small>仍需查看核验等级</small></div><div><span><BadgeCheck />原页确认</span><strong>{compactNumber(data.coverage.directVerified)}</strong><small>24 小时内核验优先</small></div><div><span><Link2 />原站域名</span><strong>{compactNumber(data.coverage.domains)}</strong><small>购买直达，不经聚合页</small></div></section>

    <section className="section categories-section"><div className="section-heading"><div><span>01 / CATEGORIES</span><h2>覆盖更多账号与服务类别</h2><p>点击任一类别，页面会在站内直接筛选对应商家商品。</p></div><button type="button" onClick={() => setCategory("all")} className="text-button">查看全部 <ChevronRight /></button></div><div className="category-grid"><button type="button" className={`category-card all-category ${category === "all" ? "active" : ""}`} onClick={() => setCategory("all")}><div><Sparkles /><span>ALL PRODUCTS</span></div><h3>全部商品</h3><p>跨类别查看价格、库存、核验等级与交付方式。</p><strong>{compactNumber(data.coverage.listedOffers)}<small> 条报价</small></strong></button>{data.categories.map((item) => <CategoryCard key={item.id} category={item} active={category === item.id} onClick={() => { setCategory(item.id); document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" }); }} />)}</div></section>

    <section className="section picks-section"><div className="section-heading"><div><span>02 / LONG-TERM LOW</span><h2>长期低价优先看“核验深度”</h2><p>只有原商品页确认有货的记录才能进入；历史样本越多，排序越靠前。</p></div><span className="section-badge"><ShieldCheck />拒绝用目录有货冒充已验真</span></div>{verifiedPicks.length ? <div className="picks-grid">{verifiedPicks.map((offer, index) => <article className="pick-card" key={offer.id}><div className="pick-rank">0{index + 1}</div><div className="pick-head"><VerificationPill offer={offer} /><span>{offer.priceHistory.length >= 3 ? `${offer.priceHistory.length} 次可信样本` : "样本累积中"}</span></div><h3>{offer.merchant}</h3><p>{offer.productName}</p><div className="pick-price"><div><span>当前</span><strong>{formatMoney(offer.priceCny)}</strong></div><div><span>历史低</span><b>{formatMoney(offer.historicalLowCny)}</b></div></div><div className="pick-chart"><Sparkline points={offer.priceHistory} /><span>{relativeTime(offer.checkedAt)}</span></div><OfferActions offer={offer} compact /></article>)}</div> : <div className="empty-picks"><LoaderCircle /><div><strong>正在累积原页核验样本</strong><p>自动任务会轮询原商家页面。证据不足时，这里保持为空，不伪造“长期最低”。</p></div></div>}</section>

    <section className="section catalog-section" id="catalog"><div className="section-heading"><div><span>03 / MARKET CATALOG</span><h2>站内筛选，点击直达原商品</h2><p>当前筛选命中 {offers.length.toLocaleString("zh-CN")} 条已加载明细。</p></div><div className="catalog-legend"><span><i className="green" />原页确认</span><span><i className="blue" />页面可达</span><span><i className="gray" />目录收录</span></div></div><div className="catalog-shell"><div className="catalog-toolbar"><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索商家、商品、域名或标签" />{query && <button type="button" onClick={() => setQuery("")} aria-label="清空搜索"><X /></button>}</label><button type="button" className="mobile-filter-button" onClick={() => setMobileFilters(true)}><SlidersHorizontal />筛选{activeTags.length ? ` · ${activeTags.length}` : ""}</button><div className="toolbar-count"><BarChart3 /><span>载入 <strong>{data.coverage.loadedOffers.toLocaleString("zh-CN")}</strong> 条</span><i />显示 <strong>{offers.length.toLocaleString("zh-CN")}</strong> 条</div></div><div className="desktop-filters"><FilterPanel {...filterProps} /></div>{loading ? <div className="catalog-loading"><LoaderCircle className="spin" /><strong>正在载入商家目录</strong><span>读取静态快照，不会把等待时间包装成实时核验。</span></div> : pageOffers.length ? <><div className="offer-table-wrap"><table className="offer-table"><thead><tr><th className="compare-cell"><GitCompareArrows /></th><th>商家 / 商品</th><th>类别</th><th>价格</th><th>库存</th><th>核验</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{pageOffers.map((offer) => { const movement = priceMovement(offer); return <tr key={offer.id} className={isFreshDirect(offer) ? "verified-row" : ""}><td className="compare-cell"><button type="button" className={`compare-check ${selectedIds.includes(offer.id) ? "active" : ""}`} onClick={() => toggleCompare(offer.id)} aria-label={`${selectedIds.includes(offer.id) ? "移出" : "加入"}对比`}>{selectedIds.includes(offer.id) && <Check />}</button></td><td><button type="button" className="merchant-button" onClick={() => setDetailOffer(offer)}><strong>{offer.merchant}</strong><span>{offer.productName}</span><small>{offer.domain} · {offer.deliveryType}</small></button></td><td><span className="category-pill">{offer.categoryName}</span></td><td><div className="price-cell"><strong>{formatMoney(offer.priceCny)}</strong>{movement && <span className={`movement ${movement.kind}`}>{movement.kind === "down" ? <ArrowDown /> : movement.kind === "up" ? <ArrowUp /> : <ArrowDownUp />}{movement.label}</span>}<small>历史低 {formatMoney(offer.historicalLowCny)}</small></div></td><td><StockPill offer={offer} />{offer.minPurchase && offer.minPurchase > 1 ? <small className="min-purchase">{offer.minPurchase} 件起</small> : null}</td><td><VerificationPill offer={offer} /><small className="verification-time">{relativeTime(offer.checkedAt)}</small></td><td><span className="update-time">{formatDate(offer.updatedAt)}</span></td><td><OfferActions offer={offer} compact /></td></tr>; })}</tbody></table></div><div className="offer-mobile-list">{pageOffers.map((offer) => <article className={`offer-mobile-card ${isFreshDirect(offer) ? "verified" : ""}`} key={offer.id}><div className="mobile-card-head"><VerificationPill offer={offer} /><button type="button" className={`compare-check ${selectedIds.includes(offer.id) ? "active" : ""}`} onClick={() => toggleCompare(offer.id)}>{selectedIds.includes(offer.id) ? <><Check />已选</> : <><GitCompareArrows />对比</>}</button></div><button type="button" className="mobile-card-title" onClick={() => setDetailOffer(offer)}><strong>{offer.merchant}</strong><span>{offer.productName}</span></button><div className="mobile-card-price"><strong>{formatMoney(offer.priceCny)}</strong><StockPill offer={offer} /></div><div className="mobile-card-meta"><span>{offer.categoryName}</span><span>{offer.deliveryType}</span><span>{relativeTime(offer.updatedAt)}</span></div><OfferActions offer={offer} /></article>)}</div><div className="pagination"><span>第 {page} / {pageCount} 页</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft />上一页</button><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页<ChevronRight /></button></div></div></> : <div className="no-results"><Search /><strong>没有匹配的商品</strong><p>试着取消部分标签、提高价格上限，或查看其他类别。</p><button type="button" onClick={resetFilters}>清空全部筛选</button></div>}</div></section>

    <section className="section changes-section" id="changes"><div className="section-heading"><div><span>04 / SNAPSHOT DIFF</span><h2>每次更新，明确告诉你变了什么</h2><p>刷新按钮会读取最新快照；价格、库存和新增商品变化由自动任务逐轮对比生成。</p></div><span className="section-badge"><Clock3 />生成于 {formatDate(data.generatedAt)}</span></div><div className="changes-grid"><div className="change-summary"><span>本轮快照</span><strong>{data.runId}</strong><p>{data.sourceWindow}</p><div><span><i className="green" />{data.coverage.directVerified} 条原页确认</span><span><i className="blue" />{data.coverage.reachable} 条页面可达</span><span><i className="red" />{data.coverage.failedSources} 个来源失败</span></div></div><div className="change-list">{data.deltas.length ? data.deltas.slice(0, 8).map((delta) => <article key={delta.id}><span className={`change-icon ${delta.type}`}>{delta.type === "price_down" ? <TrendingDown /> : delta.type === "price_up" ? <ArrowUp /> : delta.type === "restocked" ? <PackageCheck /> : delta.type === "sold_out" ? <CircleAlert /> : <Sparkles />}</span><div><strong>{delta.merchant}</strong><p>{delta.productName}</p></div><div className="change-values"><span>{delta.before}</span><ChevronRight /><strong>{delta.after}</strong><small>{relativeTime(delta.at)}</small></div></article>) : <div className="changes-empty"><Activity /><div><strong>首轮快照尚无可比变化</strong><p>下一次自动更新后会在这里列出价格和库存变化。</p></div></div>}</div></div></section>

    <section className="section differences-section" id="differences"><div className="section-heading"><div><span>05 / PRODUCT DIFFERENCES</span><h2>先分清账号类型，再比较价格</h2><p>“便宜”往往来自不同的归属、交付和质保模型，不能直接横向当成同一种商品。</p></div></div><div className="plan-table-wrap"><table className="plan-table"><thead><tr><th>类型</th><th>账号 / 权益归属</th><th>常见周期</th><th>适合场景</th><th>主要风险</th></tr></thead><tbody>{planRows.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.owner}</td><td>{row.duration}</td><td>{row.fit}</td><td>{row.risk}</td></tr>)}</tbody></table></div><div className="difference-cards">{planRows.map((row) => <article key={row.name}><span>{row.name}</span><div><small>归属</small><strong>{row.owner}</strong></div><div><small>适合</small><strong>{row.fit}</strong></div><div className="risk"><small>风险</small><strong>{row.risk}</strong></div></article>)}</div></section>

    <section className="method-section" id="method"><div className="method-heading"><span>06 / TRUST MODEL</span><h2>“有货”必须说明证据来自哪里。</h2><p>网页无法替你担保商家的履约，但可以把采集、访问与核验层级公开展示。</p></div><div className="method-steps"><article><span>01</span><div><Search /><h3>公开目录发现</h3></div><p>定时读取公开报价页面，提取商家、商品、价格、库存、更新时间以及原商家链接。</p><small>状态：目录收录</small></article><article><span>02</span><div><Link2 /><h3>原商品页访问</h3></div><p>购买链接必须指向原商家域名；聚合页链接、无效协议和不可解析地址会被剔除。</p><small>状态：页面可达</small></article><article><span>03</span><div><BadgeCheck /><h3>购买信号复核</h3></div><p>同一页面需同时出现商品、价格、正库存和下单动作，且没有售罄信号，才标记原页确认。</p><small>状态：原页确认</small></article><article><span>04</span><div><BarChart3 /><h3>历史低价归档</h3></div><p>长期最低只使用原页确认的价格点；核验过期、售罄或证据不足不会继续参与推荐。</p><small>状态：可信样本</small></article></div><div className="method-warning"><Info /><p><strong>技术边界：</strong>登录、验证码、WAF、动态渲染和页面改版都可能导致核验失败。自动化任务不会绕过访问限制，也不会把失败记录推断成有货。</p></div></section>

    <footer><div className="footer-brand"><span className="brand-mark"><span /><span /><span /></span><div><strong>链动小铺</strong><small>OPEN SOURCE MARKET RADAR</small></div></div><p>只做公开信息索引与技术核验，不参与交易，不担保第三方交付。</p><div><a href="https://github.com/yusheng266186-beep/liandong-ai-radar" target="_blank" rel="noopener noreferrer"><GitFork />GitHub</a><span>数据每 3 小时自动更新</span><span>MIT License</span></div></footer>

    {mobileFilters && <div className="mobile-filter-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMobileFilters(false)}><aside role="dialog" aria-modal="true" aria-label="筛选商品"><div className="mobile-filter-head"><div><Filter /><strong>筛选商品</strong></div><button type="button" onClick={() => setMobileFilters(false)} aria-label="关闭"><X /></button></div><FilterPanel {...filterProps} /><button type="button" className="apply-filters" onClick={() => setMobileFilters(false)}>查看 {offers.length.toLocaleString("zh-CN")} 条结果</button></aside></div>}
    {selectedIds.length > 0 && <div className="compare-dock"><div><GitCompareArrows /><span>已选择 <strong>{selectedIds.length}</strong> / 4</span><div className="compare-avatars">{selectedOffers.map((offer) => <i key={offer.id} title={offer.merchant}>{offer.merchant.slice(0, 1)}</i>)}</div></div><div><button type="button" onClick={() => setSelectedIds([])}>清空</button><button type="button" className="compare-now" onClick={() => setCompareOpen(true)} disabled={selectedIds.length < 2}>开始对比<ChevronRight /></button></div></div>}
    {compareOpen && <CompareModal offers={selectedOffers} onClose={() => setCompareOpen(false)} onRemove={(id) => setSelectedIds((current) => current.filter((item) => item !== id))} />}
    {detailOffer && <OfferDetail offer={detailOffer} onClose={() => setDetailOffer(null)} />}
  </main>;
}
