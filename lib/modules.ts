import type { ComponentType } from "react";
import { Calculator, LayoutDashboard, TrendingUp } from "lucide-react";

export type ModuleId = "dashboard" | "estimation" | "schedule" | "contracts" | "docbot";

export const modules: {
  id: ModuleId;
  label: string;
  short: string;
  icon: ComponentType<{ className?: string }>;
  status: "functional" | "preview";
}[] = [
  { id: "dashboard", label: "Executive Dashboard", short: "Dashboard", icon: LayoutDashboard, status: "functional" },
  { id: "estimation", label: "Estimation & Takeoff", short: "Takeoff", icon: Calculator, status: "functional" },
  { id: "schedule", label: "Scheduling & Controls", short: "Schedule", icon: TrendingUp, status: "functional" },
];
