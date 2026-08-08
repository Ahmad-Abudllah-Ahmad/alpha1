import { brand } from "@/lib/brand";
import type { ModuleId } from "@/lib/modules";

/** ADICC portfolio sites — inspired by public Abu Dhabi / UAE works (healthcare, education, marina, commercial, residential). */
export type SiteSector = "Healthcare" | "Education" | "Hospitality" | "Commercial" | "Residential" | "Government";

export type PortfolioSite = {
  id: string;
  name: string;
  short: string;
  location: string;
  sector: SiteSector;
  client: string;
  budgetM: number;
  spentM: number;
  forecastM: number;
  progress: number;
  scheduleHealth: number;
  risk: "Low" | "Medium" | "High";
  tradesOpen: number;
  status: "On track" | "Watch" | "Delayed";
};

export const portfolioSites: PortfolioSite[] = [
  {
    id: "ssmc",
    name: "Sheikh Shakhbout Medical City",
    short: "SSMC",
    location: "Shakhbout City, Abu Dhabi",
    sector: "Healthcare",
    client: "SEHA",
    budgetM: 186,
    spentM: 142,
    forecastM: 178,
    progress: 78,
    scheduleHealth: 86,
    risk: "Medium",
    tradesOpen: 14,
    status: "Watch",
  },
  {
    id: "jubail",
    name: "Jubail Island Marina & Yacht Club",
    short: "Jubail Marina",
    location: "Jubail Island, Abu Dhabi",
    sector: "Hospitality",
    client: "Jubail Island Investment",
    budgetM: 94,
    spentM: 61,
    forecastM: 90,
    progress: 64,
    scheduleHealth: 91,
    risk: "Low",
    tradesOpen: 9,
    status: "On track",
  },
  {
    id: "saadiyat",
    name: "Two Residential Buildings — Saadiyat",
    short: "Saadiyat Residences",
    location: "Saadiyat Island, Abu Dhabi",
    sector: "Residential",
    client: "East & West International",
    budgetM: 72,
    spentM: 38,
    forecastM: 70,
    progress: 52,
    scheduleHealth: 88,
    risk: "Low",
    tradesOpen: 11,
    status: "On track",
  },
  {
    id: "waqf",
    name: "Al-Waqf Shopping District",
    short: "Al-Waqf Mall",
    location: "Al Ain, Abu Dhabi",
    sector: "Commercial",
    client: "Presidential Court",
    budgetM: 58,
    spentM: 41,
    forecastM: 56,
    progress: 71,
    scheduleHealth: 82,
    risk: "Medium",
    tradesOpen: 8,
    status: "Watch",
  },
  {
    id: "awafi",
    name: "Emirati School Al Awafi",
    short: "Al Awafi School",
    location: "Abu Dhabi",
    sector: "Education",
    client: "ADEK",
    budgetM: 34,
    spentM: 29,
    forecastM: 33,
    progress: 89,
    scheduleHealth: 94,
    risk: "Low",
    tradesOpen: 4,
    status: "On track",
  },
  {
    id: "judicial",
    name: "Judicial Controlling Building",
    short: "Judicial Complex",
    location: "Abu Dhabi",
    sector: "Government",
    client: "Presidential Court",
    budgetM: 48,
    spentM: 22,
    forecastM: 51,
    progress: 41,
    scheduleHealth: 76,
    risk: "High",
    tradesOpen: 16,
    status: "Delayed",
  },
];

/** Budget vs spent vs forecast for charts (AED M). */
export const portfolioBudget = portfolioSites.map((s) => ({
  project: s.short,
  budget: s.budgetM,
  spent: s.spentM,
  forecast: s.forecastM,
}));

/** Monthly portfolio cashflow (AED M) — construction drawdown curve. */
export const cashflowTrend = [
  { month: "Jan", certified: 18, planned: 20, claims: 1.2 },
  { month: "Feb", certified: 22, planned: 24, claims: 0.8 },
  { month: "Mar", certified: 27, planned: 26, claims: 1.5 },
  { month: "Apr", certified: 24, planned: 28, claims: 2.1 },
  { month: "May", certified: 31, planned: 30, claims: 1.4 },
  { month: "Jun", certified: 29, planned: 32, claims: 1.9 },
];

export const scheduleHealthTrend = [
  { month: "Jan", health: 91, critical: 4 },
  { month: "Feb", health: 88, critical: 6 },
  { month: "Mar", health: 86, critical: 7 },
  { month: "Apr", health: 84, critical: 9 },
  { month: "May", health: 82, critical: 11 },
  { month: "Jun", health: 84, critical: 8 },
];

/** Sector mix of active ADICC portfolio value. */
export const sectorMix = [
  { name: "Healthcare", value: 186, color: brand.teal },
  { name: "Hospitality", value: 94, color: brand.tealLight },
  { name: "Residential", value: 72, color: brand.gold },
  { name: "Commercial", value: 58, color: brand.goldMuted },
  { name: "Government", value: 48, color: brand.tealMuted },
  { name: "Education", value: 34, color: brand.goldLight },
];

export const riskSeveritySlices = [
  { name: "High", value: 2, color: "#ef4444" },
  { name: "Medium", value: 3, color: "#f59e0b" },
  { name: "Low", value: 3, color: "#22c55e" },
];

export const aiUsageTrend = [4, 7, 6, 9, 8, 11, 12];

/** Site × month delay-risk heatmap (0–100; higher = more risk). */
export const siteRiskHeatmap = {
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] as const,
  rows: [
    { site: "SSMC", values: [42, 48, 55, 58, 52, 46] },
    { site: "Jubail Marina", values: [22, 18, 25, 28, 20, 16] },
    { site: "Saadiyat", values: [30, 28, 32, 35, 30, 26] },
    { site: "Al-Waqf", values: [38, 44, 50, 55, 48, 42] },
    { site: "Al Awafi", values: [12, 10, 14, 16, 12, 10] },
    { site: "Judicial", values: [55, 62, 70, 74, 68, 72] },
  ],
};

/** Trade package burn-down across portfolio (open RFIs / NCRs proxy). */
export const tradeWorkload = [
  { trade: "Structure", open: 18, closed: 42 },
  { trade: "MEP", open: 26, closed: 31 },
  { trade: "Facade", open: 12, closed: 22 },
  { trade: "Finishes", open: 21, closed: 28 },
  { trade: "Civil", open: 9, closed: 35 },
  { trade: "Landscape", open: 7, closed: 14 },
];

export const portfolioActivity = [
  {
    id: "act-schedule",
    time: "2h ago",
    module: "schedule" as ModuleId,
    title: "P6 schedule imported",
    detail: "Jubail Island Marina — 1,247 activities parsed from XER",
    variant: "success" as const,
  },
  {
    id: "act-contract",
    time: "4h ago",
    module: "contracts" as ModuleId,
    title: "Contract risk scan complete",
    detail: "FIDIC Red Book — Judicial Complex: 2 high-severity clauses flagged",
    variant: "warning" as const,
  },
  {
    id: "act-doc",
    time: "Yesterday",
    module: "docbot" as ModuleId,
    title: "SharePoint sync completed",
    detail: "83% document coverage across 12 ADICC project folders",
    variant: "success" as const,
  },
  {
    id: "act-takeoff",
    time: "Yesterday",
    module: "estimation" as ModuleId,
    title: "Takeoff masks reviewed",
    detail: "Al Barsha Villa G+2 — wall face openings reconciled to door schedule",
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
