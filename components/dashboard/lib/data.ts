import { brand } from "@/lib/brand";
import type { ModuleId } from "@/lib/modules";

export const portfolioBudget = [
  { project: "Marina Tower P2", budget: 142, spent: 98, forecast: 138 },
  { project: "Al Barsha Villa", budget: 28, spent: 12, forecast: 26 },
  { project: "DIFC Fit-Out", budget: 64, spent: 41, forecast: 58 },
  { project: "JVC Residential", budget: 89, spent: 22, forecast: 85 },
];

export const scheduleHealthTrend = [
  { month: "Jan", health: 91 },
  { month: "Feb", health: 88 },
  { month: "Mar", health: 86 },
  { month: "Apr", health: 84 },
  { month: "May", health: 82 },
  { month: "Jun", health: 84 },
];

export const riskSeveritySlices = [
  { name: "High", value: 2, color: "#ef4444" },
  { name: "Medium", value: 3, color: "#f59e0b" },
  { name: "Low", value: 5, color: "#22c55e" },
];

export const aiUsageTrend = [4, 7, 6, 9, 8, 11, 12];

export const portfolioActivity = [
  {
    id: "act-schedule",
    time: "2h ago",
    module: "schedule" as ModuleId,
    title: "P6 schedule imported",
    detail: "Marina Tower Phase 2 — 1,247 activities parsed from XER",
    variant: "success" as const,
  },
  {
    id: "act-contract",
    time: "4h ago",
    module: "contracts" as ModuleId,
    title: "Contract risk scan complete",
    detail: "FIDIC Red Book — 3 high-severity clauses flagged",
    variant: "warning" as const,
  },
  {
    id: "act-doc",
    time: "Yesterday",
    module: "docbot" as ModuleId,
    title: "SharePoint sync completed",
    detail: "83% document coverage across 12 project folders",
    variant: "success" as const,
  },
];

export const moduleStatusCards = [
  {
    id: "estimation" as ModuleId,
    title: "Estimation & Takeoff",
    description: "Drawing upload, quantity extraction, BOQ export",
    status: "functional" as const,
    metric: "Live",
    accent: brand.teal,
  },
  {
    id: "contracts" as ModuleId,
    title: "Contract & Claims",
    description: "FIDIC analysis, risk identification, claim drafting",
    status: "functional" as const,
    metric: "Live",
    accent: brand.tealLight,
  },
  {
    id: "schedule" as ModuleId,
    title: "Scheduling & Controls",
    description: "P6 import, delay analysis, critical path",
    status: "functional" as const,
    metric: "Live",
    accent: brand.gold,
  },
  {
    id: "docbot" as ModuleId,
    title: "Document Assistant",
    description: "Semantic search, SharePoint RBAC, audit log",
    status: "functional" as const,
    metric: "Live",
    accent: brand.goldMuted,
  },
];
