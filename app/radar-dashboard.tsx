"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Eye,
  ExternalLink,
  Info,
  Layers3,
  Link2,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Rows3,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

type StockStatus = "in_stock" | "out_of_stock" | "unverified";
type ProductType = "plus" | "business";
type RiskLevel = "low" | "medium" | "high" | "very_high";

type Offer = {
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
  verification: "double_signal" | "official" | "partial" | "failed";
  evidence: string[];
  risk: RiskLevel;
  url: string;
  checkedAt: string | null;
  latencyMs: number | null;
  historicalLowCny: number | null;
  previousPriceCny: number | null;
  priceHistoryCny?: number[];
  isOfficial?: boolean;
};

type MonitorPayload = {
  mode: "live" | "snapshot";
  checkedAt: string | null;
  offers: Offer[];
  coverage: { total: number; verified: number; failed: number };
  message?: string;
};

type CatalogCategory = {
  id: string;
  name: string;
  productType: ProductType;
  description: string;
  url: string;
  totalChannels: number;
  inStockChannels: number;
  outOfStockChannels: number;
  loadedOffers: number;
  updatedLabel: string | null;
  status: "live" | "fallback" | "failed";
};

type CatalogOffer = {
  id: string;
  categoryId: string;
  categoryName: string;
  productType: ProductType;
  merchant: string;
  productName: string;
  priceCny: number | null;
  stockStatus: StockStatus;
  stockCount: number | null;
  updatedAt: string | null;
  purchaseUrl: string;
  shopUrl: string | null;
  sourceUrl: string;
  verification: "upstream_index";
};

type CatalogPayload = {
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

const waitingCatalog: CatalogPayload = {
  mode: "fallback",
  checkedAt: null,
  offers: [],
  categories: [
    ["chatgpt-plus", "Plus 试用 / 成品号", "plus", "日抛、网页号、已/未接码成品号", "https://priceai.cc/products/chatgpt-plus", 1101, 274],
    ["chatgpt-team-business", "Team / Business", "business", "K12、Bug Team、母号/子号与邀请", "https://priceai.cc/products/chatgpt-team-business", 275, 89],
    ["chatgpt-plus-recharge", "Plus 正价代充", "plus", "官方充值、正价/正规与真实付费", "https://priceai.cc/products/chatgpt-plus-recharge", 245, 209],
    ["chatgpt-free-account", "ChatGPT 普号", "plus", "普通账号、Free 号与白号", "https://priceai.cc/products/chatgpt-free-account", 218, 175],
    ["chatgpt-go", "ChatGPT Go", "plus", "Go 月卡、年卡、激活码与直充", "https://priceai.cc/products/chatgpt-go", 31, 24],
    ["chatgpt-pro-20x", "ChatGPT Pro 20x", "plus", "Pro 高额度、成品号与代开", "https://priceai.cc/products/chatgpt-pro-20x", 294, 230],
    ["chatgpt-pro-5x", "ChatGPT Pro 5x", "plus", "Pro 5x 会员、成品号与代开", "https://priceai.cc/products/chatgpt-pro-5x", 229, 183],
    ["chatgpt-services", "ChatGPT 周边服务", "plus", "提链、扫码、自助充值与邀请", "https://priceai.cc/products/chatgpt-codex-service", 47, 33],
  ].map(([id, name, productType, description, url, totalChannels, inStockChannels]) => ({
    id: String(id),
    name: String(name),
    productType: productType as ProductType,
    description: String(description),
    url: String(url),
    totalChannels: Number(totalChannels),
    inStockChannels: Number(inStockChannels),
    outOfStockChannels: Number(totalChannels) - Number(inStockChannels),
    loadedOffers: 0,
    updatedLabel: null,
    status: "fallback" as const,
  })),
  coverage: { totalChannels: 2440, inStockChannels: 1217, outOfStockChannels: 1223, loadedOffers: 0, uniqueLoadedMerchants: 0, liveCategories: 0, totalCategories: 8 },
  message: "正在同步公开目录。",
};

const waitingOffers: Offer[] = [
  {
    sourceId: "openai-plus",
    merchant: "OpenAI 官方",
    productName: "ChatGPT Plus",
    productType: "plus",
    deliveryType: "本人账号订阅",
    price: 20,
    currency: "USD",
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "partial",
    evidence: ["等待首次实时核验"],
    risk: "low",
    url: "https://chatgpt.com/pricing/",
    checkedAt: null,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
    isOfficial: true,
  },
  {
    sourceId: "xiaoheiwan-plus",
    merchant: "小黑丸",
    productName: "ChatGPT Plus / 充值服务",
    productType: "plus",
    deliveryType: "代充 / 成品号",
    price: null,
    currency: "CNY",
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "failed",
    evidence: ["等待首次实时核验"],
    risk: "medium",
    url: "https://upgrade.xiaoheiwan.com/",
    checkedAt: null,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
  },
  {
    sourceId: "supercool-shared-plus",
    merchant: "超酷 AI",
    productName: "ChatGPT Plus 共享账号",
    productType: "plus",
    deliveryType: "多人共享",
    price: null,
    currency: "CNY",
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "failed",
    evidence: ["等待首次实时核验"],
    risk: "very_high",
    url: "https://supercoolaigc.live/",
    checkedAt: null,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
  },
  {
    sourceId: "digitalchose-plus",
    merchant: "数字严选",
    productName: "ChatGPT Plus 成品账号",
    productType: "plus",
    deliveryType: "独享 / 共享",
    price: null,
    currency: "CNY",
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "failed",
    evidence: ["等待首次实时核验"],
    risk: "high",
    url: "https://digitalchose.com/product/chatgpt-plus-%E4%BC%9A%E5%91%98-%E5%8C%85%E6%8D%A2%E5%8C%85%E8%B5%94/",
    checkedAt: null,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
  },
  {
    sourceId: "uzaai-plus",
    merchant: "UzaAI",
    productName: "ChatGPT Plus 独享账号",
    productType: "plus",
    deliveryType: "成品独享",
    price: null,
    currency: "CNY",
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "failed",
    evidence: ["等待首次实时核验"],
    risk: "high",
    url: "https://shop.chatgptroot.com/buy/7",
    checkedAt: null,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
  },
  {
    sourceId: "g2a-business",
    merchant: "G2A",
    productName: "ChatGPT Business（原 Team）席位",
    productType: "business",
    deliveryType: "工作区席位",
    price: null,
    currency: "USD",
    priceCny: null,
    stockStatus: "unverified",
    stockCount: null,
    verification: "failed",
    evidence: ["等待首次实时核验"],
    risk: "high",
    url: "https://www.g2a.com/chatgpt-team-1-user-1-month-chatgpt-account-global-i10000505514005",
    checkedAt: null,
    latencyMs: null,
    historicalLowCny: null,
    previousPriceCny: null,
  },
];

function money(offer: Offer, field: "current" | "historical" = "current") {
  if (field === "historical") {
    return offer.historicalLowCny == null ? "—" : `¥${offer.historicalLowCny.toFixed(2)}`;
  }
  if (offer.price == null) return "待核验";
  return offer.currency === "USD" ? `US$${offer.price.toFixed(2)}` : `¥${offer.price.toFixed(2)}`;
}

const numberFormat = new Intl.NumberFormat("zh-CN");

function catalogMoney(value: number | null) {
  return value == null ? "待核验" : `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string | null) {
  if (!value) return "尚未核验";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function freshness(value: string | null) {
  if (!value) return { label: "无快照", stale: true };
  const age = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(age) || age < 0) return { label: "时间异常", stale: true };
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return { label: "刚刚更新", stale: false };
  if (minutes < 60) return { label: `${minutes} 分钟前`, stale: false };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours} 小时前`, stale: false };
  return { label: `${Math.floor(hours / 24)} 天前`, stale: true };
}

