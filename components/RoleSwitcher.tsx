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
    <div
      className="flex items-center gap-2 rounded-full border border-border/80 bg-card px-2 py-1.5 shadow-soft"
      aria-label="Administrator"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground">
        AD
      </span>
      <span className="hidden text-left lg:block">
        <span className="block text-[11px] font-semibold leading-tight text-foreground">Administrator</span>
      </span>
    </div>
  );
}
