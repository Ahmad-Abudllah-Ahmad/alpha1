"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AdiccLogo } from "@/components/AdiccLogo";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useRole } from "@/components/RoleProvider";
import { useKnowledgeBase } from "@/components/KnowledgeBaseProvider";
import { useNotifications } from "@/components/NotificationProvider";
import { modules, type ModuleId } from "@/lib/modules";
import { canViewModule } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Bell, Database, Search } from "lucide-react";

export type { ModuleId };
export { modules };

interface TopNavProps {
  active: ModuleId;
  onChange: (id: ModuleId) => void;
}

export function TopNav({ active, onChange }: TopNavProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const { role } = useRole();
  const { toggle: toggleKb, online, docCount } = useKnowledgeBase();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const visibleModules = modules.filter((m) => canViewModule(role, m.id));

  const measureIndicator = useCallback(() => {
    const btn = tabBtnRefs.current.get(active);
    const row = tabsRef.current;
    if (!btn || !row) return;
    const rr = row.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setIndicator({ left: br.left - rr.left + row.scrollLeft, width: br.width });
  }, [active]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, visibleModules.length]);

  useEffect(() => {
    const row = tabsRef.current;
    if (!row) return;
    const ro = new ResizeObserver(measureIndicator);
    ro.observe(row);
    row.addEventListener("scroll", measureIndicator, { passive: true });
    window.addEventListener("resize", measureIndicator);
    return () => {
      ro.disconnect();
      row.removeEventListener("scroll", measureIndicator);
      window.removeEventListener("resize", measureIndicator);
    };
  }, [measureIndicator]);

  useEffect(() => {
    if (!showNotifications) return;

    const close = () => setShowNotifications(false);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!notificationsRef.current?.contains(target)) close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showNotifications]);

  return (
    <>
      <header className="sticky top-0 z-20 glass border-b border-border/60">
        <div className="mx-auto w-full px-3 py-2">
          {/* 3-zone flex — no absolute overlap */}
          <nav className="flex items-center gap-2 sm:gap-3">
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={() => onChange("dashboard")} aria-label="ADICC home">
                <AdiccLogo />
              </button>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
              <ThemeToggle />
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showNotifications;
                    setShowNotifications(next);
                    if (next) markAllRead();
                  }}
                  className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border/80 hover:bg-primary/5 hover:text-primary"
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                  aria-haspopup="true"
                >
                  {unreadCount > 0 && (
                    <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full gradient-gold px-1 text-[8px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                  <Bell className="h-4 w-4" />
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-1.5rem))] animate-in fade-in slide-in-from-top-2 rounded-xl border bg-card p-3 shadow-elevated duration-150">
                    <div className="mb-2 flex items-center justify-between border-b pb-2">
                      <h4 className="text-sm font-semibold">Notifications</h4>
                      {unreadCount > 0 && (
                        <Badge variant="gold" className="text-[10px]">
                          {unreadCount} new
                        </Badge>
                      )}
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto [scrollbar-gutter:stable]">
                      {notifications.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">No notifications yet</p>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={cn(
                              "rounded-lg border border-border/50 p-2.5",
                              n.read ? "bg-muted/20" : "bg-primary/[0.03]"
                            )}
                            onClick={() => markRead(n.id)}
                          >
                            <p
                              className={cn(
                                "text-xs font-semibold",
                                n.variant === "destructive" && "text-destructive",
                                n.variant === "warning" && "text-amber-600 dark:text-amber-500"
                              )}
                            >
                              {n.title}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{n.detail}</p>
                            <p className="mt-1 text-[9px] text-muted-foreground/80">
                              {new Date(n.ts).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <RoleSwitcher />
            </div>
          </nav>
        </div>
      </header>

      {/* Module tabs — wrap on xl, scroll (no ugly bar) on smaller */}
      <div className="sticky top-[57px] z-10 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto w-full px-2 py-1.5">
          <div
            ref={tabsRef}
            className="scrollbar-none relative flex items-center justify-start gap-0.5 overflow-x-auto xl:flex-wrap xl:justify-center xl:overflow-visible xl:gap-1"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 h-0.5 rounded-full gradient-primary transition-[left,width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
              style={{ left: indicator.left, width: indicator.width }}
            />
            {visibleModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = active === mod.id;
              return (
                <button
                  key={mod.id}
                  ref={(el) => {
                    if (el) tabBtnRefs.current.set(mod.id, el);
                    else tabBtnRefs.current.delete(mod.id);
                  }}
                  type="button"
                  onClick={() => onChange(mod.id)}
                  className={cn(
                    "relative flex shrink-0 snap-start items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 sm:gap-2 sm:px-3",
                    isActive
                      ? "bg-primary/10 text-primary shadow-xs"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{mod.label}</span>
                  <span className="md:hidden">{mod.short}</span>
                  {mod.status === "preview" && (
                    <Badge variant="preview" className="ml-0.5 hidden h-4 px-1 text-[8px] xl:inline-flex">
                      Preview
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile / tablet search row — below tabs, never overlaps header actions */}
      <div className="border-b border-border/40 bg-background/80 px-3 py-2 lg:hidden">
        <div className="mx-auto w-full px-3 py-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects, drawings, clauses..."
            className="h-9 w-full border-border/80 pl-10 shadow-xs"
          />
        </div>
      </div>
    </>
  );
}
