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
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Filter,
  GitCompareArrows,
  GitFork,
  Info,
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

type Verification = "direct" | "feed" | "reachable" | "indexed" | "failed";
type StockStatus = "in_stock" | "out_of_stock" | "unverified";
type FreshnessStatus = "live" | "fresh" | "aging" | "stale" | "unknown";

type PricePoint = { at: string; priceCny: number; evidence?: Verification };
type StockPoint = { at: string; stockCount: number; status: StockStatus };

type CatalogOffer = {
  id: string;
  categoryId: string;
  categoryName: string;
  merchant: string;
  productName: string;
  priceCny: number | null;
  previousPriceCny?: number | null;
  historicalLowCny?: number | null;
  trustedLowCny?: number | null;
  stockStatus: StockStatus;
  stockCount: number | null;
  purchaseUrl: string;
  shopUrl: string | null;
  domain: string;
  updatedAt: string | null;
  checkedAt: string | null;
  pageCheckStatus?: string;
  pageCheckReason?: string;
  verification: Verification;
  verificationReason: string;
  stockEvidence?: "original_page" | "channel_feed" | "directory" | "unknown";
  freshnessStatus?: FreshnessStatus;
  availabilityConfidence?: number;
  deliveryType: string;
  tags: string[];
  minPurchase: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  priceHistory: PricePoint[];
  stockHistory?: StockPoint[];
  stockDepletion7d?: number | null;
  salesCount?: number | null;
  salesSource?: "original_page" | null;
  salesCheckedAt?: string | null;
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
  directVerifiedCount?: number;
  feedVerifiedCount?: number;
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
    feedVerified?: number;
    reachable: number;
    freshOffers?: number;
    staleOffers?: number;
    salesObserved?: number;
    domains: number;
    failedSources: number;
    blockedDomains?: number;
  };
  categories: CatalogCategory[];
  offers: CatalogOffer[];
  deltas: RunDelta[];
  notices: string[];
};

type Filters = {
  category: string;
  stock: string;
  verification: string;
  delivery: string;
  freshness: string;
  domain: string;
  priceMin: string;
  priceMax: string;
  stockMin: string;
  demandMin: string;
  sort: string;
  tags: string[];
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
  schemaVersion: 4,
  generatedAt: "",
  runId: "waiting",
  sourceWindow: "等待读取数据快照",
  coverage: {
    listedOffers: categoryFallbacks.reduce((sum, item) => sum + item.offerCount, 0),
    loadedOffers: 0,
    uniqueMerchants: 0,
    inStock: categoryFallbacks.reduce((sum, item) => sum + item.inStockCount, 0),
    directVerified: 0,
    feedVerified: 0,
    reachable: 0,
    freshOffers: 0,
    staleOffers: 0,
    salesObserved: 0,
    domains: 0,
    failedSources: 0,
    blockedDomains: 0,
  },
  categories: categoryFallbacks,
  offers: [],
  deltas: [],
  notices: ["正在读取公开目录与原商品页核验快照。"],
};

const defaultFilters: Filters = {
  category: "all",
  stock: "all",
  verification: "all",
  delivery: "all",
  freshness: "all",
  domain: "all",
  priceMin: "",
  priceMax: "",
  stockMin: "",
  demandMin: "",
  sort: "recommended",
  tags: [],
};

const verificationMeta: Record<Verification, { label: string; detail: string }> = {
  direct: { label: "原页确认", detail: "原商品页同时出现商品、价格、正库存与下单动作" },
  feed: { label: "渠道新鲜", detail: "上游渠道在新鲜窗口内返回明确库存状态" },
  reachable: { label: "页面可达", detail: "原商品页可访问，但证据不足以确认可购买" },
  indexed: { label: "目录收录", detail: "公开目录有记录，库存信号已过新鲜窗口" },
  failed: { label: "复核失败", detail: "超时、拦截或页面结构变化，不能确认原页状态" },
};

const freshnessMeta: Record<FreshnessStatus, { label: string; detail: string }> = {
  live: { label: "1 小时内", detail: "最近 1 小时内更新" },
  fresh: { label: "6 小时内", detail: "最近 6 小时内更新" },
  aging: { label: "24 小时内", detail: "最近 24 小时内更新" },
  stale: { label: "已过期", detail: "更新时间超过 24 小时" },
  unknown: { label: "时间未知", detail: "来源未公开可解析的更新时间" },
};

const planRows = [
  { name: "Plus 成品号", owner: "商家交付账号", duration: "多为短期 / 首登质保", fit: "低成本临时体验", risk: "账号归属、封号与找回风险高" },
  { name: "Plus 正价代充", owner: "使用自己的账号", duration: "通常按月订阅", fit: "希望保留本人账号与历史", risk: "需核对渠道、地区与售后" },
  { name: "Business / Team", owner: "加入他人工作区", duration: "取决于席位与母号", fit: "团队协作或高额度需求", risk: "管理员可移除席位，母号失效会波及成员" },
  { name: "ChatGPT Go", owner: "本人账号充值为主", duration: "月卡 / 年卡", fit: "轻量订阅与较低预算", risk: "地区、续费与卡密规则不同" },
  { name: "Pro 5x / 20x", owner: "本人账号或成品号", duration: "月度 / 短期", fit: "高强度、较高额度使用", risk: "价格高；速刷和异常渠道风险显著" },
];

