"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { SkeletonKpiRow } from "@/components/ui/skeleton";
import { bannerConfig } from "@/components/ModuleBanner";
import { useProjectsStore } from "@/components/module1/lib/store";
import { computeProjectBoq } from "@/components/module1/lib/boq";
import { brand } from "@/lib/brand";
import type { ModuleId } from "@/lib/modules";
import { formatAED, cn } from "@/lib/utils";
import {
  aiUsageTrend,
  cashflowTrend,
  portfolioBudget,
  portfolioSites,
  scheduleHealthTrend,
  sectorMix,
  siteRiskHeatmap,
  tradeWorkload,
  type PortfolioSite,
} from "./lib/data";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  HardHat,
  MapPin,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface ExecutiveDashboardProps {
  onNavigate: (module: ModuleId) => void;
}

type Tone = "primary" | "gold" | "warning" | "destructive";
type SortKey = "name" | "progress" | "budgetM" | "scheduleHealth" | "risk";

const TONE_STYLES: Record<
  Tone,
  { stripe: string; chip: string; badge: "secondary" | "success" | "warning" | "destructive" | "gold" }
> = {
  primary: { stripe: "bg-primary", chip: "bg-primary/10 text-primary", badge: "success" },
  gold: { stripe: "bg-gold", chip: "bg-gold/15 text-gold-foreground dark:text-gold", badge: "gold" },
  warning: { stripe: "bg-amber-500", chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400", badge: "warning" },
  destructive: { stripe: "bg-destructive", chip: "bg-destructive/10 text-destructive", badge: "destructive" },
};

const RISK_ORDER = { Low: 0, Medium: 1, High: 2 } as const;

function heatColor(v: number) {
  // Cool teal → slate-teal accent → alert red — denser fills to match other chart optics
  if (v < 25) return `rgba(0, 90, 112, ${0.42 + v / 90})`;
  if (v < 50) return `rgba(10, 122, 150, ${0.52 + (v - 25) / 70})`;
  if (v < 70) return `rgba(61, 139, 154, ${0.62 + (v - 50) / 55})`;
  return `rgba(220, 68, 55, ${0.68 + (v - 70) / 70})`;
}

/** Reveal gate — charts remount + numbers count up when the card becomes visible. */
const RevealMotionContext = createContext({ shown: true, playId: 0, chartsReady: true });

function useRevealMotion() {
  return useContext(RevealMotionContext);
}

function BlurReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [playId, setPlayId] = useState(0);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(true);
      setChartsReady(true);
      setPlayId((n) => n + 1);
      return;
    }
    let timer: number | undefined;
    let readyTimer: number | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.unobserve(el);
        timer = window.setTimeout(() => {
          requestAnimationFrame(() => {
            setShown(true);
            setChartsReady(false);
            // Wait for blur-reveal to settle so Recharts measures real size and animates visibly.
            readyTimer = window.setTimeout(() => {
              setChartsReady(true);
              setPlayId((n) => n + 1);
            }, 720);
          });
        }, delay);
      },
      { threshold: 0.06, rootMargin: "0px 0px -4% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) window.clearTimeout(timer);
      if (readyTimer) window.clearTimeout(readyTimer);
    };
  }, [delay]);

  return (
    <RevealMotionContext.Provider value={{ shown, playId, chartsReady }}>
      <div ref={ref} className={cn("blur-reveal", shown && "blur-reveal-in", className)}>
        {children}
      </div>
    </RevealMotionContext.Provider>
  );
}

/** Remount charts after reveal settles so lines/bars/pie draw in real time. */
function RevealViz({ className, children }: { className?: string; children: React.ReactNode }) {
  const { chartsReady, playId } = useRevealMotion();
  if (!chartsReady) return <div className={cn("h-full w-full min-h-0", className)} aria-hidden />;
  return (
    <div key={`viz-${playId}`} className={cn("h-full w-full min-h-0", className)}>
      {children}
    </div>
  );
}

