"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdiccLogo } from "@/components/AdiccLogo";
import { brand } from "@/lib/brand";
import type { ModuleId } from "@/lib/modules";
import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "destructive" | "warning" | "secondary";

interface BannerKpi {
  label: string;
  value: string;
  change: string;
  variant: BadgeVariant;
}

export interface ChartSlice {
  value: number;
  color: string;
  name?: string;
}

interface ModuleBannerConfig {
  kpis: BannerKpi[];
  pie: { title: string; slices: ChartSlice[] };
  bars: { title: string; values: number[]; color?: string };
}

export const bannerConfig: Record<ModuleId, ModuleBannerConfig> = {
  dashboard: {
    kpis: [
      { label: "Active Projects", value: "4", change: "Portfolio", variant: "success" },
      { label: "Portfolio Value", value: "AED 323M", change: "Live BOQ", variant: "success" },
      { label: "Platform Queries", value: "12", change: "+26%", variant: "success" },
    ],
    pie: { title: "Module Coverage", slices: [{ name: "Live", value: 50, color: brand.teal }, { name: "In review", value: 50, color: brand.gold }] },
    bars: { title: "Weekly Activity", values: [8, 12, 10, 15, 14, 18, 20], color: brand.teal },
  },
  estimation: {
    kpis: [
      { label: "Drawing Sheets", value: "32", change: "+14 New", variant: "success" },
      { label: "Parse Accuracy", value: "98.2%", change: "+0.5%", variant: "success" },
      { label: "Formulas Found", value: "1,240", change: "+120", variant: "success" },
    ],
    pie: {
      title: "BOQ Mix",
      slices: [
        { name: "Structural", value: 35, color: brand.teal },
        { name: "Architectural", value: 28, color: brand.tealLight },
        { name: "Civil", value: 22, color: "#3b82f6" },
        { name: "MEP", value: 15, color: "#06b6d4" },
      ],
    },
    bars: {
      title: "Parse Trend",
      values: [62, 71, 78, 85, 90, 94],
      color: brand.teal,
    },
  },
  schedule: {
    kpis: [
      { label: "Expected Delay", value: "+23 days", change: "High", variant: "destructive" },
      { label: "Schedule Reliability", value: "84%", change: "+6%", variant: "success" },
      { label: "Tasks at Risk", value: "7", change: "Critical", variant: "warning" },
    ],
    pie: {
      title: "On-Time Confidence",
      slices: [
        { name: "Confidence", value: 84, color: "#22c55e" },
        { name: "Risk Buffer", value: 16, color: "#ef4444" },
      ],
    },
    bars: {
      title: "Top Delay Drivers",
      values: [28, 22, 18, 14, 10, 8],
      color: brand.teal,
    },
  },
  contracts: {
    kpis: [
      { label: "Risks Found", value: "3", change: "R-01–03", variant: "destructive" },
      { label: "Clauses Scanned", value: "47", change: "FIDIC", variant: "success" },
      { label: "High Severity", value: "2", change: "Review", variant: "warning" },
    ],
    pie: {
      title: "Risk Severity",
      slices: [
        { name: "High", value: 2, color: "#ef4444" },
        { name: "Medium", value: 3, color: "#f59e0b" },
        { name: "Low", value: 5, color: "#22c55e" },
      ],
    },
    bars: {
      title: "Clause Types",
      values: [12, 8, 14, 6, 7],
      color: brand.teal,
    },
  },
  docbot: {
    kpis: [
      { label: "Queries Today", value: "12", change: "+26%", variant: "success" },
      { label: "Folders Active", value: "10/12", change: "RBAC", variant: "success" },
      { label: "Avg Response", value: "1.2s", change: "Fast", variant: "success" },
    ],
    pie: {
      title: "Doc Coverage",
      slices: [
        { name: "Indexed", value: 83, color: brand.teal },
        { name: "Remaining", value: 17, color: "#d1d5db" },
      ],
    },
    bars: {
      title: "Weekly Queries",
      values: [4, 7, 6, 9, 8, 11, 12],
      color: brand.teal,
    },
  },
};

