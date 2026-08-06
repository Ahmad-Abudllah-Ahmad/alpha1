"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type Permission, type UserRole, getRole, hasPermission } from "@/lib/rbac";

const STORAGE_KEY = "adicc.user.role";

interface RoleContextValue {
  role: UserRole;
  setRole: (role: UserRole) => void;
  can: (permission: Permission) => boolean;
  roleLabel: string;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole>("admin");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as UserRole | null;
    if (stored && getRole(stored)) setRoleState(stored);
    setReady(true);
  }, []);

  const setRole = useCallback((next: UserRole) => {
    setRoleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const can = useCallback((permission: Permission) => hasPermission(role, permission), [role]);

  return (
    <RoleContext.Provider value={{ role, setRole, can, roleLabel: getRole(role).label }}>
      {ready ? children : null}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