const quickTags = ["成品号", "代充", "CDK", "自动发货", "质保", "席位", "已接码", "未接码", "iOS", "K12"];
const PAGE_SIZE = 30;

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待核验";
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function compactNumber(value: number | null | undefined) {
  const safe = value ?? 0;
  return new Intl.NumberFormat("zh-CN", { notation: safe >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(safe);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "时间未知";
  const age = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(age) || age < 0) return "刚刚";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function freshnessOf(offer: CatalogOffer): FreshnessStatus {
  if (offer.freshnessStatus) return offer.freshnessStatus;
  const evidenceAt = offer.verification === "direct" ? offer.checkedAt : offer.updatedAt;
  if (!evidenceAt) return "unknown";
  const hours = (Date.now() - new Date(evidenceAt).getTime()) / 3_600_000;
  if (hours <= 1) return "live";
  if (hours <= 6) return "fresh";
  if (hours <= 24) return "aging";
  return "stale";
}

function isTrustedAvailable(offer: CatalogOffer) {
  return offer.stockStatus === "in_stock" && ["direct", "feed"].includes(offer.verification) && ["live", "fresh", "aging"].includes(freshnessOf(offer));
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

function demandValue(offer: CatalogOffer) {
  return offer.salesCount ?? offer.stockDepletion7d ?? null;
}

function priceDrop(offer: CatalogOffer) {
  if (offer.priceCny == null || offer.previousPriceCny == null) return 0;
  return Math.max(0, offer.previousPriceCny - offer.priceCny);
}

function priceMovement(offer: CatalogOffer) {
  if (offer.priceCny == null || offer.previousPriceCny == null) return null;
  const delta = offer.priceCny - offer.previousPriceCny;
  if (Math.abs(delta) < 0.005) return { kind: "flat", label: "持平" };
  return delta < 0
    ? { kind: "down", label: `降 ${formatMoney(Math.abs(delta))}` }
    : { kind: "up", label: `涨 ${formatMoney(delta)}` };
}

function snapshotState(generatedAt: string) {
  if (!generatedAt) return { level: "loading", label: "正在载入" };
  const hours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  if (hours <= 2) return { level: "healthy", label: "数据在线" };
  if (hours <= 6) return { level: "delayed", label: "更新延迟" };
  return { level: "stale", label: "快照过期" };
}

function VerificationPill({ offer }: { offer: CatalogOffer }) {
  const meta = verificationMeta[offer.verification] ?? verificationMeta.indexed;
  return (
    <span className={`verification-pill verification-${offer.verification}`} title={meta.detail}>
      {offer.verification === "direct" ? <CheckCircle2 /> : offer.verification === "failed" ? <CircleAlert /> : offer.verification === "feed" ? <Zap /> : <Activity />}
      {meta.label}
    </span>
  );
}

function FreshnessPill({ offer }: { offer: CatalogOffer }) {
  const freshness = freshnessOf(offer);
  const meta = freshnessMeta[freshness];
  const evidenceAt = offer.verification === "direct" ? offer.checkedAt : offer.updatedAt;
  return <span className={`freshness-pill freshness-${freshness}`} title={meta.detail}><Clock3 />{relativeTime(evidenceAt)}</span>;
}

function StockPill({ offer }: { offer: CatalogOffer }) {
  const label = offer.stockStatus === "in_stock"
    ? `有货${offer.stockCount == null ? "" : ` · ${offer.stockCount}`}`
    : offer.stockStatus === "out_of_stock" ? "已售罄" : "库存未确认";
  return <span className={`stock-pill stock-${offer.stockStatus}`}><i />{label}</span>;
}

function DemandMetric({ offer }: { offer: CatalogOffer }) {
  if (offer.salesCount != null) return <div className="demand-metric"><strong>{compactNumber(offer.salesCount)}</strong><span>原页已售</span></div>;
  if (offer.stockDepletion7d != null) return <div className="demand-metric estimated"><strong>{compactNumber(offer.stockDepletion7d)}</strong><span>7 日库存消耗估算</span></div>;
  return <div className="demand-metric empty"><strong>—</strong><span>暂无公开销量</span></div>;
}

function Sparkline({ points }: { points: PricePoint[] }) {
  const values = points.slice(-18).map((point) => point.priceCny).filter(Number.isFinite);
  if (values.length < 2) return <span className="spark-empty">等待下一轮样本</span>;
  const width = 126;
  const height = 38;
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

function OfferActions({ offer, compact = false }: { offer: CatalogOffer; compact?: boolean }) {
  const purchaseUrl = cleanDirectUrl(offer.purchaseUrl);
  const shopUrl = cleanDirectUrl(offer.shopUrl);
  return (
    <div className={`offer-actions ${compact ? "compact" : ""}`}>
      {shopUrl && <a className="shop-link" href={shopUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${offer.merchant} 店铺`}><Store />店铺</a>}
      {purchaseUrl ? <a className={`purchase-link ${offer.stockStatus === "out_of_stock" ? "muted" : ""}`} href={purchaseUrl} target="_blank" rel="noopener noreferrer">{offer.stockStatus === "out_of_stock" ? "查看原页" : "直达购买"}<ExternalLink /></a> : <span className="purchase-link disabled">链接待恢复</span>}
    </div>
  );
}

function FilterPanel({ filters, categories, domains, onChange, onToggleTag, onReset }: {
  filters: Filters;
  categories: CatalogCategory[];
  domains: string[];
  onChange: (key: keyof Filters, value: string) => void;
  onToggleTag: (tag: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <label><span>商品类别</span><select value={filters.category} onChange={(event) => onChange("category", event.target.value)}><option value="all">全部类别</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>库存状态</span><select value={filters.stock} onChange={(event) => onChange("stock", event.target.value)}><option value="all">全部状态</option><option value="in_stock">显示有货</option><option value="out_of_stock">已售罄</option><option value="unverified">库存未确认</option></select></label>
        <label><span>证据等级</span><select value={filters.verification} onChange={(event) => onChange("verification", event.target.value)}><option value="all">全部证据</option><option value="direct">原页确认</option><option value="feed">渠道新鲜</option><option value="reachable">页面可达</option><option value="indexed">目录收录</option><option value="failed">复核失败</option></select></label>
        <label><span>更新新鲜度</span><select value={filters.freshness} onChange={(event) => onChange("freshness", event.target.value)}><option value="all">全部时间</option><option value="live">1 小时内</option><option value="fresh">6 小时内</option><option value="aging">24 小时内</option><option value="stale">已过期</option><option value="unknown">时间未知</option></select></label>
        <label><span>交付方式</span><select value={filters.delivery} onChange={(event) => onChange("delivery", event.target.value)}><option value="all">全部交付</option><option value="成品账号">成品账号</option><option value="卡密 / CDK">卡密 / CDK</option><option value="自助充值">自助充值</option><option value="人工代充">人工代充</option><option value="席位邀请">席位邀请</option><option value="辅助服务">辅助服务</option><option value="其他数字交付">其他数字交付</option></select></label>
        <label><span>渠道域名</span><select value={filters.domain} onChange={(event) => onChange("domain", event.target.value)}><option value="all">全部渠道</option>{domains.map((domain) => <option value={domain} key={domain}>{domain}</option>)}</select></label>
        <label><span>最低价格</span><input inputMode="decimal" value={filters.priceMin} onChange={(event) => onChange("priceMin", event.target.value.replace(/[^\d.]/g, ""))} placeholder="¥ 不限" /></label>
        <label><span>最高价格</span><input inputMode="decimal" value={filters.priceMax} onChange={(event) => onChange("priceMax", event.target.value.replace(/[^\d.]/g, ""))} placeholder="¥ 不限" /></label>
        <label><span>最低库存</span><input inputMode="numeric" value={filters.stockMin} onChange={(event) => onChange("stockMin", event.target.value.replace(/\D/g, ""))} placeholder="不限" /></label>
        <label><span>最低销量 / 消耗</span><input inputMode="numeric" value={filters.demandMin} onChange={(event) => onChange("demandMin", event.target.value.replace(/\D/g, ""))} placeholder="不限" /></label>
      </div>
      <div className="tag-filter">
        <span>快速标签</span>
        <div>{quickTags.map((tag) => <button type="button" className={filters.tags.includes(tag) ? "active" : ""} key={tag} onClick={() => onToggleTag(tag)}>{filters.tags.includes(tag) && <Check />}{tag}</button>)}</div>
        <button type="button" className="reset-filter" onClick={onReset}><X />清空筛选</button>
      </div>
    </div>
  );
}

function OfferDetail({ offer, onClose }: { offer: CatalogOffer; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="modal-header"><div><span><ShieldCheck />证据记录</span><h2 id="detail-title">{offer.merchant}</h2></div><button type="button" onClick={onClose} aria-label="关闭详情"><X /></button></header>
        <p className="detail-product">{offer.productName}</p>
        <div className="detail-pills"><StockPill offer={offer} /><VerificationPill offer={offer} /><FreshnessPill offer={offer} /></div>
        <div className="detail-metrics">
          <div><span>当前价格</span><strong>{formatMoney(offer.priceCny)}</strong></div>
          <div><span>可信历史低</span><strong>{formatMoney(offer.trustedLowCny)}</strong></div>
          <div><span>库存</span><strong>{offer.stockCount == null ? "未公开" : offer.stockCount.toLocaleString("zh-CN")}</strong></div>
          <div><span>{offer.salesCount != null ? "原页销量" : "7 日库存消耗"}</span><strong>{compactNumber(demandValue(offer))}</strong></div>
        </div>
        <div className="detail-record">
          <div><span>当前证据</span><strong>{verificationMeta[offer.verification].label} · 可信度 {offer.availabilityConfidence ?? "—"}</strong></div>
          <p>{offer.verificationReason}</p>
          {offer.pageCheckReason && <p className="page-check-note"><b>原页复核：</b>{offer.pageCheckReason}</p>}
          <dl>
            <div><dt>渠道更新时间</dt><dd>{formatDate(offer.updatedAt)}</dd></div>
            <div><dt>原页复核时间</dt><dd>{formatDate(offer.checkedAt)}</dd></div>
            <div><dt>交付类型</dt><dd>{offer.deliveryType}</dd></div>
            <div><dt>最低起购</dt><dd>{offer.minPurchase ? `${offer.minPurchase} 件` : "未标注"}</dd></div>
            <div><dt>原站域名</dt><dd>{offer.domain}</dd></div>
            <div><dt>历史样本</dt><dd>{offer.priceHistory.length} 次</dd></div>
          </dl>
        </div>
        <div className="risk-note"><CircleAlert /><p>“有货”是核验时的页面或渠道状态，不是履约担保。第三方账号、代充和共享席位可能存在找回、封禁、付款及服务条款风险。</p></div>
        <OfferActions offer={offer} />
      </section>
    </div>
  );
}

function CompareModal({ offers, onClose, onRemove }: { offers: CatalogOffer[]; onClose: () => void; onRemove: (id: string) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title">
        <header className="modal-header"><div><span><GitCompareArrows />商品对比</span><h2 id="compare-title">把证据和价格放在同一张表</h2></div><button type="button" onClick={onClose} aria-label="关闭对比"><X /></button></header>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead><tr><th>对比项</th>{offers.map((offer) => <th key={offer.id}><button type="button" onClick={() => onRemove(offer.id)} aria-label={`移除 ${offer.merchant}`}><X /></button><strong>{offer.merchant}</strong><span>{offer.categoryName}</span></th>)}</tr></thead>
            <tbody>
              <tr><th>当前价格</th>{offers.map((offer) => <td key={offer.id}><b>{formatMoney(offer.priceCny)}</b><small>可信低 {formatMoney(offer.trustedLowCny)}</small></td>)}</tr>
              <tr><th>库存</th>{offers.map((offer) => <td key={offer.id}><StockPill offer={offer} /></td>)}</tr>
              <tr><th>证据</th>{offers.map((offer) => <td key={offer.id}><VerificationPill offer={offer} /><small>可信度 {offer.availabilityConfidence ?? "—"}</small></td>)}</tr>
              <tr><th>新鲜度</th>{offers.map((offer) => <td key={offer.id}><FreshnessPill offer={offer} /></td>)}</tr>
              <tr><th>销量 / 消耗</th>{offers.map((offer) => <td key={offer.id}><DemandMetric offer={offer} /></td>)}</tr>
              <tr><th>交付</th>{offers.map((offer) => <td key={offer.id}><b>{offer.deliveryType}</b><small>{offer.minPurchase ? `${offer.minPurchase} 件起购` : "未标注起购量"}</small></td>)}</tr>
              <tr><th>价格轨迹</th>{offers.map((offer) => <td key={offer.id}><Sparkline points={offer.priceHistory} /></td>)}</tr>
              <tr><th>购买</th>{offers.map((offer) => <td key={offer.id}><OfferActions offer={offer} compact /></td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function RadarDashboard() {
  const [data, setData] = useState<CatalogData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("正在读取最新数据快照…");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detailOffer, setDetailOffer] = useState<CatalogOffer | null>(null);

  const loadCatalog = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    try {
      const url = new URL("data/catalog.json", document.baseURI);
      url.searchParams.set("v", String(Date.now()));
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as CatalogData;
      if (!Array.isArray(payload.offers) || !Array.isArray(payload.categories)) throw new Error("invalid payload");
      setData((current) => {
        const same = Boolean(current.generatedAt) && current.generatedAt === payload.generatedAt;
        setMessage(manual ? (same ? "当前已是最新部署快照" : "已同步新的部署快照") : "最新快照已载入");
        return payload;
      });
    } catch {
      setMessage("快照暂时不可用，保留上一次已载入数据");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCatalog());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCatalog]);
  useEffect(() => {
    const timer = window.setInterval(() => void loadCatalog(false), 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void loadCatalog(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadCatalog]);
  useEffect(() => {
    if (!mobileFilters && !compareOpen && !detailOffer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileFilters(false);
      setCompareOpen(false);
      setDetailOffer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKeyDown); };
  }, [mobileFilters, compareOpen, detailOffer]);

  const domains = useMemo(() => [...new Set(data.offers.map((offer) => offer.domain).filter((domain) => domain && domain !== "unknown"))].sort((a, b) => a.localeCompare(b)), [data.offers]);

  const offers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("zh-CN");
    const minPrice = filters.priceMin ? Number(filters.priceMin) : null;
    const maxPrice = filters.priceMax ? Number(filters.priceMax) : null;
    const minStock = filters.stockMin ? Number(filters.stockMin) : null;
    const minDemand = filters.demandMin ? Number(filters.demandMin) : null;
    const verificationRank: Record<Verification, number> = { direct: 0, feed: 1, reachable: 2, indexed: 3, failed: 4 };
    const freshnessRank: Record<FreshnessStatus, number> = { live: 0, fresh: 1, aging: 2, stale: 3, unknown: 4 };
    const filtered = data.offers.filter((offer) => {
      if (filters.category !== "all" && offer.categoryId !== filters.category) return false;
      if (filters.stock !== "all" && offer.stockStatus !== filters.stock) return false;
      if (filters.verification !== "all" && offer.verification !== filters.verification) return false;
      if (filters.delivery !== "all" && offer.deliveryType !== filters.delivery) return false;
      if (filters.freshness !== "all" && freshnessOf(offer) !== filters.freshness) return false;
      if (filters.domain !== "all" && offer.domain !== filters.domain) return false;
      if (minPrice != null && (offer.priceCny == null || offer.priceCny < minPrice)) return false;
      if (maxPrice != null && (offer.priceCny == null || offer.priceCny > maxPrice)) return false;
      if (minStock != null && (offer.stockCount == null || offer.stockCount < minStock)) return false;
      const demand = demandValue(offer);
      if (minDemand != null && (demand == null || demand < minDemand)) return false;
      if (filters.tags.length && !filters.tags.every((tag) => offer.tags.includes(tag))) return false;
      if (term && !`${offer.merchant} ${offer.productName} ${offer.domain} ${offer.deliveryType} ${offer.tags.join(" ")}`.toLocaleLowerCase("zh-CN").includes(term)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (filters.sort === "price_asc") return (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity);
      if (filters.sort === "price_desc") return (b.priceCny ?? -Infinity) - (a.priceCny ?? -Infinity);
      if (filters.sort === "sales_desc") return (b.salesCount ?? -1) - (a.salesCount ?? -1);
      if (filters.sort === "depletion_desc") return (b.stockDepletion7d ?? -1) - (a.stockDepletion7d ?? -1);
      if (filters.sort === "stock_desc") return (b.stockCount ?? -1) - (a.stockCount ?? -1);
      if (filters.sort === "stock_asc") return (a.stockCount ?? Infinity) - (b.stockCount ?? Infinity);
      if (filters.sort === "freshness") return freshnessRank[freshnessOf(a)] - freshnessRank[freshnessOf(b)] || new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
      if (filters.sort === "price_drop") return priceDrop(b) - priceDrop(a);
      if (filters.sort === "long_term_low") {
        const aDistance = a.priceCny != null && a.trustedLowCny != null ? a.priceCny / Math.max(a.trustedLowCny, 0.01) : Infinity;
        const bDistance = b.priceCny != null && b.trustedLowCny != null ? b.priceCny / Math.max(b.trustedLowCny, 0.01) : Infinity;
        return aDistance - bDistance || (b.priceHistory?.length ?? 0) - (a.priceHistory?.length ?? 0);
      }
      if (filters.sort === "updated") return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
      if (filters.sort === "merchant") return a.merchant.localeCompare(b.merchant, "zh-CN");
      const stockRank = (item: CatalogOffer) => item.stockStatus === "in_stock" ? 0 : item.stockStatus === "unverified" ? 1 : 2;
      return verificationRank[a.verification] - verificationRank[b.verification] || freshnessRank[freshnessOf(a)] - freshnessRank[freshnessOf(b)] || stockRank(a) - stockRank(b) || (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity);
    });
  }, [data.offers, filters, query]);

  const pageCount = Math.max(1, Math.ceil(offers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOffers = offers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectedOffers = selectedIds.map((id) => data.offers.find((offer) => offer.id === id)).filter((offer): offer is CatalogOffer => Boolean(offer));
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== "sort" && (Array.isArray(value) ? value.length > 0 : value !== "all" && value !== "")).length;
  const status = snapshotState(data.generatedAt);
  const trustedAvailable = data.offers.filter(isTrustedAvailable).length;
  const lowPicks = useMemo(() => data.offers
    .filter((offer) => isTrustedAvailable(offer) && offer.priceCny != null && offer.trustedLowCny != null)
    .sort((a, b) => {
      const aDistance = (a.priceCny ?? Infinity) / Math.max(a.trustedLowCny ?? 0.01, 0.01);
      const bDistance = (b.priceCny ?? Infinity) / Math.max(b.trustedLowCny ?? 0.01, 0.01);
      return aDistance - bDistance || (b.priceHistory?.length ?? 0) - (a.priceHistory?.length ?? 0) || (a.priceCny ?? Infinity) - (b.priceCny ?? Infinity);
    }).slice(0, 5), [data.offers]);

  const updateQuery = (value: string) => { setQuery(value); setPage(1); };
  const setFilter = (key: keyof Filters, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const toggleTag = (tag: string) => { setFilters((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] })); setPage(1); };
  const resetFilters = () => { setQuery(""); setFilters(defaultFilters); setPage(1); };
  const toggleCompare = (id: string) => setSelectedIds((current) => {
    if (current.includes(id)) return current.filter((item) => item !== id);
    if (current.length >= 4) { setMessage("最多同时对比 4 个商品"); return current; }
    return [...current, id];
  });
  const filterProps = { filters, categories: data.categories, domains, onChange: setFilter, onToggleTag: toggleTag, onReset: resetFilters };

  return (
    <main>
      <header className="topbar">
        <a href="#top" className="brand" aria-label="链动小铺首页"><span className="brand-mark"><span /><span /><span /></span><div><strong>链动小铺</strong><small>MARKET INTELLIGENCE</small></div></a>
        <nav aria-label="主导航"><a href="#catalog">实时目录</a><a href="#low-price">长期低价</a><a href="#changes">变动</a><a href="#method">证据模型</a></nav>
        <div className="top-actions"><span className={`system-state state-${status.level}`}><i />{status.label}</span><button type="button" className="refresh-button" onClick={() => void loadCatalog(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} />{refreshing ? "同步中" : "同步快照"}</button></div>
      </header>

      <section className="command-hero" id="top">
        <div className="hero-grid" />
        <div className="hero-copy">
          <div className="eyebrow"><span><Zap />30 MIN REFRESH</span><i />原商家直达 · 多级库存证据</div>
          <h1>AI 账号行情台</h1>
          <p>把数千条公开报价压缩成可筛选、可比较、可追溯的购买决策。先看库存证据，再看价格，不用跳回聚合页。</p>
          <a className="hero-jump" href="#catalog">立即筛选 {compactNumber(data.coverage.loadedOffers)} 条商品<ChevronRight /></a>
          <div className="hero-meta" aria-live="polite"><span><Activity />{message}</span><span><Clock3 />生成于 {relativeTime(data.generatedAt)}</span></div>
        </div>
        <div className="health-panel" aria-label="数据健康状态">
          <header><div><span>DATA HEALTH</span><strong>{status.label}</strong></div><small>{data.runId}</small></header>
          <div className="health-grid">
            <div><span>公开报价规模</span><strong>{compactNumber(data.coverage.listedOffers)}</strong><small>发现层总量</small></div>
            <div><span>站内可点击</span><strong>{compactNumber(data.coverage.loadedOffers)}</strong><small>{data.coverage.uniqueMerchants} 个商家</small></div>
            <div><span>可信有货</span><strong>{compactNumber(trustedAvailable)}</strong><small>原页 + 新鲜渠道</small></div>
            <div><span>渠道覆盖</span><strong>{compactNumber(data.coverage.domains)}</strong><small>原站域名</small></div>
          </div>
          <footer><span><i />每 30 分钟尝试全量刷新</span><span>页面每 5 分钟自动同步</span></footer>
        </div>
      </section>

      <section className="evidence-strip" aria-label="证据层概览">
        <div><BadgeCheck /><span><b>{compactNumber(data.coverage.directVerified)}</b> 原页确认</span><small>商品、价格、库存、下单动作同页成立</small></div>
        <div><Zap /><span><b>{compactNumber(data.coverage.feedVerified)}</b> 渠道新鲜</span><small>6 小时内上游库存信号</small></div>
        <div><PackageCheck /><span><b>{compactNumber(data.coverage.inStock)}</b> 目录有货</span><small>不自动等同于原页确认</small></div>
        <div><BarChart3 /><span><b>{compactNumber(data.coverage.salesObserved)}</b> 公开销量</span><small>仅记录原页明确披露</small></div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="catalog-heading">
          <div><span>LIVE MARKET</span><h2>实时商品目录</h2><p>已载入 {data.coverage.loadedOffers.toLocaleString("zh-CN")} 条商品，当前筛选命中 {offers.length.toLocaleString("zh-CN")} 条。</p></div>
          <div className="legend"><span><i className="legend-direct" />原页确认</span><span><i className="legend-feed" />渠道新鲜</span><span><i className="legend-stale" />过期 / 未确认</span></div>
        </div>

        <div className="category-rail" aria-label="商品类别">
          <button type="button" className={filters.category === "all" ? "active" : ""} onClick={() => setFilter("category", "all")}><span>全部</span><strong>{compactNumber(data.coverage.loadedOffers)}</strong></button>
          {data.categories.map((category) => <button type="button" className={filters.category === category.id ? "active" : ""} key={category.id} onClick={() => setFilter("category", category.id)}><span>{category.shortName}</span><strong>{compactNumber(category.offerCount)}</strong><small>{formatMoney(category.floorPriceCny)} 起</small></button>)}
        </div>

        <div className="catalog-shell">
          <div className="catalog-toolbar">
            <label className="search-box"><Search /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="搜索商家、商品、域名、交付或标签" aria-label="搜索商品" />{query && <button type="button" onClick={() => updateQuery("")} aria-label="清空搜索"><X /></button>}</label>
            <label className="sort-control"><span><ArrowDownUp />排序</span><select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)} aria-label="排序方式"><option value="recommended">可信推荐</option><option value="price_asc">价格：低 → 高</option><option value="price_desc">价格：高 → 低</option><option value="sales_desc">原页公开销量：高 → 低</option><option value="depletion_desc">7 日库存消耗估算：高 → 低</option><option value="stock_desc">库存：高 → 低</option><option value="stock_asc">库存：低 → 高</option><option value="freshness">新鲜度：新 → 旧</option><option value="price_drop">降价幅度：高 → 低</option><option value="long_term_low">长期低价优先</option><option value="updated">更新时间：新 → 旧</option><option value="merchant">商家名称 A → Z</option></select></label>
            <button type="button" className="mobile-filter-button" onClick={() => setMobileFilters(true)}><SlidersHorizontal />筛选{activeFilterCount ? <b>{activeFilterCount}</b> : null}</button>
          </div>
          <div className="desktop-filters"><FilterPanel {...filterProps} /></div>
          <div className="result-bar"><span><Filter />当前显示 <b>{offers.length.toLocaleString("zh-CN")}</b> 条</span><span>可信有货 <b>{offers.filter(isTrustedAvailable).length.toLocaleString("zh-CN")}</b> 条</span><span>有销量 / 消耗数据 <b>{offers.filter((offer) => demandValue(offer) != null).length.toLocaleString("zh-CN")}</b> 条</span>{activeFilterCount > 0 || query ? <button type="button" onClick={resetFilters}><X />清空条件</button> : null}</div>

          {loading ? <div className="catalog-loading"><LoaderCircle className="spin" /><strong>正在载入商品目录</strong><span>读取最新部署快照。</span></div> : pageOffers.length ? (
            <>
              <div className="offer-table-wrap">
                <table className="offer-table">
                  <thead><tr><th className="compare-cell">对比</th><th>商家 / 商品</th><th>证据</th><th>价格</th><th>销量 / 消耗</th><th>库存</th><th>新鲜度</th><th>操作</th></tr></thead>
                  <tbody>{pageOffers.map((offer) => {
                    const movement = priceMovement(offer);
                    return (
                      <tr key={offer.id} className={isTrustedAvailable(offer) ? "trusted-row" : ""}>
                        <td className="compare-cell"><button type="button" className={`compare-check ${selectedIds.includes(offer.id) ? "active" : ""}`} onClick={() => toggleCompare(offer.id)} aria-label={`${selectedIds.includes(offer.id) ? "移出" : "加入"}对比`}>{selectedIds.includes(offer.id) && <Check />}</button></td>
                        <td><button type="button" className="merchant-button" onClick={() => setDetailOffer(offer)}><strong>{offer.merchant}</strong><span>{offer.productName}</span><small>{offer.categoryName} · {offer.deliveryType} · {offer.domain}</small></button></td>
                        <td><VerificationPill offer={offer} /><small className="confidence">可信度 {offer.availabilityConfidence ?? "—"}</small></td>
                        <td><div className="price-cell"><strong>{formatMoney(offer.priceCny)}</strong>{movement && <span className={`movement ${movement.kind}`}>{movement.kind === "down" ? <ArrowDown /> : movement.kind === "up" ? <ArrowUp /> : <ArrowDownUp />}{movement.label}</span>}<small>可信低 {formatMoney(offer.trustedLowCny)}</small></div></td>
                        <td><DemandMetric offer={offer} /></td>
                        <td><StockPill offer={offer} />{offer.minPurchase && offer.minPurchase > 1 ? <small className="min-purchase">{offer.minPurchase} 件起</small> : null}</td>
                        <td><FreshnessPill offer={offer} /><small className="absolute-time">{formatDate(offer.verification === "direct" ? offer.checkedAt : offer.updatedAt)}</small></td>
                        <td><OfferActions offer={offer} compact /></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div className="offer-mobile-list">{pageOffers.map((offer) => {
                const movement = priceMovement(offer);
                return (
                  <article className={`offer-mobile-card ${isTrustedAvailable(offer) ? "trusted" : ""}`} key={offer.id}>
                    <div className="mobile-card-head"><div><VerificationPill offer={offer} /><FreshnessPill offer={offer} /></div><button type="button" className={`compare-check ${selectedIds.includes(offer.id) ? "active" : ""}`} onClick={() => toggleCompare(offer.id)}>{selectedIds.includes(offer.id) ? <><Check />已选</> : <><GitCompareArrows />对比</>}</button></div>
                    <button type="button" className="mobile-card-title" onClick={() => setDetailOffer(offer)}><strong>{offer.merchant}</strong><span>{offer.productName}</span><small>{offer.categoryName} · {offer.domain}</small></button>
                    <div className="mobile-card-market"><div><span>价格</span><strong>{formatMoney(offer.priceCny)}</strong>{movement && <small className={`movement ${movement.kind}`}>{movement.label}</small>}</div><div><span>库存</span><StockPill offer={offer} /></div><DemandMetric offer={offer} /></div>
                    <OfferActions offer={offer} />
                  </article>
                );
              })}</div>
              <div className="pagination"><span>第 {safePage} / {pageCount} 页 · 每页 {PAGE_SIZE} 条</span><div><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft />上一页</button><button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页<ChevronRight /></button></div></div>
            </>
          ) : <div className="no-results"><Search /><strong>没有匹配的商品</strong><p>放宽价格、库存、新鲜度或标签条件后再试。</p><button type="button" onClick={resetFilters}>清空全部筛选</button></div>}
        </div>
      </section>

      <section className="section low-price-section" id="low-price">
        <div className="section-heading"><div><span>LONG-TERM LOW</span><h2>长期低价观察</h2><p>仅纳入仍显示有货且具有原页确认或新鲜渠道证据的商品；样本会随每轮刷新持续累积。</p></div><span className="section-badge"><ShieldCheck />证据优先于绝对低价</span></div>
        {lowPicks.length ? <div className="low-grid">{lowPicks.map((offer, index) => <article key={offer.id}><header><span>#{String(index + 1).padStart(2, "0")}</span><VerificationPill offer={offer} /></header><h3>{offer.merchant}</h3><p>{offer.productName}</p><div className="low-price"><span>当前</span><strong>{formatMoney(offer.priceCny)}</strong><small>可信历史低 {formatMoney(offer.trustedLowCny)}</small></div><div className="low-chart"><Sparkline points={offer.priceHistory} /><span>{offer.priceHistory.length} 个样本</span></div><OfferActions offer={offer} compact /></article>)}</div> : <div className="empty-state"><LoaderCircle /><div><strong>长期样本正在累积</strong><p>至少需要连续快照才能判断“长期低价”，首轮数据不会被包装成历史趋势。</p></div></div>}
      </section>

      <section className="section changes-section" id="changes">
        <div className="section-heading"><div><span>SNAPSHOT DIFF</span><h2>这一轮发生了什么</h2><p>价格、库存、新增商品逐轮对比，手动同步与页面自动同步都只读取最新已部署结果。</p></div><span className="section-badge"><Clock3 />{formatDate(data.generatedAt)}</span></div>
        <div className="changes-grid">
          <aside><span>采集窗口</span><strong>{data.runId}</strong><p>{data.sourceWindow}</p><dl><div><dt>新鲜商品</dt><dd>{compactNumber(data.coverage.freshOffers)}</dd></div><div><dt>原页可达</dt><dd>{compactNumber(data.coverage.reachable)}</dd></div><div><dt>复核失败</dt><dd>{compactNumber(data.coverage.failedSources)}</dd></div><div><dt>熔断域名</dt><dd>{compactNumber(data.coverage.blockedDomains)}</dd></div></dl></aside>
          <div className="change-list">{data.deltas.length ? data.deltas.slice(0, 10).map((delta) => <article key={delta.id}><span className={`change-icon ${delta.type}`}>{delta.type === "price_down" ? <TrendingDown /> : delta.type === "price_up" ? <ArrowUp /> : delta.type === "restocked" ? <PackageCheck /> : delta.type === "sold_out" ? <CircleAlert /> : <Sparkles />}</span><div><strong>{delta.merchant}</strong><p>{delta.productName}</p></div><div><span>{delta.before}</span><ChevronRight /><strong>{delta.after}</strong><small>{relativeTime(delta.at)}</small></div></article>) : <div className="empty-state"><Activity /><div><strong>暂无可比变化</strong><p>下一轮快照完成后会显示价格与库存差异。</p></div></div>}</div>
        </div>
      </section>

      <section className="section differences-section" id="differences">
        <div className="section-heading"><div><span>PRODUCT DIFFERENCES</span><h2>账号类型不是同一种商品</h2><p>先比较归属和交付模型，再比较价格；异常低价往往对应完全不同的风险。</p></div></div>
        <div className="plan-table-wrap"><table className="plan-table"><thead><tr><th>类型</th><th>账号 / 权益归属</th><th>常见周期</th><th>适合场景</th><th>主要风险</th></tr></thead><tbody>{planRows.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.owner}</td><td>{row.duration}</td><td>{row.fit}</td><td>{row.risk}</td></tr>)}</tbody></table></div>
        <div className="difference-cards">{planRows.map((row) => <article key={row.name}><span>{row.name}</span><div><small>归属</small><strong>{row.owner}</strong></div><div><small>适合</small><strong>{row.fit}</strong></div><div className="risk"><small>风险</small><strong>{row.risk}</strong></div></article>)}</div>
      </section>

      <section className="method-section" id="method">
        <div className="method-heading"><span>TRUST ENGINE</span><h2>为什么聚合站能显示“有货”？</h2><p>关键不是神奇地绕过每个原站，而是使用上游商家接口或渠道采集结果，再结合更新时间判断是否仍可信。本项目把这两类证据公开拆开，不把渠道库存伪装成原页下单确认。</p></div>
        <div className="method-steps">
          <article><span>01</span><Search /><h3>大规模发现</h3><p>并发展开公开目录，收集商家、商品、价格、库存、更新时间和原商家链接。</p><small>输出：目录收录</small></article>
          <article><span>02</span><Zap /><h3>渠道新鲜度</h3><p>解析“几分钟前”等相对时间；6 小时内返回明确库存的记录标记为渠道新鲜。</p><small>输出：渠道新鲜</small></article>
          <article><span>03</span><BadgeCheck /><h3>原页复核</h3><p>同页识别商品、价格、正库存和下单动作；遇到验证码或 WAF 时如实记录失败。</p><small>输出：原页确认</small></article>
          <article><span>04</span><BarChart3 /><h3>历史与需求</h3><p>价格和库存逐轮归档；销量只记录原页公开值，其余只显示“库存消耗估算”。</p><small>输出：趋势样本</small></article>
        </div>
        <div className="method-warning"><Info /><p><strong>能力边界：</strong>静态 GitHub Pages 不能在访客浏览器里安全持有采集密钥，也不能绕过第三方验证码。真正的采集由定时任务执行；网页会自动同步最新结果并清楚标出快照时间。若接入平台授权的商家 API，可进一步提升原始库存覆盖率。</p></div>
      </section>

      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><span /><span /><span /></span><div><strong>链动小铺</strong><small>OPEN MARKET INTELLIGENCE</small></div></div><p>公开信息索引与技术核验，不参与交易，不担保第三方履约。</p><div><a href="https://github.com/yusheng266186-beep/liandong-ai-radar" target="_blank" rel="noopener noreferrer"><GitFork />GitHub</a><span>30 分钟自动刷新</span><span>MIT License</span></div></footer>

      {mobileFilters && <div className="mobile-filter-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMobileFilters(false)}><aside role="dialog" aria-modal="true" aria-label="筛选商品"><header><div><Filter /><strong>筛选商品</strong></div><button type="button" onClick={() => setMobileFilters(false)} aria-label="关闭筛选"><X /></button></header><div className="mobile-filter-content"><FilterPanel {...filterProps} /></div><footer><button type="button" onClick={() => setMobileFilters(false)}>查看 {offers.length.toLocaleString("zh-CN")} 条结果</button></footer></aside></div>}
      {selectedIds.length > 0 && <div className="compare-dock"><div><GitCompareArrows /><span>已选择 <strong>{selectedIds.length}</strong> / 4</span><div>{selectedOffers.map((offer) => <i key={offer.id} title={offer.merchant}>{offer.merchant.slice(0, 1)}</i>)}</div></div><div><button type="button" onClick={() => setSelectedIds([])}>清空</button><button type="button" className="compare-now" onClick={() => setCompareOpen(true)} disabled={selectedIds.length < 2}>开始对比<ChevronRight /></button></div></div>}
      {compareOpen && <CompareModal offers={selectedOffers} onClose={() => setCompareOpen(false)} onRemove={(id) => setSelectedIds((current) => current.filter((item) => item !== id))} />}
      {detailOffer && <OfferDetail offer={detailOffer} onClose={() => setDetailOffer(null)} />}
    </main>
  );
}
