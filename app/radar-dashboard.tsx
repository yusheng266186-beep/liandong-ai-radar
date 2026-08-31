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
  ExternalLink,
  Info,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  isOfficial?: boolean;
};

type MonitorPayload = {
  mode: "live" | "snapshot";
  checkedAt: string | null;
  offers: Offer[];
  coverage: { total: number; verified: number; failed: number };
  message?: string;
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

function PurchaseDialog({ offer }: { offer: Offer }) {
  const [open, setOpen] = useState(false);
  const canBuy = offer.stockStatus === "in_stock" && ["double_signal", "official"].includes(offer.verification);

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
              <TableCell><div className="history-price">{money(offer, "historical")}<span>本站记录</span></div></TableCell>
              <TableCell><span className={`risk-pill ${riskCopy[offer.risk].className}`}>{riskCopy[offer.risk].label}</span></TableCell>
              <TableCell className="text-right"><PurchaseDialog offer={offer} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ComparisonGrid() {
  const items = [
    { label: "账号归属", plus: "商家提供账号，归属链不透明", business: "使用自己的账号加入他人工作区" },
    { label: "最大风险", plus: "邮箱找回、共享挤号、风控封禁", business: "工作区所有者可随时移除席位" },
    { label: "隐私边界", plus: "历史会话可能留在交付账号内", business: "工作区数据受管理员设置约束" },
    { label: "稳定性", plus: "取决于账号来源与续费方式", business: "取决于工作区持续付费与管理员" },
    { label: "适合谁", plus: "只建议短期、低敏感用途", business: "真正同组织且需要协作的成员" },
    { label: "本站结论", plus: "高风险；优先本人账号官方订阅", business: "非自有组织席位同样高风险" },
  ];

  return (
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
  );
}

function MethodPanel() {
  const steps = [
    { n: "01", title: "实时拉取公开商品页", text: "点击刷新后由服务端重新请求，拒绝使用浏览器旧缓存。" },
    { n: "02", title: "价格与下单信号解析", text: "必须识别商品名称、明确价格以及可购买入口。" },
    { n: "03", title: "库存双信号核验", text: "第三方商品只有“库存大于 0”与“购买按钮可用”同时出现才标记有货。" },
    { n: "04", title: "写入长期价格档案", text: "每次核验保存快照，历史最低价只来自本站真实记录。" },
  ];
  return (
    <div className="method-grid">
      {steps.map((step) => <article className="method-card" key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}
      <aside className="method-note"><CircleAlert /><div><strong>“监测全部商家”有明确边界</strong><p>本站只覆盖已登记且允许公开访问的商品页。登录、验证码、反爬或页面结构变化都会降级为“无法确认”，不会猜测库存。</p></div></aside>
    </div>
  );
}

function DashboardSkeleton() {
  return <div className="skeleton-stack"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
}

export function RadarDashboard() {
  const [data, setData] = useState<MonitorPayload>({ mode: "snapshot", checkedAt: null, offers: waitingOffers, coverage: { total: waitingOffers.length, verified: 0, failed: waitingOffers.length } });
  const [filter, setFilter] = useState<"all" | ProductType>("all");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  async function loadSnapshot() {
    try {
      const response = await fetch("/api/monitor", { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot unavailable");
      const payload = (await response.json()) as MonitorPayload;
      if (payload.offers?.length) setData(payload);
    } catch {
      // Keep the explicit waiting state when the server has no snapshot yet.
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => { void loadSnapshot(); }, []);

  async function refreshLive() {
    setLoading(true);
    const toastId = toast.loading("正在逐站核验价格、库存与下单入口…");
    try {
      const response = await fetch("/api/monitor", { method: "POST", cache: "no-store" });
      const payload = (await response.json()) as MonitorPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "实时核验失败");
      setData(payload);
      toast.success(`核验完成：${payload.coverage.verified}/${payload.coverage.total} 个来源可确认`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "实时核验失败", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  const offers = useMemo(() => {
    const selected = filter === "all" ? data.offers : data.offers.filter((item) => item.productType === filter);
    return [...selected].sort((a, b) => {
      const aAvailable = a.stockStatus === "in_stock" && ["double_signal", "official"].includes(a.verification);
      const bAvailable = b.stockStatus === "in_stock" && ["double_signal", "official"].includes(b.verification);
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
      return (a.priceCny ?? Number.POSITIVE_INFINITY) - (b.priceCny ?? Number.POSITIVE_INFINITY);
    });
  }, [data.offers, filter]);

  const thirdPartyBest = data.offers.filter((item) => !item.isOfficial && item.stockStatus === "in_stock" && item.verification === "double_signal" && item.priceCny != null).sort((a, b) => (a.priceCny ?? 0) - (b.priceCny ?? 0))[0];
  const historicalBest = data.offers.filter((item) => !item.isOfficial && item.historicalLowCny != null).sort((a, b) => (a.historicalLowCny ?? 0) - (b.historicalLowCny ?? 0))[0];

  return (
    <TooltipProvider>
      <main className="site-shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="链动小铺首页"><span className="brand-glyph"><ScanSearch /></span><span><strong>链动小铺</strong><small>AI PRICE SIGNAL</small></span></a>
          <div className="topbar-status"><span className="live-dot" /><span>公开源监测</span><span className="status-separator" />{dateTime(data.checkedAt)}</div>
          <Button onClick={refreshLive} disabled={loading} className="refresh-button">{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{loading ? "正在核验" : "立即实时核验"}</Button>
        </header>

        <div id="top" className="content-wrap">
          <section className="intro-row">
            <div><p className="eyebrow"><Activity /> CHATGPT 市场监测台</p><h1>只展示<span>能核验</span>的低价。</h1><p>比较 ChatGPT Plus 成品账号与 Business（原 Team）席位。库存不明、入口失效或页面被拦截，一律不标记“可购买”。</p></div>
            <div className="trust-note"><ShieldCheck /><div><strong>核验规则</strong><span>价格 + 库存 + 下单入口</span></div></div>
          </section>

          <section className="metric-grid" aria-label="市场概览">
            <article className="metric-card"><div className="metric-icon"><Store /></div><span>监测来源</span><strong>{data.coverage.total}<small> 个</small></strong><p>官方与公开商家页</p></article>
            <article className="metric-card"><div className="metric-icon green"><PackageCheck /></div><span>可信有货</span><strong>{data.coverage.verified}<small> 个</small></strong><p>{data.coverage.verified ? "已通过本轮核验" : "等待实时核验"}</p></article>
            <article className="metric-card metric-dark"><div className="metric-icon inverse"><ShoppingBag /></div><span>当前第三方低价</span><strong>{thirdPartyBest ? money(thirdPartyBest) : "—"}</strong><p>{thirdPartyBest ? `${thirdPartyBest.merchant} · 已确认有货` : "暂无可信可购报价"}</p></article>
            <article className="metric-card"><div className="metric-icon amber"><ArrowDownRight /></div><span>长期最低记录</span><strong>{historicalBest?.historicalLowCny == null ? "—" : `¥${historicalBest.historicalLowCny.toFixed(2)}`}</strong><p>{historicalBest ? `${historicalBest.merchant} · 本站档案` : "首次核验后开始累计"}</p></article>
          </section>

          <section className="terminal-panel">
            <div className="panel-head">
              <div><p className="eyebrow"><span className="live-dot" /> LIVE MARKET</p><h2>实时价格雷达</h2></div>
              <div className="filter-group" aria-label="商品筛选">{(["all", "plus", "business"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={filter === value ? "active" : ""}>{value === "all" ? "全部" : value === "plus" ? "Plus" : "Business / Team"}</button>)}</div>
            </div>

            <Tabs defaultValue="market" className="dashboard-tabs">
              <TabsList variant="line" className="dashboard-tab-list"><TabsTrigger value="market">商家行情</TabsTrigger><TabsTrigger value="compare">账号差异</TabsTrigger><TabsTrigger value="method">核验方法</TabsTrigger></TabsList>
              <TabsContent value="market">{initialLoading ? <DashboardSkeleton /> : <OfferTable offers={offers} />}<div className="table-foot"><span><Info />价格仅来自公开商品页，不含优惠码、税费和汇率滑点。</span><span>最后核验：{dateTime(data.checkedAt)}</span></div></TabsContent>
              <TabsContent value="compare"><ComparisonGrid /></TabsContent>
              <TabsContent value="method"><MethodPanel /></TabsContent>
            </Tabs>
          </section>

          <section className="safety-strip">
            <div className="safety-icon"><ShieldAlert /></div><div><p className="eyebrow">购买前必须知道</p><h2>低价不等于低风险。</h2></div>
            <p>OpenAI 条款禁止共享账号凭据。第三方成品号、共享号或转售席位可能失效；本站把风险信息与价格放在同一层级，不为任何商家背书。</p>
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
