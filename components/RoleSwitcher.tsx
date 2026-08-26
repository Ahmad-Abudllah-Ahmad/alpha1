"use client";

import { useEffect } from "react";
import { useRole } from "@/components/RoleProvider";

/** Nav role badge — Administrator only (no role switching). */
export function RoleSwitcher() {
  const { role, setRole } = useRole();

  useEffect(() => {
    if (role !== "admin") setRole("admin");
  }, [role, setRole]);

  return (
    <div className="titleblock-role" aria-label="Administrator">
      <span className="titleblock-role-mark">AD</span>
      <span className="hidden text-[11px] font-semibold leading-none text-[var(--ink-paper)] lg:inline">
        Administrator
      </span>
    </div>
  );
}