function isAvailable(offer: Offer) {
  return offer.stockStatus === "in_stock" && ["double_signal", "official"].includes(offer.verification);
}

const riskCopy: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "低风险", className: "risk-low" },
  medium: { label: "中风险", className: "risk-medium" },
  high: { label: "高风险", className: "risk-high" },
  very_high: { label: "极高风险", className: "risk-high" },
};

function StockPill({ offer }: { offer: Offer }) {
  if (offer.stockStatus === "in_stock" && offer.verification === "double_signal") {
    return <span className="signal-pill signal-ok"><span className="signal-dot" /> 双信号有货{offer.stockCount == null ? "" : ` · ${offer.stockCount}`}</span>;
  }
  if (offer.stockStatus === "in_stock" && offer.verification === "official") {
    return <span className="signal-pill signal-official"><BadgeCheck size={13} /> 官方可订阅</span>;
  }
  if (offer.stockStatus === "out_of_stock") {
    return <span className="signal-pill signal-out"><X size={13} /> 已售罄</span>;
  }
  return <span className="signal-pill signal-wait"><Clock3 size={13} /> 无法确认</span>;
}

function PriceMovement({ offer }: { offer: Offer }) {
  if (offer.priceCny == null || offer.previousPriceCny == null) return <span className="price-delta neutral">暂无趋势</span>;
  const delta = offer.priceCny - offer.previousPriceCny;
  if (Math.abs(delta) < 0.005) return <span className="price-delta neutral">价格持平</span>;
  if (delta < 0) return <span className="price-delta down"><ArrowDownRight size={13} /> ¥{Math.abs(delta).toFixed(2)}</span>;
  return <span className="price-delta up"><ArrowUpRight size={13} /> ¥{delta.toFixed(2)}</span>;
}

