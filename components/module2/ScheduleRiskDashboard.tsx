"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { CheckCircle2, FileUp, UploadCloud } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(true);
      return;
    }
    let timer: number | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.unobserve(el);
        timer = window.setTimeout(() => {
          requestAnimationFrame(() => setShown(true));
        }, delay);
      },
      { threshold: 0.06, rootMargin: "0px 0px -4% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [delay]);

  return (
    <div ref={ref} className={cn("blur-reveal", shown && "blur-reveal-in", className)}>
      {children}
    </div>
  );
}

const P50_DATE = new Date("2026-01-15").getTime();
const P70_DATE = new Date("2026-02-10").getTime();
const P80_DATE = new Date("2026-02-28").getTime();
const MEAN = P50_DATE;
const SIGMA = 18 * 24 * 60 * 60 * 1000;

function normalPdf(x: number, mean: number, sigma: number) {
  const z = (x - mean) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

const monteCarloData = Array.from({ length: 30 }, (_, i) => {
  const start = new Date("2025-10-01").getTime();
  const end = new Date("2026-04-30").getTime();
  const step = (end - start) / 29;
  const dateMs = start + step * i;
  return {
    date: new Date(dateMs).toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
    dateMs,
    density: normalPdf(dateMs, MEAN, SIGMA) * 1e12,
  };
});

const drivingPathData = [
  { activity: "MEP Fit-out", fullName: "MEP Rough-In & Fit-out", contribution: 28 },
  { activity: "Structural Concrete", fullName: "Structural Concrete Work", contribution: 22 },
  { activity: "Curtain Wall", fullName: "Curtain Wall & Glazing", contribution: 18 },
  { activity: "Authority Approvals", fullName: "Authority Approvals (DEWA/Civil Defense)", contribution: 14 },
  { activity: "Interior Fit-Out", fullName: "Interior Fit-Out Co-ordination", contribution: 10 },
  { activity: "Material Procurement", fullName: "Long Lead Material Procurement", contribution: 8 },
];

const scheduleDelays = [
  { code: "A1040", activity: "Authority Approvals (DEWA/Civil Defense)", risk: "High", delay: "+14 days", driver: "Regulatory queue backlog & submission revisions" },
  { code: "A2080", activity: "Curtain Wall & Glazing Installation", risk: "Medium", delay: "+10 days", driver: "Specialist material shipping customs clearance" },
  { code: "A3010", activity: "MEP Rough-In & First Fix", risk: "High", delay: "+12 days", driver: "Subcontractor resource load & coordination disputes" },
  { code: "A4040", activity: "Interior Drywall & Finishes", risk: "Low", delay: "+4 days", driver: "Sequence conflicts with MEP second fix" },
];

const milestones = [
  { name: "Structural Topping Out", planned: "On track", status: "success" as const, date: "15 Aug 2025" },
  { name: "MEP Rough-In Complete", planned: "At risk", status: "warning" as const, date: "30 Sep 2025" },
  { name: "Authority NOC — Civil Defense", planned: "Delayed", status: "destructive" as const, date: "15 Oct 2025" },
  { name: "Practical Completion", planned: "Forecast slip", status: "warning" as const, date: "15 Jan 2026" },
];

const baselineVsActual = [
  { week: "W1", baseline: 12, actual: 11 },
  { week: "W2", baseline: 24, actual: 22 },
  { week: "W3", baseline: 36, actual: 31 },
  { week: "W4", baseline: 48, actual: 40 },
  { week: "W5", baseline: 60, actual: 48 },
  { week: "W6", baseline: 72, actual: 55 },
  { week: "W7", baseline: 84, actual: 62 },
  { week: "W8", baseline: 96, actual: 68 },
];

function formatRefDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const CHART_STROKE = brand.teal;
const CHART_FILL = brand.teal;

export default function ScheduleRiskDashboard() {
  const [p6Phase, setP6Phase] = useState<"idle" | "uploading" | "done">("idle");
  const [p6File, setP6File] = useState<string | null>(null);

  const handleP6Upload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setP6Phase("uploading");
    setP6File(file.name);
    setTimeout(() => setP6Phase("done"), 1800);
    e.target.value = "";
  }, []);

  return (
    <div className="animate-dashboard-pop space-y-4">
      {/* Primavera P6 Import + Milestone Health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BlurReveal delay={0} className="h-full lg:col-span-1">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Primavera P6 Import</CardTitle>
            </div>
            <CardDescription>Upload XER schedule files for AI analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all",
                p6Phase === "done" ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:border-primary/40 hover:bg-primary/[0.02]"
              )}
            >
              <input type="file" accept=".xer,.xml" className="hidden" onChange={handleP6Upload} />
              {p6Phase === "uploading" ? (
                <div className="flex w-full max-w-[200px] flex-col gap-2">
                  <Skeleton className="mx-auto h-8 w-8 rounded-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5 mx-auto" />
                </div>
              ) : p6Phase === "done" ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              ) : (
                <UploadCloud className="h-8 w-8 text-primary" />
              )}
              <p className="mt-2 text-sm font-semibold text-foreground">
                {p6Phase === "uploading" ? "Parsing schedule…" : p6Phase === "done" ? "Import complete" : "Drop XER file here"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {p6Phase === "done"
                  ? `${p6File} — 1,247 activities parsed`
                  : "Marina Tower Phase 2 · Primavera P6"}
              </p>
              {p6Phase === "idle" && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-primary">
                  <FileUp className="h-3.5 w-3.5" /> Browse files
                </span>
              )}
            </label>
          </CardContent>
        </Card>
        </BlurReveal>

        <BlurReveal delay={160} className="h-full lg:col-span-2">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Milestone Health Dashboard</CardTitle>
            </div>
            <CardDescription>Key project milestones vs planned dates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {milestones.map((m) => (
                <div
                  key={m.name}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    m.status === "success" && "border-emerald-500/30 bg-emerald-500/5",
                    m.status === "warning" && "border-amber-500/30 bg-amber-500/5",
                    m.status === "destructive" && "border-red-500/30 bg-red-500/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          m.status === "success" && "bg-emerald-500",
                          m.status === "warning" && "bg-amber-500",
                          m.status === "destructive" && "bg-red-500"
                        )}
                      />
                      {m.name}
                    </p>
                    <Badge
                      variant={m.status === "success" ? "success" : m.status === "warning" ? "warning" : "destructive"}
                      className="text-[9px] shrink-0"
                    >
                      {m.planned}
                    </Badge>
                  </div>
                  <p className="mt-1.5 pl-3.5 text-[11px] text-muted-foreground">Target: {m.date}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </BlurReveal>
      </div>

      {/* Baseline vs Actual */}
      <BlurReveal delay={80}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Baseline vs Actual Progress</CardTitle>
              <CardDescription>Cumulative % complete — Marina Tower Phase 2</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-44 w-full sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={baselineVsActual} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip valueSuffix="%" />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Line type="monotone" dataKey="baseline" stroke={brand.teal} strokeWidth={2.5} dot={false} name="Baseline" />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke={brand.gold}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: brand.gold, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: brand.gold, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  name="Actual"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
            {[
              ["Baseline", brand.teal],
              ["Actual", brand.gold],
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch">
        <BlurReveal delay={0} className="h-full">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Schedule Simulation & Completion Forecast</CardTitle>
            <CardDescription>
              Completion forecast — Marina Tower Phase 2
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="mb-4 flex flex-wrap gap-2.5">
              <Badge variant="success">Expected (P50): {formatRefDate(P50_DATE)}</Badge>
              <Badge variant="warning">Precautionary (P70): {formatRefDate(P70_DATE)}</Badge>
              <Badge variant="destructive">Conservative (P80): {formatRefDate(P80_DATE)}</Badge>
            </div>

            <div className="h-56 min-h-[224px] w-full min-w-0 overflow-visible mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monteCarloData} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="densityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_FILL} stopOpacity={0.45} />
                      <stop offset="95%" stopColor={CHART_FILL} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={5} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, (max: number) => Math.ceil(max * 1.1)]}
                    width={25}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                  <Area
                    type="monotone"
                    dataKey="density"
                    stroke={CHART_STROKE}
                    fill="url(#densityGrad)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <ReferenceLine
                    x={monteCarloData.find((d) => Math.abs(d.dateMs - P50_DATE) === Math.min(...monteCarloData.map((p) => Math.abs(p.dateMs - P50_DATE))))?.date}
                    stroke="#22c55e"
                    strokeWidth={2}
                    label={{ value: "P50", position: "top", fill: "#22c55e", fontSize: 10, offset: 6 }}
                  />
                  <ReferenceLine
                    x={monteCarloData.find((d) => Math.abs(d.dateMs - P70_DATE) === Math.min(...monteCarloData.map((p) => Math.abs(p.dateMs - P70_DATE))))?.date}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    label={{ value: "P70", position: "top", fill: "#f59e0b", fontSize: 10, offset: 6 }}
                  />
                  <ReferenceLine
                    x={monteCarloData.find((d) => Math.abs(d.dateMs - P80_DATE) === Math.min(...monteCarloData.map((p) => Math.abs(p.dateMs - P80_DATE))))?.date}
                    stroke="#ef4444"
                    strokeWidth={2}
                    label={{ value: "P80", position: "top", fill: "#ef4444", fontSize: 10, offset: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        </BlurReveal>

        <BlurReveal delay={160} className="h-full">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Delay Drivers (Critical Path)</CardTitle>
            <CardDescription>
              Contribution of each task to overall project delay risk
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-end">
            <div className="h-72 min-h-[288px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={drivingPathData}
                  layout="vertical"
                  margin={{ top: 10, right: 15, left: 10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="driverBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={brand.teal} stopOpacity={0.75} />
                      <stop offset="100%" stopColor={brand.tealLight} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" domain={[0, 35]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="activity" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={110} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueSuffix="%" nameKey="fullName" />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
                  <Bar dataKey="contribution" fill="url(#driverBar)" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        </BlurReveal>
      </div>

      <BlurReveal delay={100}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Primavera P6 Delay Risk Log</CardTitle>
          <CardDescription>Major scheduled activities flagged with critical path delay risk factors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Activity ID</TableHead>
                  <TableHead>Activity Description</TableHead>
                  <TableHead>Primary Delay Driver</TableHead>
                  <TableHead className="text-center w-[120px]">Risk Level</TableHead>
                  <TableHead className="text-right w-[120px]">Timeline Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduleDelays.map((d) => (
                  <TableRow key={d.code}>
                    <TableCell className="font-mono text-xs font-semibold">{d.code}</TableCell>
                    <TableCell className="text-xs font-semibold text-foreground">{d.activity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.driver}</TableCell>
                    <TableCell className="text-center text-xs">
                      <Badge
                        variant={d.risk === "High" ? "destructive" : d.risk === "Medium" ? "warning" : "success"}
                        className="text-[9px] uppercase px-1.5 py-0.5 rounded-sm font-medium"
                      >
                        {d.risk}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono font-bold text-red-600 dark:text-red-400">
                      {d.delay}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </BlurReveal>

      <BlurReveal delay={200}>
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-xl border bg-gradient-to-br from-muted/30 to-background p-4 text-xs space-y-3">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              How ADICC Forecasts Your Project Schedule
            </h4>
            <p className="text-muted-foreground leading-relaxed">
              ADICC runs Monte Carlo simulation on your <strong>Primavera P6 schedule</strong>, incorporating UAE material lead times, seasonal working-hour constraints, and municipality approval durations to produce P50/P70/P80 completion dates.
            </p>
          </div>
        </CardContent>
      </Card>
      </BlurReveal>
    </div>
  );
}
