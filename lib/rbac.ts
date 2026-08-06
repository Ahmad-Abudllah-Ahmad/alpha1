import type { ModuleId } from "@/lib/modules";

export type UserRole =
  | "admin"
  | "qs"
  | "contracts"
  | "pm"
  | "executive"
  | "readonly";

export type Permission =
  | "view_dashboard"
  | "view_estimation"
  | "view_schedule"
  | "view_contracts"
  | "view_docbot"
  | "create_project"
  | "delete_project"
  | "edit_rates"
  | "upload_contract"
  | "draft_claim"
  | "manage_kb"
  | "quick_actions";

export interface RoleDefinition {
  id: UserRole;
  label: string;
  shortLabel: string;
  description: string;
  permissions: Permission[];
}

export const ROLES: RoleDefinition[] = [
  {
    id: "admin",
    label: "Administrator",
    shortLabel: "Admin",
    description: "Full platform access across all modules and settings.",
    permissions: [
      "view_dashboard",
      "view_estimation",
      "view_schedule",
      "view_contracts",
      "view_docbot",
      "create_project",
      "delete_project",
      "edit_rates",
      "upload_contract",
      "draft_claim",
      "manage_kb",
      "quick_actions",
    ],
  },
  {
    id: "qs",
    label: "Quantity Surveyor",
    shortLabel: "QS",
    description: "Estimation, takeoff, BOQ, and rate management.",
    permissions: [
      "view_dashboard",
      "view_estimation",
      "view_schedule",
      "create_project",
      "delete_project",
      "edit_rates",
      "quick_actions",
    ],
  },
  {
    id: "contracts",
    label: "Contracts Manager",
    shortLabel: "Contracts",
    description: "Contract review, claims drafting, and knowledge base.",
    permissions: [
      "view_dashboard",
      "view_contracts",
      "view_docbot",
      "upload_contract",
      "draft_claim",
      "manage_kb",
      "quick_actions",
    ],
  },
  {
    id: "pm",
    label: "Project Manager",
    shortLabel: "PM",
    description: "Cross-module visibility for project delivery.",
    permissions: [
      "view_dashboard",
      "view_estimation",
      "view_schedule",
      "view_contracts",
      "view_docbot",
      "create_project",
      "upload_contract",
      "quick_actions",
    ],
  },
  {
    id: "executive",
    label: "Executive",
    shortLabel: "Executive",
    description: "Portfolio overview and high-level KPIs.",
    permissions: [
      "view_dashboard",
      "view_estimation",
      "view_schedule",
      "view_contracts",
      "view_docbot",
      "quick_actions",
    ],
  },
  {
    id: "readonly",
    label: "Read-only",
    shortLabel: "Read-only",
    description: "View-only access — no uploads or edits.",
    permissions: [
      "view_dashboard",
      "view_estimation",
      "view_schedule",
      "view_contracts",
      "view_docbot",
    ],
  },
];

const MODULE_PERMISSION: Record<ModuleId, Permission> = {
  dashboard: "view_dashboard",
  estimation: "view_estimation",
  schedule: "view_schedule",
  contracts: "view_contracts",
  docbot: "view_docbot",
};

export function getRole(roleId: UserRole): RoleDefinition {
  return ROLES.find((r) => r.id === roleId) ?? ROLES[0];
}

export function hasPermission(roleId: UserRole, permission: Permission): boolean {
  return getRole(roleId).permissions.includes(permission);
}

export function canViewModule(roleId: UserRole, moduleId: ModuleId): boolean {
  return hasPermission(roleId, MODULE_PERMISSION[moduleId]);
}

export function visibleModules(roleId: UserRole): ModuleId[] {
  return (Object.keys(MODULE_PERMISSION) as ModuleId[]).filter((m) => canViewModule(roleId, m));
}