function PriceSparkline({ offer, large = false }: { offer: Offer; large?: boolean }) {
  const values = offer.priceHistoryCny ?? [];
  if (!values.length) return <span className="sparkline-empty">等待价格档案</span>;
  const width = large ? 300 : 92;
  const height = large ? 72 : 30;
  const padding = large ? 5 : 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = padding + ((max - value) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const [lastX, lastY] = points.split(" ").at(-1)!.split(",");

  return (
    <svg className={large ? "sparkline sparkline-large" : "sparkline"} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`最近 ${values.length} 次可信价格记录`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={large ? 2.2 : 1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={large ? 3.2 : 2.2} fill="currentColor" />
    </svg>
  );
}

function OfferDetailSheet({ offer }: { offer: Offer }) {
  const currentFreshness = freshness(offer.checkedAt);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`查看 ${offer.merchant} 核验详情`} className="detail-button"><Eye /></Button>
      </SheetTrigger>
      <SheetContent className="evidence-sheet">
        <SheetHeader className="evidence-header">
          <div className="sheet-kicker"><ListChecks /> VERIFICATION RECORD</div>
          <SheetTitle>{offer.merchant}</SheetTitle>
          <SheetDescription>{offer.productName} · {offer.deliveryType}</SheetDescription>
        </SheetHeader>

        <div className="evidence-body">
          <div className="evidence-status-row">
            <StockPill offer={offer} />
            <span className={currentFreshness.stale ? "freshness stale" : "freshness"}><Clock3 />{currentFreshness.label}</span>
          </div>

          <div className="evidence-metrics">
            <div><span>当前价格</span><strong>{money(offer)}</strong></div>
            <div><span>本站最低</span><strong>{money(offer, "historical")}</strong></div>
            <div><span>响应耗时</span><strong>{offer.latencyMs == null ? "—" : `${offer.latencyMs}ms`}</strong></div>
          </div>

          <section className="history-panel">
            <div><span>可信价格轨迹</span><small>最近最多 12 次有货记录</small></div>
            <PriceSparkline offer={offer} large />
          </section>

          <section className="evidence-list">
            <h3>本轮核验证据</h3>
            {offer.evidence.map((item, index) => (
              <div key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>
            ))}
          </section>

          <div className={`sheet-risk ${riskCopy[offer.risk].className}`}>
            <ShieldAlert />
            <div><strong>{riskCopy[offer.risk].label}</strong><p>{offer.isOfficial ? "官方渠道仍可能受地区、支付方式与账户资格限制。" : "第三方页面可访问不代表交付或售后可靠；避免提交常用账号密码、验证码与恢复邮箱。"}</p></div>
          </div>
        </div>

        <SheetFooter className="evidence-footer">
          <Button asChild variant="outline"><a href={offer.url} target="_blank" rel="noreferrer"><Link2 />打开公开来源</a></Button>
          <PurchaseDialog offer={offer} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PurchaseDialog({ offer }: { offer: Offer }) {
  const [open, setOpen] = useState(false);
  const canBuy = isAvailable(offer);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant={canBuy ? "default" : "outline"}
        disabled={!canBuy}
        className={canBuy ? "buy-button" : ""}
        onClick={() => setOpen(true)}
      >
        {canBuy ? "查看购买页" : "暂不可购"}<ChevronRight />
      </Button>
      <DialogContent className="purchase-dialog">
        <DialogHeader>
          <div className="dialog-icon"><ShieldAlert /></div>
          <DialogTitle>离开前再确认一次风险</DialogTitle>
          <DialogDescription>链动小铺只核验公开页面的价格、库存与下单入口，不担保第三方交付、账号归属或售后。</DialogDescription>
        </DialogHeader>
        <div className="dialog-summary">
          <div><span>商家</span><strong>{offer.merchant}</strong></div>
          <div><span>商品</span><strong>{offer.productName}</strong></div>
          <div><span>风险</span><strong>{riskCopy[offer.risk].label}</strong></div>
        </div>
        {!offer.isOfficial && (
          <div className="dialog-warning"><TriangleAlert /> 成品号、共享号及转售席位可能被原持有人找回、被管理员移除或因违反平台条款而失效。不要向商家提供你常用账号的密码、验证码或恢复邮箱。</div>
        )}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">返回比较</Button></DialogClose>
          <Button asChild className="buy-button"><a href={offer.url} target="_blank" rel="noreferrer">继续前往商家 <ExternalLink /></a></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferTable({ offers }: { offers: Offer[] }) {
  if (!offers.length) {
    return <div className="offer-empty"><ShieldCheck /><strong>当前筛选下没有可信可购商品</strong><span>关闭“仅看可购买”或切换商品类型查看全部来源。</span></div>;
  }
  return (
    <div className="table-shell">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="merchant-col">商家与商品</TableHead>
            <TableHead>实时价格</TableHead>
            <TableHead>库存核验</TableHead>
            <TableHead>长期低价</TableHead>
            <TableHead>风险</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {offers.map((offer, index) => (
            <TableRow key={offer.sourceId} className={index === 0 ? "best-row" : ""}>
              <TableCell>
                <div className="merchant-cell">
                  <div className={`merchant-mark mark-${(index % 4) + 1}`}>{offer.merchant.slice(0, 1)}</div>
                  <div>
                    <div className="merchant-name">{offer.merchant}{offer.isOfficial && <Badge variant="outline" className="official-badge">官方</Badge>}</div>
                    <div className="product-name">{offer.productName} · {offer.deliveryType}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell><div className="price-cell"><strong>{money(offer)}</strong><PriceMovement offer={offer} /></div></TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild><span tabIndex={0}><StockPill offer={offer} /></span></TooltipTrigger>
                  <TooltipContent className="max-w-72">{offer.evidence.join("；")} {offer.latencyMs == null ? "" : `· ${offer.latencyMs}ms`}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell><div className="history-cell"><PriceSparkline offer={offer} /><div className="history-price">{money(offer, "historical")}<span>本站最低</span></div></div></TableCell>
              <TableCell><span className={`risk-pill ${riskCopy[offer.risk].className}`}>{riskCopy[offer.risk].label}</span></TableCell>
              <TableCell className="text-right"><div className="row-actions"><OfferDetailSheet offer={offer} /><PurchaseDialog offer={offer} /></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OfferMobileList({ offers }: { offers: Offer[] }) {
  if (!offers.length) return <div className="offer-empty mobile-empty"><ShieldCheck /><strong>没有符合条件的商品</strong><span>调整筛选条件后再查看。</span></div>;
  return (
    <div className="mobile-offer-list">
      {offers.map((offer, index) => {
        const currentFreshness = freshness(offer.checkedAt);
        return (
          <article className={index === 0 ? "mobile-offer best-mobile-offer" : "mobile-offer"} key={offer.sourceId}>
            <div className="mobile-offer-head">
              <div className="merchant-cell">
                <div className={`merchant-mark mark-${(index % 4) + 1}`}>{offer.merchant.slice(0, 1)}</div>
                <div><div className="merchant-name">{offer.merchant}{offer.isOfficial && <Badge variant="outline" className="official-badge">官方</Badge>}</div><div className="product-name">{offer.productName}</div></div>
              </div>
              <span className={`risk-pill ${riskCopy[offer.risk].className}`}>{riskCopy[offer.risk].label}</span>
            </div>
            <div className="mobile-offer-main">
              <div className="mobile-price"><span>实时价格</span><strong>{money(offer)}</strong><PriceMovement offer={offer} /></div>
              <div className="mobile-history"><PriceSparkline offer={offer} /><span>历史低价 {money(offer, "historical")}</span></div>
            </div>
            <div className="mobile-offer-meta"><StockPill offer={offer} /><span className={currentFreshness.stale ? "freshness stale" : "freshness"}><Clock3 />{currentFreshness.label}</span></div>
            <div className="mobile-offer-actions"><OfferDetailSheet offer={offer} /><PurchaseDialog offer={offer} /></div>
          </article>
        );
      })}
    </div>
  );
}

function CatalogLinkDialog({ offer }: { offer: CatalogOffer }) {
  const available = offer.stockStatus === "in_stock";
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={available ? "default" : "outline"} className={available ? "buy-button" : ""} disabled={!available} onClick={() => setOpen(true)}>
        {available ? "去购买" : "不可购买"}<ExternalLink />
      </Button>
      <DialogContent className="purchase-dialog">
        <DialogHeader>
          <div className="dialog-icon catalog-dialog-icon"><Rows3 /></div>
          <DialogTitle>这是聚合索引，不是独立复核</DialogTitle>
          <DialogDescription>该条目的价格、库存和链接来自 PriceAI 的公开目录。链动小铺尚未逐站确认此商品，请在原店铺再次核对。</DialogDescription>
        </DialogHeader>
        <div className="dialog-summary">
          <div><span>渠道</span><strong>{offer.merchant}</strong></div>
          <div><span>分类</span><strong>{offer.categoryName}</strong></div>
          <div><span>索引价格</span><strong>{catalogMoney(offer.priceCny)}</strong></div>
          <div><span>索引库存</span><strong>{offer.stockCount == null ? "标记有货" : `${numberFormat.format(offer.stockCount)} 件`}</strong></div>
        </div>
        <div className="dialog-warning"><TriangleAlert /> 点击后将离开本站。账号来源、质保、最小起购量与售后均以原店铺为准；不要提交常用账号密码、验证码或恢复邮箱。</div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">返回目录</Button></DialogClose>
          <Button asChild className="buy-button"><a href={offer.purchaseUrl} target="_blank" rel="noreferrer">前往原商品页 <ExternalLink /></a></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogStock({ offer }: { offer: CatalogOffer }) {
  if (offer.stockStatus === "in_stock") return <span className="signal-pill signal-index"><span className="signal-dot" /> 上游有货{offer.stockCount == null ? "" : ` · ${numberFormat.format(offer.stockCount)}`}</span>;
  if (offer.stockStatus === "out_of_stock") return <span className="signal-pill signal-out"><X size={13} /> 上游缺货</span>;
  return <span className="signal-pill signal-wait"><Clock3 size={13} /> 状态不明</span>;
}

function CatalogPanel({ catalog, loading, productFilter }: { catalog: CatalogPayload; loading: boolean; productFilter: "all" | ProductType }) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const categories = productFilter === "all" ? catalog.categories : catalog.categories.filter((item) => item.productType === productFilter);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.offers.filter((offer) => {
      if (productFilter !== "all" && offer.productType !== productFilter) return false;
      if (categoryId !== "all" && offer.categoryId !== categoryId) return false;
      if (onlyInStock && offer.stockStatus !== "in_stock") return false;
      return !normalized || `${offer.merchant} ${offer.productName} ${offer.categoryName}`.toLowerCase().includes(normalized);
    }).sort((a, b) => {
      const aStock = a.stockStatus === "in_stock" ? 0 : 1;
      const bStock = b.stockStatus === "in_stock" ? 0 : 1;
      return aStock - bStock || (a.priceCny ?? Number.POSITIVE_INFINITY) - (b.priceCny ?? Number.POSITIVE_INFINITY);
    });
  }, [catalog.offers, categoryId, onlyInStock, productFilter, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [categoryId, onlyInStock, productFilter, query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div className="catalog-panel">
      <div className="catalog-trustbar">
        <div><Database /><div><strong>{numberFormat.format(catalog.coverage.totalChannels)} 个报价渠道已纳入索引</strong><span>规模来自 8 个 ChatGPT 品类；已加载跳转项与独立复核项分开统计</span></div></div>
        <div className="catalog-sync"><div><span>{loading ? "正在同步公开目录" : `${catalog.coverage.liveCategories}/${catalog.coverage.totalCategories} 个品类实时返回`}</span><strong>{Math.round((catalog.coverage.liveCategories / Math.max(1, catalog.coverage.totalCategories)) * 100)}%</strong></div><Progress value={(catalog.coverage.liveCategories / Math.max(1, catalog.coverage.totalCategories)) * 100} /></div>
      </div>

      {catalog.message && <div className="catalog-message"><CircleAlert />{catalog.message}</div>}

      <div className="category-grid">
        {categories.map((category) => (
          <article key={category.id} className={categoryId === category.id ? "category-card active" : "category-card"}>
            <button className="category-select" onClick={() => setCategoryId(categoryId === category.id ? "all" : category.id)} aria-pressed={categoryId === category.id}>
              <div><span>{category.name}</span><Badge variant="outline" className={category.status === "live" ? "live-badge" : "baseline-badge"}>{category.status === "live" ? "实时" : "基线"}</Badge></div>
              <strong>{numberFormat.format(category.totalChannels)}<small> 渠道</small></strong>
              <p><span>{numberFormat.format(category.inStockChannels)} 有货</span><span>{numberFormat.format(category.outOfStockChannels)} 缺货</span></p>
            </button>
            <a href={category.url} target="_blank" rel="noreferrer">完整品类 <ExternalLink /></a>
          </article>
        ))}
      </div>

      <div className="catalog-toolbar">
        <label className="catalog-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索商家、商品或品类" aria-label="搜索商家、商品或品类" /></label>
        <label className="switch-label"><Switch checked={onlyInStock} onCheckedChange={setOnlyInStock} size="sm" /><span>仅看上游有货</span></label>
        <div className="loaded-count"><Layers3 /><span>本轮已加载</span><strong>{numberFormat.format(catalog.coverage.loadedOffers)}</strong><span>个可跳转报价组</span></div>
      </div>

      {!loading && catalog.offers.length === 0 ? (
        <div className="offer-empty catalog-empty"><Database /><strong>本轮未取得逐条报价</strong><span>上方渠道总量是公开规模基线；可点击“完整品类”前往来源查看，本站不会编造跳转链接。</span></div>
      ) : loading && catalog.offers.length === 0 ? <DashboardSkeleton /> : (
        <>
          <div className="catalog-table-shell">
            <Table>
              <TableHeader><TableRow><TableHead>渠道 / 商品</TableHead><TableHead>品类</TableHead><TableHead>索引价格</TableHead><TableHead>索引库存</TableHead><TableHead>更新时间</TableHead><TableHead className="text-right">跳转</TableHead></TableRow></TableHeader>
              <TableBody>{visible.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell><div className="catalog-merchant"><strong>{offer.merchant}</strong><span>{offer.productName}</span>{offer.shopUrl && <a href={offer.shopUrl} target="_blank" rel="noreferrer">店铺主页 <ExternalLink /></a>}</div></TableCell>
                  <TableCell><Badge variant="outline" className="category-badge">{offer.categoryName}</Badge></TableCell>
                  <TableCell><strong className="catalog-price">{catalogMoney(offer.priceCny)}</strong></TableCell>
                  <TableCell><CatalogStock offer={offer} /></TableCell>
                  <TableCell><span className="catalog-time">{dateTime(offer.updatedAt)}</span></TableCell>
                  <TableCell className="text-right"><CatalogLinkDialog offer={offer} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          <div className="catalog-mobile-list">{visible.map((offer) => (
            <article className="catalog-mobile-card" key={offer.id}>
              <div><Badge variant="outline" className="category-badge">{offer.categoryName}</Badge><CatalogStock offer={offer} /></div>
              <h3>{offer.merchant}</h3><p>{offer.productName}</p>
              <div className="catalog-mobile-price"><strong>{catalogMoney(offer.priceCny)}</strong><span>{dateTime(offer.updatedAt)}</span></div>
              <div className="catalog-mobile-actions">{offer.shopUrl && <Button asChild variant="ghost" size="sm"><a href={offer.shopUrl} target="_blank" rel="noreferrer">店铺主页</a></Button>}<CatalogLinkDialog offer={offer} /></div>
            </article>
          ))}</div>
          <div className="catalog-pagination"><span>第 {page} / {totalPages} 页 · 筛选后 {numberFormat.format(filtered.length)} 条</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button></div></div>
        </>
      )}
      <div className="catalog-source-note"><Info />目录规模与“上游有货”来自 <a href="https://priceai.cc/channels" target="_blank" rel="noreferrer">PriceAI 公开页面</a>；每个跳转项保留原商品链接。只有“独立复核”页的双信号商品才进入本站最低价推荐。</div>
    </div>
  );
}

function ComparisonGrid() {
  const items = [
    { label: "官方价格基准", plus: "US$20 / 月；个人套餐", business: "标准席 US$25 月付或 US$20 年付；至少 2 席" },
    { label: "账号归属", plus: "商家提供账号，归属链不透明", business: "使用自己的账号加入他人工作区" },
    { label: "最大风险", plus: "邮箱找回、共享挤号、风控封禁", business: "工作区所有者可随时移除席位" },
    { label: "隐私边界", plus: "历史会话可能留在交付账号内", business: "工作区数据受管理员设置约束" },
    { label: "官方数据政策", plus: "个人数据控制设置为准", business: "业务数据默认不用于模型训练" },
    { label: "管理能力", plus: "无工作区管理控制", business: "拥有席位、成员与工作区管理能力" },
    { label: "稳定性", plus: "取决于账号来源与续费方式", business: "取决于工作区持续付费与管理员" },
    { label: "适合谁", plus: "只建议短期、低敏感用途", business: "真正同组织且需要协作的成员" },
    { label: "本站结论", plus: "高风险；优先本人账号官方订阅", business: "非自有组织席位同样高风险" },
  ];

  return (
    <div>
      <div className="compare-wrap">
        <div className="compare-head compare-label">比较维度</div>
        <div className="compare-head"><span className="plan-icon"><Sparkles /></span><div><strong>Plus 成品账号</strong><span>第三方交付登录凭据</span></div></div>
        <div className="compare-head"><span className="plan-icon business"><LockKeyhole /></span><div><strong>Business / Team 席位</strong><span>加入他人管理的工作区</span></div></div>
        {items.map((item) => (
          <div className="compare-row" key={item.label}>
            <div className="compare-label">{item.label}</div><div>{item.plus}</div><div>{item.business}</div>
          </div>
        ))}
      </div>
      <div className="compare-sources">
        官方基准：<a href="https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus" target="_blank" rel="noreferrer">Plus 说明</a>
        <span>·</span>
        <a href="https://help.openai.com/en/articles/8792828-what-is-chatgpt-business" target="_blank" rel="noreferrer">Business 说明</a>
        <span>·</span>
        <a href="https://help.openai.com/en/articles/12111915-chatgpt-business-rename-faq" target="_blank" rel="noreferrer">Team 更名说明</a>
      </div>
    </div>
  );
}

function MethodPanel() {
  const steps = [
    { n: "01", title: "同步大规模渠道索引", text: "读取 8 个 ChatGPT 品类的报价总量、有货量与公开首屏报价，保留来源和原商品链接。" },
    { n: "02", title: "标准化并明确数据层级", text: "统一商家、商品、价格与库存字段；上游目录只标记为“聚合索引”，不冒充本站核验。" },
    { n: "03", title: "对低价候选逐站复核", text: "第三方商品只有“库存大于 0”与“购买按钮可用”同时出现才进入独立可购名单。" },
    { n: "04", title: "沉淀可信价格档案", text: "每次独立核验保存快照，长期最低价和趋势只来自本站真实、可购记录。" },
  ];
  return (
    <div className="method-grid">
      {steps.map((step) => <article className="method-card" key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}
      <aside className="method-note"><CircleAlert /><div><strong>2,000+ 渠道不等于 2,000+ 个独立商家域名</strong><p>聚合站常把同一平台、同名商品和多规格记录计为多个报价渠道。本站分别展示“报价渠道总量、已加载商家名、可跳转报价组、独立复核来源”，避免用一个夸大的数字代替真实覆盖。</p></div></aside>
    </div>
  );
}

function DashboardSkeleton() {
  return <div className="skeleton-stack"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
}

export function RadarDashboard() {
  const [data, setData] = useState<MonitorPayload>({ mode: "snapshot", checkedAt: null, offers: waitingOffers, coverage: { total: waitingOffers.length, verified: 0, failed: waitingOffers.length } });
  const [catalog, setCatalog] = useState<CatalogPayload>(waitingCatalog);
  const [filter, setFilter] = useState<"all" | ProductType>("all");
  const [onlyVerified, setOnlyVerified] = useState(true);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  async function loadSnapshot() {
    try {
      const response = await fetch("/api/monitor", { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot unavailable");
      const payload = (await response.json()) as MonitorPayload;
      if (payload.offers?.length) {
        setData(payload);
        const stale = !payload.checkedAt || Date.now() - new Date(payload.checkedAt).getTime() > 24 * 60 * 60 * 1000;
        if (stale) void refreshLive();
      }
    } catch {
      // Keep the explicit waiting state when the server has no snapshot yet.
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadCatalog() {
    setCatalogLoading(true);
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("catalog unavailable");
      const payload = (await response.json()) as CatalogPayload;
      if (payload.categories?.length) setCatalog(payload);
    } catch {
      // Keep the explicit public baseline when the upstream catalog cannot be reached.
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
    void loadCatalog();
    const dailyRefresh = window.setInterval(() => { void refreshLive(); }, 24 * 60 * 60 * 1000);
    return () => window.clearInterval(dailyRefresh);
  }, []);

  async function refreshLive() {
    setLoading(true);
    setCatalogLoading(true);
    const toastId = toast.loading("正在同步渠道目录，并逐站复核最低价…");
    try {
      const [monitorResponse, catalogResponse] = await Promise.all([
        fetch("/api/monitor", { method: "POST", cache: "no-store" }),
        fetch("/api/catalog", { method: "POST", cache: "no-store" }),
      ]);
      const monitorPayload = (await monitorResponse.json()) as MonitorPayload & { error?: string };
      const catalogPayload = (await catalogResponse.json()) as CatalogPayload;
      if (!monitorResponse.ok) throw new Error(monitorPayload.error || "实时核验失败");
      setData(monitorPayload);
      if (catalogPayload.categories?.length) setCatalog(catalogPayload);
      toast.success(`同步完成：${numberFormat.format(catalogPayload.coverage.totalChannels)} 个渠道入索引，${monitorPayload.coverage.verified} 个来源独立确认`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "实时核验失败", { id: toastId });
    } finally {
      setLoading(false);
      setCatalogLoading(false);
    }
  }

  const offers = useMemo(() => {
    const selectedByType = filter === "all" ? data.offers : data.offers.filter((item) => item.productType === filter);
    const selected = onlyVerified ? selectedByType.filter(isAvailable) : selectedByType;
    return [...selected].sort((a, b) => {
      const aAvailable = a.stockStatus === "in_stock" && ["double_signal", "official"].includes(a.verification);
      const bAvailable = b.stockStatus === "in_stock" && ["double_signal", "official"].includes(b.verification);
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
      return (a.priceCny ?? Number.POSITIVE_INFINITY) - (b.priceCny ?? Number.POSITIVE_INFINITY);
    });
  }, [data.offers, filter, onlyVerified]);

  const thirdPartyBest = data.offers.filter((item) => !item.isOfficial && item.stockStatus === "in_stock" && item.verification === "double_signal" && item.priceCny != null).sort((a, b) => (a.priceCny ?? 0) - (b.priceCny ?? 0))[0];
  const historicalBest = data.offers.filter((item) => !item.isOfficial && item.historicalLowCny != null).sort((a, b) => (a.historicalLowCny ?? 0) - (b.historicalLowCny ?? 0))[0];

  return (
    <TooltipProvider>
      <main className="site-shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="链动小铺首页"><span className="brand-glyph"><ScanSearch /></span><span><strong>链动小铺</strong><small>AI PRICE SIGNAL</small></span></a>
          <div className="topbar-status"><span className="live-dot" /><span>{numberFormat.format(catalog.coverage.totalChannels)} 渠道索引</span><span className="status-separator" />{dateTime(catalog.checkedAt ?? data.checkedAt)}</div>
          <Button onClick={refreshLive} disabled={loading || catalogLoading} className="refresh-button">{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{loading ? "正在同步" : "同步并复核"}</Button>
        </header>

        <div id="top" className="content-wrap">
          <section className="intro-row">
            <div><p className="eyebrow"><Activity /> CHATGPT 全网渠道雷达</p><h1>先<span>广泛发现</span>，再严格复核。</h1><p>聚合 ChatGPT 相关 8 个标准品类与数千条报价渠道，并为已加载条目保留原商品跳转。最低价推荐只采用本站直接访问原店后通过“价格 + 库存 + 下单入口”核验的结果。</p></div>
            <div className="trust-note"><ShieldCheck /><div><strong>双层可信度</strong><span>聚合索引 ≠ 独立复核</span></div></div>
          </section>

          <section className="metric-grid" aria-label="市场概览">
            <article className="metric-card"><div className="metric-icon"><Database /></div><span>索引报价渠道</span><strong>{numberFormat.format(catalog.coverage.totalChannels)}</strong><p>8 个 ChatGPT 标准品类</p></article>
            <article className="metric-card"><div className="metric-icon green"><Store /></div><span>上游标记有货</span><strong>{numberFormat.format(catalog.coverage.inStockChannels)}</strong><p>尚未等同于本站复核</p></article>
            <article className="metric-card"><div className="metric-icon amber"><Rows3 /></div><span>已加载跳转报价</span><strong>{numberFormat.format(catalog.coverage.loadedOffers)}</strong><p>{catalog.coverage.uniqueLoadedMerchants} 个已加载商家名</p></article>
            <article className="metric-card"><div className="metric-icon green"><PackageCheck /></div><span>独立确认可购买</span><strong>{data.coverage.verified}<small> / {data.coverage.total}</small></strong><p>本站直接访问原商品页</p></article>
            <article className="metric-card metric-dark"><div className="metric-icon inverse"><ShoppingBag /></div><span>独立复核当前低价</span><strong>{thirdPartyBest ? money(thirdPartyBest) : "—"}</strong><p>{thirdPartyBest ? `${thirdPartyBest.merchant} · 双信号有货` : "暂无可信可购报价"}</p></article>
            <article className="metric-card"><div className="metric-icon amber"><TrendingUp /></div><span>本站长期最低记录</span><strong>{historicalBest?.historicalLowCny == null ? "—" : `¥${historicalBest.historicalLowCny.toFixed(2)}`}</strong><p>{historicalBest ? `${historicalBest.merchant} · 可信快照` : "首次核验后开始累计"}</p></article>
          </section>

          <section className="terminal-panel">
            <div className="panel-head">
              <div><p className="eyebrow"><span className="live-dot" /> LIVE MARKET</p><h2>实时价格雷达</h2></div>
              <div className="filter-group" aria-label="商品筛选">{(["all", "plus", "business"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={filter === value ? "active" : ""}>{value === "all" ? "全部" : value === "plus" ? "Plus" : "Business / Team"}</button>)}</div>
            </div>

            <Tabs defaultValue="catalog" className="dashboard-tabs">
              <TabsList variant="line" className="dashboard-tab-list"><TabsTrigger value="catalog">全量渠道 <small>{numberFormat.format(catalog.coverage.totalChannels)}</small></TabsTrigger><TabsTrigger value="market">独立复核 <small>{data.coverage.total}</small></TabsTrigger><TabsTrigger value="compare">账号差异</TabsTrigger><TabsTrigger value="method">核验方法</TabsTrigger></TabsList>
              <TabsContent value="catalog"><CatalogPanel catalog={catalog} loading={catalogLoading} productFilter={filter} /></TabsContent>
              <TabsContent value="market"><div className="market-toolbar"><div><ShieldCheck /><span>仅显示本站确认可购买</span></div><Switch checked={onlyVerified} onCheckedChange={setOnlyVerified} /></div>{initialLoading ? <DashboardSkeleton /> : <><OfferTable offers={offers} /><OfferMobileList offers={offers} /></>}<div className="table-foot"><span><Info />价格仅来自公开商品页，不含优惠码、税费和汇率滑点。</span><span>最后核验：{dateTime(data.checkedAt)}</span></div></TabsContent>
              <TabsContent value="compare"><ComparisonGrid /></TabsContent>
              <TabsContent value="method"><MethodPanel /></TabsContent>
            </Tabs>
          </section>

          <section className="safety-strip">
            <div className="safety-icon"><ShieldAlert /></div><div><p className="eyebrow">购买前必须知道</p><h2>低价不等于低风险。</h2></div>
            <p>聚合目录只能证明公开页面曾给出报价，不能证明交付可靠。第三方成品号、共享号或转售席位可能失效；本站把数据来源、核验等级与风险放在同一层级，不为任何商家背书。</p>
            <a href="https://openai.com/policies/row-terms-of-use/" target="_blank" rel="noreferrer">查看官方条款 <ExternalLink /></a>
          </section>
        </div>

        <footer>
          <div className="brand footer-brand"><span className="brand-glyph"><ScanSearch /></span><span><strong>链动小铺</strong><small>AI PRICE SIGNAL</small></span></div>
          <p>独立价格监测工具 · 非 OpenAI 官方产品 · 不参与交易</p>
          <div><span><span className="live-dot" /> 监测服务在线</span><span>数据以实时核验结果为准</span></div>
        </footer>
      </main>
      <Toaster richColors position="top-center" />
    </TooltipProvider>
  );
}
