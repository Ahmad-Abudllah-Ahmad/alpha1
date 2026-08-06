"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { SkeletonKpiRow } from "@/components/ui/skeleton";
import { MiniDonut } from "@/components/ModuleBanner";
import { bannerConfig } from "@/components/ModuleBanner";
import { useRole } from "@/components/RoleProvider";
import { useProjectsStore } from "@/components/module1/lib/store";
import { computeProjectBoq } from "@/components/module1/lib/boq";
import { brand } from "@/lib/brand";
import type { ModuleId } from "@/lib/modules";
import { formatAED } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  aiUsageTrend,
  portfolioActivity,
  moduleStatusCards,
  portfolioBudget,
  riskSeveritySlices,
  scheduleHealthTrend,
} from "./lib/data";
import {
  ArrowRight,
  Calculator,
  FileText,
  MessageSquare,
  Minus,
  Plus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface ExecutiveDashboardProps {
  onNavigate: (module: ModuleId) => void;
}

type Tone = "primary" | "gold" | "warning" | "destructive";

const TONE_STYLES: Record<
  Tone,
  { stripe: string; chip: string; badge: "secondary" | "success" | "warning" | "destructive" | "gold" }
> = {
  primary: { stripe: "bg-primary", chip: "bg-primary/10 text-primary", badge: "success" },
  gold: { stripe: "bg-gold", chip: "bg-gold/15 text-gold-foreground dark:text-gold", badge: "gold" },
  warning: { stripe: "bg-amber-500", chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400", badge: "warning" },
  destructive: { stripe: "bg-destructive", chip: "bg-destructive/10 text-destructive", badge: "destructive" },
};

function KpiCard({
  label,
  value,
  change,
  tone,
  trend = "up",
  icon: Icon,
}: {
  label: string;
  value: string;
  change: string;
  tone: Tone;
  trend?: "up" | "down" | "flat";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const t = TONE_STYLES[tone];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <Card className="group relative overflow-hidden hover:border-primary/25">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", t.stripe)} />
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="tnum mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{value}</p>
          </div>
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105", t.chip)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <Badge variant={t.badge} className="mt-2 h-5 gap-1 text-[10px]">
          <TrendIcon className="h-3 w-3" />
          {change}
        </Badge>
      </CardContent>
    </Card>
  );
}

export default function ExecutiveDashboard({ onNavigate }: ExecutiveDashboardProps) {
  const store = useProjectsStore();
  const { can } = useRole();

  const portfolioStats = useMemo(() => {
    if (!store.ready) return { count: 0, total: 0 };
    const total = store.projects.reduce((sum, p) => sum + computeProjectBoq(p).total, 0);
    return { count: store.projects.length, total };
  }, [store.projects, store.ready]);

  const aiUsage = useMemo(() => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return aiUsageTrend.map((value, i) => ({ day: labels[i] ?? `D${i + 1}`, value }));
  }, []);

  const recentActivity = useMemo(() => {
    const projectActivity = store.projects.slice(0, 3).map((p) => ({
      id: p.id,
      time: new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      module: "estimation" as ModuleId,
      title: p.name,
      detail: `${p.floors.length} floor${p.floors.length === 1 ? "" : "s"} · ${formatAED(Math.round(computeProjectBoq(p).total))}`,
      variant: "success" as const,
    }));
    return [...projectActivity, ...portfolioActivity].slice(0, 6);
  }, [store.projects]);

  return (
    <div className="space-y-4">
      {/* Welcome header */}
      <div className="surface-card relative overflow-hidden">
        <div className="relative flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">ADICC Construction Platform</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Executive Portfolio Overview
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Real-time visibility across estimation, contracts, scheduling, and document intelligence.
            </p>
          </div>
          {can("quick_actions") && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
              <Button size="sm" className="w-full lg:w-auto" onClick={() => onNavigate("estimation")} disabled={!can("create_project")}>
                <Plus className="h-4 w-4" /> New Project
              </Button>
              <Button size="sm" variant="outline" className="w-full lg:w-auto" onClick={() => onNavigate("contracts")} disabled={!can("upload_contract")}>
                <FileText className="h-4 w-4" /> Upload Contract
              </Button>
              <Button size="sm" variant="outline" className="w-full lg:w-auto" onClick={() => onNavigate("contracts")}>
                <MessageSquare className="h-4 w-4" /> Knowledge Base
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* KPI row */}
      {!store.ready ? (
        <SkeletonKpiRow />
      ) : (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Active Projects"
          value={String(portfolioStats.count)}
          change={`${portfolioStats.count > 0 ? "+" : ""}${portfolioStats.count} in portfolio`}
          tone="primary"
          trend={portfolioStats.count > 0 ? "up" : "flat"}
          icon={Calculator}
        />
        <KpiCard
          label="Portfolio Value"
          value={formatAED(Math.round(portfolioStats.total))}
          change="From live BOQ data"
          tone="gold"
          trend="up"
          icon={Wallet}
        />
        <KpiCard
          label="Schedule Reliability"
          value={bannerConfig.schedule.kpis[1].value}
          change={bannerConfig.schedule.kpis[0].value}
          tone="warning"
          trend="down"
          icon={TrendingDown}
        />
        <KpiCard
          label="Contract Risks"
          value={bannerConfig.contracts.kpis[0].value}
          change={`${bannerConfig.contracts.kpis[2].value} high severity`}
          tone="destructive"
          trend="up"
          icon={ShieldAlert}
        />
      </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Portfolio Budget (AED M)</CardTitle>
            <CardDescription>Budget vs spent vs AI forecast across active projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-44 w-full sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioBudget} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="budgetBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.teal} stopOpacity={1} />
                      <stop offset="100%" stopColor={brand.teal} stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="spentBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.tealLight} stopOpacity={1} />
                      <stop offset="100%" stopColor={brand.tealLight} stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="forecastBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.gold} stopOpacity={1} />
                      <stop offset="100%" stopColor={brand.gold} stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="project" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
                  <Bar dataKey="budget" fill="url(#budgetBar)" radius={[4, 4, 0, 0]} name="Budget" maxBarSize={26} />
                  <Bar dataKey="spent" fill="url(#spentBar)" radius={[4, 4, 0, 0]} name="Spent" maxBarSize={26} />
                  <Bar dataKey="forecast" fill="url(#forecastBar)" radius={[4, 4, 0, 0]} name="Forecast" maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
              {[
                ["Budget", brand.teal],
                ["Spent", brand.tealLight],
                ["Forecast", brand.gold],
              ].map(([name, color]) => (
                <span key={name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contract Risk Severity</CardTitle>
            <CardDescription>Across reviewed agreements</CardDescription>
          </CardHeader>
          <CardContent className="flex h-full items-center">
            <MiniDonut slices={riskSeveritySlices} size={104} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Schedule Health Trend</CardTitle>
            <CardDescription>Portfolio-wide reliability index (%)</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-40 w-full sm:h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scheduleHealthTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={brand.teal} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={brand.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[75, 95]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                  <Area
                    type="monotone"
                    dataKey="health"
                    stroke={brand.teal}
                    fill="url(#healthGrad)"
                    strokeWidth={2.5}
                    name="Reliability"
                    dot={{ r: 3, fill: brand.teal, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: brand.teal, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Query Volume</CardTitle>
            <CardDescription>Daily queries across all modules</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-40 w-full sm:h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aiUsage} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.gold} stopOpacity={1} />
                      <stop offset="100%" stopColor={brand.gold} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
                  <Bar dataKey="value" fill="url(#aiGrad)" radius={[4, 4, 0, 0]} name="Queries" maxBarSize={30}>
                    {aiUsage.map((_, i) => (
                      <Cell key={i} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module status + activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base">Platform Modules</CardTitle>
            <CardDescription>Navigate to any module from the portfolio view</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {moduleStatusCards.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onNavigate(mod.id)}
                  className="group flex flex-col rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-1 w-8 rounded-full" style={{ backgroundColor: mod.accent }} />
                    <Badge variant={mod.status === "functional" ? "success" : "preview"} className="text-[9px]">
                      {mod.metric}
                    </Badge>
                  </div>
                  <p className="mt-3 font-semibold text-foreground group-hover:text-primary">{mod.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
                  <span className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Open module <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest actions across the platform</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      item.variant === "warning" ? "bg-amber-500" : "bg-emerald-500"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{item.time}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