function parseDisplayNumber(raw: string): { prefix: string; target: number; decimals: number; suffix: string } | null {
  const m = String(raw).trim().match(/^(.*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const num = Number(String(m[2]).replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const decimals = (String(m[2]).split(".")[1] || "").length;
  return { prefix: m[1], target: num, decimals, suffix: m[3] };
}

function formatCounted(n: number, decimals: number) {
  const fixed = decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
  if (decimals > 0) return fixed;
  return Math.round(n).toLocaleString("en-US");
}

/** Numeric count-up synced to the card reveal. */
function CountUpValue({
  value,
  className,
  duration = 1100,
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const { shown, playId } = useRevealMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    setDisplay(value);
  }, [value]);

  useEffect(() => {
    if (!shown) return;
    const parsed = parseDisplayNumber(value);
    if (!parsed) {
      setDisplay(value);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(`${parsed.prefix}${formatCounted(parsed.target * eased, parsed.decimals)}${parsed.suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, playId, value, duration]);

  return <span className={className}>{display}</span>;
}

/** Progress fill that grows from 0 after reveal. */
function RevealProgress({
  pct,
  className,
  style,
}: {
  pct: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { chartsReady } = useRevealMotion();
  return (
    <div
      className={className}
      style={{
        ...style,
        width: chartsReady ? `${Math.max(0, Math.min(100, pct))}%` : "0%",
        transition: "width 1.05s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    />
  );
}

function HeatCell({
  value,
  staggerMs,
  onEnter,
  onLeave,
  onFocus,
  onBlur,
}: {
  value: number;
  staggerMs: number;
  onEnter: (e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>) => void;
  onLeave: () => void;
  onFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onBlur: () => void;
}) {
  const { chartsReady } = useRevealMotion();
  return (
    <button
      type="button"
      className="relative h-full min-h-9 rounded-md border border-transparent transition-all duration-150 hover:scale-[1.04] hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        backgroundColor: heatColor(value),
        opacity: chartsReady ? 1 : 0,
        transform: chartsReady ? "scale(1)" : "scale(0.82)",
        transition: `opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${staggerMs}ms, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${staggerMs}ms, background-color 150ms ease`,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

function KpiCard({
  label,
  value,
  change,
  tone,
  trend = "up",
  icon: _Icon,
  hint,
  chart,
  chartLabel,
  valueSuffix = "",
}: {
  label: string;
  value: string;
  change: string;
  tone: Tone;
  trend?: "up" | "down" | "flat";
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  chart?: { month: string; value: number }[];
  chartLabel?: string;
  valueSuffix?: string;
}) {
  const t = TONE_STYLES[tone];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const stroke = tone === "gold" ? brand.gold : tone === "warning" ? "#d97706" : brand.teal;
  const gradId = `kpi-spark-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <Card
      className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
      title={hint}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07] transition-transform duration-500 group-hover:scale-125"
        style={{ background: `radial-gradient(circle, ${tone === "gold" ? brand.gold : brand.teal}, transparent 70%)` }}
      />
      <CardContent className="relative p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="tnum mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  <CountUpValue value={value} />
                </p>
              </div>
            </div>
            <Badge variant={t.badge} className="mt-2.5 h-5 gap-1 text-[10px]">
              <TrendIcon className="h-3 w-3" />
              {change}
            </Badge>
          </div>
          {chart && chart.length > 0 && (
            <div ref={chartRef} className="h-[4.25rem] w-[42%] min-w-[6.5rem] max-w-[11rem] shrink-0 self-center">
              <RevealViz className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 6, right: 2, left: 2, bottom: 2 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" hide />
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip
                    cursor={{ stroke: stroke, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.45 }}
                    allowEscapeViewBox={{ x: true, y: true }}
                    wrapperStyle={{ display: "none" }}
                    content={({ active, payload, label: tipLabel, coordinate }) => {
                      if (!active || !payload?.length || !coordinate || !chartRef.current) return null;
                      const p = payload[0];
                      const rect = chartRef.current.getBoundingClientRect();
                      const tipW = 128;
                      const rawLeft = rect.left + coordinate.x + 14;
                      const flipX = rawLeft + tipW > window.innerWidth - 8;
                      const left = flipX ? rect.left + coordinate.x - 14 : rawLeft;
                      const top = Math.max(8, rect.top + coordinate.y - 10);
                      return createPortal(
                        <div
                          className="pointer-events-none fixed z-[200] rounded-md border border-border/80 bg-popover px-2 py-1 shadow-md"
                          style={{
                            left,
                            top,
                            transform: flipX ? "translate(-100%, -100%)" : "translateY(-100%)",
                          }}
                        >
                          <p className="text-[10px] font-semibold leading-none text-foreground">{tipLabel}</p>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] leading-none">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color || stroke }} />
                            <span className="text-muted-foreground">{p.name}</span>
                            <span className="tnum font-semibold text-foreground">
                              {p.value}
                              {valueSuffix}
                            </span>
                          </div>
                        </div>,
                        document.body
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={chartLabel ?? label}
                    stroke={stroke}
                    fill={`url(#${gradId})`}
                    strokeWidth={2.25}
                    animationDuration={1100}
                    animationEasing="ease-out"
                    animationBegin={80}
                    dot={false}
                    activeDot={{
                      r: 4.5,
                      fill: stroke,
                      stroke: "hsl(var(--card))",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              </RevealViz>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function statusBadge(status: PortfolioSite["status"]) {
  if (status === "On track") return <Badge variant="success" className="text-[9px]">On track</Badge>;
  if (status === "Watch") return <Badge variant="warning" className="text-[9px]">Watch</Badge>;
  return <Badge variant="destructive" className="text-[9px]">Delayed</Badge>;
}

function riskBadge(risk: PortfolioSite["risk"]) {
  if (risk === "Low") return <Badge variant="success" className="text-[9px]">Low</Badge>;
  if (risk === "Medium") return <Badge variant="warning" className="text-[9px]">Medium</Badge>;
  return <Badge variant="destructive" className="text-[9px]">High</Badge>;
}

export default function ExecutiveDashboard({ onNavigate: _onNavigate }: ExecutiveDashboardProps) {
  const store = useProjectsStore();
  const [sortKey, setSortKey] = useState<SortKey>("progress");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [heatHover, setHeatHover] = useState<{
    site: string;
    month: string;
    value: number;
    x?: number;
    y?: number;
  } | null>(null);
  const [activePie, setActivePie] = useState<number | null>(null);
  const [mixView, setMixView] = useState<"sector" | "budget">("sector");

  const portfolioStats = useMemo(() => {
    if (!store.ready) return { count: 0, total: 0 };
    const total = store.projects.reduce((sum, p) => sum + computeProjectBoq(p).total, 0);
    return { count: store.projects.length, total };
  }, [store.projects, store.ready]);

  const siteStats = useMemo(() => {
    const budget = portfolioSites.reduce((n, s) => n + s.budgetM, 0);
    const spent = portfolioSites.reduce((n, s) => n + s.spentM, 0);
    const avgHealth = Math.round(portfolioSites.reduce((n, s) => n + s.scheduleHealth, 0) / portfolioSites.length);
    return { budget, spent, avgHealth, sites: portfolioSites.length };
  }, []);

  const aiUsage = useMemo(() => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return aiUsageTrend.map((value, i) => ({ day: labels[i] ?? `D${i + 1}`, value }));
  }, []);

  const kpiSparks = useMemo(() => {
    const sites = siteRiskHeatmap.months.map((month, i) => ({
      month,
      value: siteRiskHeatmap.rows.filter((row) => (row.values[i] ?? 100) < 65).length,
    }));
    const portfolio = cashflowTrend.map((d) => ({ month: d.month, value: d.certified }));
    const schedule = scheduleHealthTrend.map((d) => ({ month: d.month, value: d.health }));
    return { sites, portfolio, schedule };
  }, []);

  const filteredSites = useMemo(() => {
    const list = [...portfolioSites];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "risk") cmp = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const selected = selectedSite ? portfolioSites.find((s) => s.id === selectedSite) : null;
  const chartBudget = selected
    ? [{ project: selected.short, budget: selected.budgetM, spent: selected.spentM, forecast: selected.forecastM }]
    : portfolioBudget;

  return (
    <div className="animate-dashboard-pop space-y-4">
      {/* KPI row — live takeoff + ADICC portfolio pulse */}
      {!store.ready ? (
        <SkeletonKpiRow />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <BlurReveal delay={0}>
            <KpiCard
              label="Active sites"
              value={String(Math.max(portfolioStats.count, siteStats.sites))}
              change={`${siteStats.sites} ADICC sites tracked`}
              tone="primary"
              trend="up"
              icon={Building2}
              hint="Live takeoff projects plus ADICC Abu Dhabi portfolio sites"
              chart={kpiSparks.sites}
              chartLabel="Active sites"
            />
          </BlurReveal>
          <BlurReveal delay={160}>
            <KpiCard
              label="Portfolio value"
              value={portfolioStats.total > 0 ? formatAED(Math.round(portfolioStats.total)) : `AED ${siteStats.budget}M`}
              change={portfolioStats.total > 0 ? "From live BOQ data" : `${siteStats.spent}M spent of ${siteStats.budget}M`}
              tone="gold"
              trend="up"
              icon={Wallet}
              chart={kpiSparks.portfolio}
              chartLabel="Certified"
              valueSuffix=" M"
            />
          </BlurReveal>
          <BlurReveal delay={320}>
            <KpiCard
              label="Schedule reliability"
              value={`${siteStats.avgHealth}%`}
              change={bannerConfig.schedule.kpis[0].value}
              tone="warning"
              trend="down"
              icon={HardHat}
              hint="Average SPI-style reliability across ADICC sites"
              chart={kpiSparks.schedule}
              chartLabel="Reliability"
              valueSuffix="%"
            />
          </BlurReveal>
        </div>
      )}

      {selected && (
        <BlurReveal delay={40}>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedSite(null)}
              className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold-foreground dark:text-gold"
            >
              Clear site focus · {selected.short}
            </button>
          </div>
        </BlurReveal>
      )}

      {/* Line graphs above; other charts below */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
        <BlurReveal delay={0} className="h-full">
        <Card className="h-full overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Certified Cashflow Vs Plan</CardTitle>
            <CardDescription>Monthly certified amounts, planned draws & claims exposure (AED M)</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-56 w-full">
              <RevealViz className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashflowTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="certGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.teal} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={brand.teal} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueSuffix=" M" />} cursor={{ stroke: "hsl(var(--border))" }} />
                  <Area
                    type="monotone"
                    dataKey="certified"
                    name="Certified"
                    stroke={brand.teal}
                    fill="url(#certGrad)"
                    strokeWidth={2.5}
                    animationDuration={1100}
                    animationEasing="ease-out"
                    animationBegin={60}
                    dot={{ r: 3, fill: brand.teal, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: brand.teal, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="planned"
                    name="Planned"
                    stroke={brand.tealLight}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    animationDuration={1200}
                    animationEasing="ease-out"
                    animationBegin={140}
                    dot={false}
                  />
                  <Bar dataKey="claims" name="Claims" fill={brand.gold} radius={[3, 3, 0, 0]} maxBarSize={18} animationDuration={1000} animationEasing="ease-out" animationBegin={200} />
                </ComposedChart>
              </ResponsiveContainer>
              </RevealViz>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
              {[
                ["Certified", brand.teal],
                ["Planned", brand.tealLight],
                ["Claims", brand.gold],
              ].map(([name, color]) => (
                <span key={name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        </BlurReveal>

        <BlurReveal delay={160} className="h-full">
        <Card className="h-full overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Schedule Health</CardTitle>
            <CardDescription>Reliability % & critical-path items</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-56 w-full">
              <RevealViz className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={scheduleHealthTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={brand.teal} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={brand.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="l" domain={[75, 95]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    yAxisId="l"
                    type="monotone"
                    dataKey="health"
                    name="Reliability %"
                    stroke={brand.teal}
                    fill="url(#healthGrad)"
                    strokeWidth={2.5}
                    animationDuration={1100}
                    animationEasing="ease-out"
                    animationBegin={60}
                    activeDot={{ r: 5, fill: brand.teal, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  />
                  <Bar yAxisId="r" dataKey="critical" name="Critical items" fill={brand.gold} radius={[3, 3, 0, 0]} maxBarSize={14} animationDuration={1000} animationEasing="ease-out" animationBegin={160} />
                </ComposedChart>
              </ResponsiveContainer>
              </RevealViz>
            </div>
          </CardContent>
        </Card>
        </BlurReveal>

        <BlurReveal delay={320} className="h-full">
        <Card className="h-full overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Platform Queries</CardTitle>
            <CardDescription>Daily volume across estimation · contracts · schedule · docs</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-56 w-full">
              <RevealViz className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aiUsage} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="queryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.gold} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={brand.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Queries"
                    stroke={brand.gold}
                    fill="url(#queryGrad)"
                    strokeWidth={2.5}
                    animationDuration={1100}
                    animationEasing="ease-out"
                    animationBegin={60}
                    activeDot={{ r: 5, fill: brand.gold, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              </RevealViz>
            </div>
          </CardContent>
        </Card>
        </BlurReveal>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BlurReveal delay={0} className="h-full min-h-0">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-0 p-4 pb-2">
            <div
              role="tablist"
              aria-label="Portfolio view"
              className="mb-2.5 inline-flex w-full rounded-lg border border-border/70 bg-muted/40 p-0.5"
            >
              {(
                [
                  ["sector", "Sector"],
                  ["budget", "Budget"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mixView === id}
                  onClick={() => setMixView(id)}
                  className={cn(
                    "flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200",
                    mixView === id
                      ? "bg-card text-primary shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {mixView === "sector" && (
              <>
                <CardTitle className="text-base">Sector Mix</CardTitle>
                <CardDescription>Portfolio value by ADICC workstream (AED M)</CardDescription>
              </>
            )}
            {mixView === "budget" && (
              <>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {selected && (
                    <Badge variant="gold" className="text-[10px]">
                      {selected.short}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base">
                  Site Budget Vs Spent{selected ? ` · ${selected.short}` : ""}
                </CardTitle>
                <CardDescription>
                  {selected
                    ? `${selected.name} — select another site row to refocus`
                    : "Budget · spent · forecast (AED M)"}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <div className="relative h-56 w-full">
              <RevealViz className="relative h-full w-full">
              {mixView === "sector" && (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorMix}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                        isAnimationActive
                        animationDuration={1400}
                        animationEasing="ease-out"
                        animationBegin={80}
                        onMouseEnter={(_, i) => setActivePie(i)}
                        onMouseLeave={() => setActivePie(null)}
                      >
                        {sectorMix.map((entry, i) => (
                          <Cell
                            key={entry.name}
                            fill={entry.color}
                            stroke="hsl(var(--card))"
                            strokeWidth={2}
                            style={{
                              filter: activePie === i ? "brightness(1.08)" : undefined,
                              transform: activePie === i ? "scale(1.03)" : undefined,
                              transformOrigin: "center",
                              transition: "transform 180ms ease",
                              cursor: "pointer",
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip valueSuffix=" M" />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 flex flex-col items-center justify-center",
                      activePie != null && "opacity-0"
                    )}
                  >
                    <span className="tnum text-lg font-semibold text-foreground">
                      <CountUpValue value={String(siteStats.budget)} />
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">AED M</span>
                  </div>
                </>
              )}
              {mixView === "budget" && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartBudget} margin={{ top: 4, right: 8, left: -18, bottom: 28 }} barGap={2}>
                    <defs>
                      <linearGradient id="budgetBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={brand.teal} stopOpacity={1} />
                        <stop offset="100%" stopColor={brand.teal} stopOpacity={0.65} />
                      </linearGradient>
                      <linearGradient id="spentBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={brand.tealLight} stopOpacity={1} />
                        <stop offset="100%" stopColor={brand.tealLight} stopOpacity={0.65} />
                      </linearGradient>
                      <linearGradient id="forecastBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={brand.gold} stopOpacity={1} />
                        <stop offset="100%" stopColor={brand.gold} stopOpacity={0.65} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="project" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={56} dy={6} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip valueSuffix=" M" />} cursor={{ fill: "hsl(var(--muted) / 0.45)" }} />
                    <Bar dataKey="budget" fill="url(#budgetBar)" radius={[3, 3, 0, 0]} name="Budget" maxBarSize={18} animationDuration={1000} animationEasing="ease-out" animationBegin={40} />
                    <Bar dataKey="spent" fill="url(#spentBar)" radius={[3, 3, 0, 0]} name="Spent" maxBarSize={18} animationDuration={1100} animationEasing="ease-out" animationBegin={120} />
                    <Bar dataKey="forecast" fill="url(#forecastBar)" radius={[3, 3, 0, 0]} name="Forecast" maxBarSize={18} animationDuration={1200} animationEasing="ease-out" animationBegin={200} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              </RevealViz>
            </div>
            <div className="mt-1 grid grid-cols-2 content-start gap-x-2 gap-y-1.5 px-3 text-[10px] leading-snug text-muted-foreground">
              {mixView === "sector" &&
                sectorMix.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 truncate">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                ))}
              {mixView === "budget" &&
                (
                  [
                    ["Budget", brand.teal],
                    ["Spent", brand.tealLight],
                    ["Forecast", brand.gold],
                  ] as const
                ).map(([name, color]) => (
                  <span key={name} className="flex items-center gap-1.5 truncate">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    {name}
                  </span>
                ))}
            </div>
          </CardContent>
        </Card>
        </BlurReveal>

        <BlurReveal delay={160} className="h-full min-h-0">
        <Card className="flex h-full min-h-0 flex-col">
        <CardHeader className="shrink-0 p-4 pb-2">
          <div>
            <CardTitle className="text-base">Site Delay-Risk Heatmap</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-x-auto px-4 pb-4">
          <div className="flex min-h-0 min-w-[520px] flex-1 flex-col">
            <div
              className="grid min-h-0 flex-1 gap-1"
              style={{
                gridTemplateColumns: `7.5rem repeat(${siteRiskHeatmap.months.length}, minmax(0, 1fr))`,
                gridTemplateRows: `auto repeat(${siteRiskHeatmap.rows.length}, minmax(0, 1fr))`,
              }}
            >
              <div />
              {siteRiskHeatmap.months.map((m) => (
                <div key={m} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {m}
                </div>
              ))}
              {siteRiskHeatmap.rows.map((row) => (
                <div key={row.site} className="contents">
                  <div className="flex items-center truncate pr-2 text-[11px] font-medium text-foreground">{row.site}</div>
                  {row.values.map((v, i) => {
                    const month = siteRiskHeatmap.months[i];
                    const rowIdx = siteRiskHeatmap.rows.findIndex((r) => r.site === row.site);
                    return (
                      <HeatCell
                        key={`${row.site}-${month}`}
                        value={v}
                        staggerMs={(rowIdx * siteRiskHeatmap.months.length + i) * 28}
                        onEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setHeatHover({
                            site: row.site,
                            month,
                            value: v,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onLeave={() => setHeatHover(null)}
                        onFocus={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setHeatHover({
                            site: row.site,
                            month,
                            value: v,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onBlur={() => setHeatHover(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            {heatHover && heatHover.x != null && heatHover.y != null &&
              createPortal(
                <div
                  className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md border border-border/80 bg-card px-2.5 py-1.5 text-[11px] shadow-lg"
                  style={{ left: heatHover.x, top: heatHover.y }}
                  role="tooltip"
                >
                  <span className="font-semibold text-foreground">{heatHover.site}</span>
                  <span className="text-muted-foreground"> · {heatHover.month} · </span>
                  <span className="tnum font-semibold text-foreground">{heatHover.value}</span>
                  <span className="text-muted-foreground"> risk index</span>
                </div>,
                document.body
              )}
            <div className="mt-3 flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
              <span>Low</span>
              <div className="flex h-2 flex-1 overflow-hidden rounded-full">
                {[12, 28, 45, 62, 78, 90].map((v) => (
                  <div key={v} className="flex-1" style={{ backgroundColor: heatColor(v) }} />
                ))}
              </div>
              <span>High</span>
            </div>
          </div>
        </CardContent>
        </Card>
        </BlurReveal>

        <BlurReveal delay={320} className="h-full min-h-0">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 p-4 pb-2">
            <CardTitle className="text-base">Trade Packages</CardTitle>
            <CardDescription>Open vs closed items across sites</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="min-h-0 w-full flex-1">
              <RevealViz className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradeWorkload} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="trade" width={64} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="closed" name="Closed" stackId="a" fill={brand.teal} radius={[0, 0, 0, 0]} animationDuration={1000} animationEasing="ease-out" animationBegin={40} />
                  <Bar dataKey="open" name="Open" stackId="a" fill={brand.gold} radius={[0, 4, 4, 0]} animationDuration={1150} animationEasing="ease-out" animationBegin={140} />
                </BarChart>
              </ResponsiveContainer>
              </RevealViz>
            </div>
          </CardContent>
        </Card>
        </BlurReveal>
      </div>

      {/* Interactive sites table */}
      <BlurReveal delay={80}>
      <Card className="overflow-hidden">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">ADICC Construction Sites</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <thead>
                <tr className="border-y border-border/60 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {(
                    [
                      ["name", "Project"],
                      ["progress", "Progress"],
                      ["budgetM", "Budget"],
                      ["scheduleHealth", "SPI"],
                      ["risk", "Risk"],
                    ] as const
                  ).map(([key, label]) => (
                    <th key={key} className="px-4 py-2.5 font-semibold">
                      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {label} <SortIcon k={key} />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Location</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((site) => {
                  const on = selectedSite === site.id;
                  return (
                    <tr
                      key={site.id}
                      onClick={() => setSelectedSite(on ? null : site.id)}
                      className={cn(
                        "cursor-pointer border-b border-border/40 transition-colors duration-150 last:border-0",
                        on ? "bg-primary/[0.07]" : "hover:bg-muted/40"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{site.name}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{site.sector} · {site.client}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <RevealProgress
                              pct={site.progress}
                              className="h-full rounded-full"
                              style={{
                                background: `linear-gradient(90deg, ${brand.teal}, ${brand.gold})`,
                              }}
                            />
                          </div>
                          <span className="tnum text-[11px] font-medium">
                            <CountUpValue value={`${site.progress}%`} duration={1000} />
                          </span>
                        </div>
                      </td>
                      <td className="tnum px-4 py-3 font-medium text-foreground">
                        <CountUpValue value={String(site.spentM)} duration={1000} />
                        /
                        <CountUpValue value={String(site.budgetM)} duration={1000} />
                        <span className="text-muted-foreground"> M</span>
                      </td>
                      <td className="tnum px-4 py-3 font-medium">
                        <CountUpValue value={`${site.scheduleHealth}%`} duration={1000} />
                      </td>
                      <td className="px-4 py-3">{riskBadge(site.risk)}</td>
                      <td className="px-4 py-3">{statusBadge(site.status)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
                          {site.location}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredSites.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No sites in this sector.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </BlurReveal>

      <BlurReveal delay={200}>
      <p className="pb-1 text-center text-[10px] text-muted-foreground/80">
        ADICC · Abu Dhabi International Contracting Company · founded 1989 · portfolio analytics for estimation, schedule & contracts
      </p>
      </BlurReveal>
    </div>
  );
}