export function MiniDonut({
  slices,
  size = 68,
  showLegend = true,
}: {
  slices: ChartSlice[];
  size?: number;
  showLegend?: boolean;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 5;
  const innerR = r * 0.65;

  let angle = -90;
  const arcs = slices.map((slice, i) => {
    const sweep = (slice.value / total) * 360;
    const start = angle;
    angle += sweep;
    const end = angle;
    const large = sweep > 180 ? 1 : 0;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(start));
    const y1 = cy + r * Math.sin(toRad(start));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const ix1 = cx + innerR * Math.cos(toRad(end));
    const iy1 = cy + innerR * Math.sin(toRad(end));
    const ix2 = cx + innerR * Math.cos(toRad(start));
    const iy2 = cy + innerR * Math.sin(toRad(start));
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;

    const isHovered = hoveredIndex === i;

    return (
      <g
        key={slice.color + start}
        className="cursor-pointer transition-all duration-200"
        onMouseEnter={() => setHoveredIndex(i)}
        onMouseLeave={() => setHoveredIndex(null)}
        style={{ transform: isHovered ? "scale(1.03)" : "scale(1)", transformOrigin: `${cx}px ${cy}px` }}
      >
        <title>{`${slice.name || "Segment"}: ${slice.value} (${Math.round((slice.value / total) * 100)}%)`}</title>
        <path
          d={d}
          fill={slice.color}
          opacity={hoveredIndex === null || isHovered ? 1 : 0.65}
          className="transition-opacity duration-200"
        />
      </g>
    );
  });

  const activeSlice = hoveredIndex !== null ? slices[hoveredIndex] : null;
  const centerText = activeSlice ? `${activeSlice.value}` : `${total}`;
  const centerLabel = activeSlice ? `${Math.round((activeSlice.value / total) * 100)}%` : "Total";

  return (
    <div className="flex items-center gap-4 w-full">
      <div className="relative flex items-center justify-center shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="overflow-visible">
          {arcs}
          <text
            x={cx}
            y={cy - size * 0.05}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground font-bold select-none"
            style={{ fontSize: `${Math.max(10, size * 0.18)}px` }}
          >
            {centerText}
          </text>
          <text
            x={cx}
            y={cy + size * 0.12}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground font-semibold select-none"
            style={{ fontSize: `${Math.max(7.5, size * 0.10)}px` }}
          >
            {centerLabel}
          </text>
        </svg>
      </div>
      {showLegend && (
        <div className="flex-1 flex flex-col gap-1.5 text-xs min-w-[100px]">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-2 text-muted-foreground truncate">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name || `Cat ${i+1}`}
              </span>
              <span className="font-bold font-mono text-foreground ml-2">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MiniBars({
  values,
  labels,
  color = brand.teal,
  width = 120,
  height = 54,
  showAxis = true,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  width?: number;
  height?: number;
  showAxis?: boolean;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(...values, 1);
  const paddingBottom = labels ? 12 : 2;
  const paddingTop = 12;
  const chartHeight = height - paddingBottom - paddingTop;
  const barW = (width - 10) / values.length - 2;

  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
        {showAxis && (
          <line
            x1={2}
            y1={height - paddingBottom}
            x2={width - 2}
            y2={height - paddingBottom}
            stroke="#e5e5e5"
            strokeWidth={1}
          />
        )}
        {values.map((v, i) => {
          const h = (v / max) * chartHeight;
          const x = i * (barW + 2.5) + 5;
          const y = height - paddingBottom - h;
          const isHovered = hoveredIndex === i;

          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <title>{`Value: ${v}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={1.5}
                fill={color}
                opacity={isHovered ? 0.95 : (hoveredIndex === null ? (0.55 + (i / values.length) * 0.45) : 0.35)}
                className="transition-all duration-200"
              />
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                className="fill-foreground font-mono font-bold text-[7.5px] select-none"
              >
                {v}
              </text>
              {labels && labels[i] && (
                <text
                  x={x + barW / 2}
                  y={height - 2}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[8px] font-medium select-none"
                >
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface ModuleBannerProps {
  moduleId: ModuleId;
  title: string;
  description: string;
}

const MODULE_ACCENT: Record<ModuleId, string> = {
  dashboard: "from-primary to-primary/60",
  estimation: "from-primary to-teal-600",
  schedule: "from-gold to-amber-500",
  contracts: "from-primary to-gold",
  docbot: "from-primary/80 to-primary/40",
};

export function ModuleBanner({ moduleId, title, description }: ModuleBannerProps) {
  const config = bannerConfig[moduleId];

  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", MODULE_ACCENT[moduleId])} />
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:max-w-md">
            <p className="text-base font-semibold leading-tight tracking-tight text-card-foreground">{title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {config.kpis.map((kpi) => (
              <div key={kpi.label} className="surface-inset min-w-[7.5rem]">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                  <p className="tnum text-sm font-semibold leading-none text-card-foreground">{kpi.value}</p>
                  <Badge variant={kpi.variant} className="h-4 rounded-full px-1.5 text-[9px] font-medium leading-none">
                    {kpi.change}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

