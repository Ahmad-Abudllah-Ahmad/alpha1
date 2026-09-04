"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut } from "lucide-react";
import AdiccLoadingLogo from "@/components/AdiccLoadingLogo";
import { useRole } from "@/components/RoleProvider";
import { type AuthSession, getSession, signOut } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/** Display role until real RBAC roles ship. */
const DISPLAY_ROLE = "Estimator";

/** Profile chip + menu: name, role, email, Log out. */
export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role !== "admin") setRole("admin");
  }, [role, setRole]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getSession();
      if (!cancelled) setSession(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const name = session?.fullName?.trim() || "Account";
  const email = session?.email || "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "AD";

  if (!session) return null;

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[10050] w-[min(16.5rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-card shadow-elevated animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="border-b border-border px-3.5 py-3">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium",
                  "text-destructive transition-colors hover:bg-destructive/10",
                )}
                onClick={() => {
                  setOpen(false);
                  setSigningOut(true);
                  void (async () => {
                    try {
                      await signOut();
                    } finally {
                      window.location.assign("/login");
                    }
                  })();
                }}
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                Log out
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "inline-flex h-9 max-w-[14rem] items-center gap-2 rounded-lg border px-1.5 py-1",
          "border-[rgb(244_241_234_/_0.18)] bg-[rgb(255_255_255_/_0.08)] text-[var(--ink-paper)]",
          "transition-colors hover:bg-[rgb(255_255_255_/_0.12)]",
          open && "bg-[rgb(255_255_255_/_0.14)]",
        )}
        title={email}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink-deep)] text-[10px] font-bold tracking-wide text-[var(--ink-paper)] ring-1 ring-[rgb(244_241_234_/_0.2)]"
          aria-hidden="true"
        >
          {initials.slice(0, 2)}
        </span>
        <span className="hidden min-w-0 flex-1 flex-col items-start text-left sm:flex">
          <span className="w-full truncate text-[12px] font-semibold leading-tight">{name}</span>
          <span className="w-full truncate text-[10px] font-medium leading-tight text-[var(--ink-paper)]/55">
            {DISPLAY_ROLE}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mr-0.5 hidden h-3.5 w-3.5 shrink-0 text-[var(--ink-paper)]/55 transition-transform sm:block",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {menu}
      {signingOut
        ? createPortal(
            <div
              className="fixed inset-0 z-[10060] flex items-center justify-center bg-background/85 backdrop-blur-sm"
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label="Signing out"
            >
              <AdiccLoadingLogo />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
