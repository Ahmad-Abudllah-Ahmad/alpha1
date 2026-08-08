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
import { Bell, ChevronLeft, Database, Search } from "lucide-react";

export type { ModuleId };
export { modules };

interface TopNavProps {
  active: ModuleId;
  onChange: (id: ModuleId) => void;
}

type RecentProjectHit = {
  id: string;
  name: string;
  sheetCount?: number;
  shapeCount?: number;
};

export function TopNav({ active, onChange }: TopNavProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, top: 0, height: 0 });
  const [projectQuery, setProjectQuery] = useState("");
  const [recentProjects, setRecentProjects] = useState<RecentProjectHit[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem("adicc:recent-projects");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetsViewActive, setSheetsViewActive] = useState(false);
  const { role } = useRole();
  const { toggle: toggleKb, online, docCount } = useKnowledgeBase();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const visibleModules = modules.filter((m) => canViewModule(role, m.id));

  const projectHits = recentProjects
    .filter((p) => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()))
    .slice(0, 8);

  const pushProjectSearch = useCallback((query: string) => {
    window.dispatchEvent(new CustomEvent("adicc:project-search", { detail: query }));
  }, []);

  const openRecentProject = useCallback((p: RecentProjectHit) => {
    setProjectQuery(p.name);
    setSearchOpen(false);
    onChange("estimation");
    window.dispatchEvent(new CustomEvent("adicc:opentakeoff-home"));
    // Allow Estimation iframe to mount / return home before opening.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("adicc:open-project", { detail: { id: p.id, name: p.name } }));
    }, 220);
  }, [onChange]);

  const goAllProjects = useCallback(() => {
    setSheetsViewActive(false);
    onChange("estimation");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("adicc:opentakeoff-home"));
    }, 220);
  }, [onChange]);

  const measureIndicator = useCallback(() => {
    const btn = tabBtnRefs.current.get(active);
    const row = tabsRef.current;
    if (!btn || !row) return;
    const rr = row.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setIndicator({
      left: br.left - rr.left + row.scrollLeft,
      width: br.width,
      top: br.top - rr.top,
      height: br.height,
    });
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
    const onList = (e: Event) => {
      const detail = (e as CustomEvent<RecentProjectHit[]>).detail;
      if (!Array.isArray(detail)) return;
      setRecentProjects(detail);
      try {
        sessionStorage.setItem("adicc:recent-projects", JSON.stringify(detail));
      } catch { /* private mode */ }
    };
    window.addEventListener("adicc:project-list", onList as EventListener);
    return () => window.removeEventListener("adicc:project-list", onList as EventListener);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "opentakeoff" || d.type !== "adicc:sheets-view") return;
      setSheetsViewActive(!!d.active);
    };
    const onHome = () => setSheetsViewActive(false);
    window.addEventListener("message", onMessage);
    window.addEventListener("adicc:opentakeoff-home", onHome);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("adicc:opentakeoff-home", onHome);
    };
  }, []);

  useEffect(() => {
    if (active !== "estimation") setSheetsViewActive(false);
  }, [active]);

  useEffect(() => {
    if (!showNotifications && !searchOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (showNotifications && !notificationsRef.current?.contains(target)) setShowNotifications(false);
      const inSearch =
        searchRef.current?.contains(target)
        || mobileSearchRef.current?.contains(target);
      if (searchOpen && !inSearch) setSearchOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNotifications(false);
        setSearchOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showNotifications, searchOpen]);

  return (
    <>
      <header className="sticky top-0 z-20 glass border-b border-border/60">
        <div className="mx-auto w-full px-3 py-2">
          {/* Logo · modules (center) · utilities — equal side columns keep tabs centered */}
          <nav className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center justify-self-start gap-2">
              <button type="button" onClick={() => onChange("dashboard")} aria-label="ADICC home">
                <AdiccLogo />
              </button>
              {sheetsViewActive && (
                <button
                  type="button"
                  onClick={goAllProjects}
                  title="Back to all projects"
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                  All projects
                </button>
              )}
            </div>

            <div
              ref={tabsRef}
              className="scrollbar-none relative flex max-w-[min(100vw-12rem,42rem)] items-center justify-center gap-0.5 overflow-x-auto px-3 sm:gap-1"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute z-0 rounded-t-xl rounded-b-none bg-[#455a64] transition-[left,width,top,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{
                  left: indicator.left,
                  width: indicator.width,
                  top: indicator.top,
                  height: indicator.height,
                  opacity: indicator.width > 0 ? 1 : 0,
                }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="absolute bottom-0 left-0 h-3 w-3 -translate-x-full"
                  fill="#455a64"
                >
                  <path d="M12 0v12H0c6.627 0 12-5.373 12-12z" />
                </svg>
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="absolute bottom-0 right-0 h-3 w-3 translate-x-full"
                  fill="#455a64"
                >
                  <path d="M0 0v12h12C5.373 12 0 6.627 0 0z" />
                </svg>
              </span>
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
                      "relative z-[1] flex shrink-0 snap-start items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:gap-2 sm:px-3",
                      isActive
                        ? "bg-transparent text-white hover:bg-transparent hover:text-white"
                        : "bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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

            <div className="flex min-w-0 shrink-0 items-center justify-self-end gap-1 sm:gap-1.5">
              <div className="relative hidden w-[min(15rem,30vw)] min-w-[9rem] sm:block lg:w-60" ref={searchRef}>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={projectQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setProjectQuery(next);
                    setSearchOpen(true);
                    pushProjectSearch(next);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Search projects…"
                  className="h-9 w-full border-border/70 bg-background/80 pl-8 text-sm shadow-none"
                  aria-label="Search recent projects"
                  aria-expanded={searchOpen}
                  aria-haspopup="listbox"
                />
                {searchOpen && projectQuery.trim() && (
                  <div
                    role="listbox"
                    className="absolute right-0 top-10 z-50 w-[min(20rem,calc(100vw-1.5rem))] animate-in fade-in slide-in-from-top-2 rounded-xl border bg-card p-1.5 shadow-elevated duration-150"
                  >
                    {projectHits.length === 0 ? (
                      <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">No projects match</p>
                    ) : (
                      projectHits.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          onClick={() => openRecentProject(p)}
                          className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-primary/5"
                        >
                          <span className="truncate text-xs font-semibold text-foreground">{p.name}</span>
                          <span className="mt-0.5 text-[10px] text-muted-foreground">
                            {p.sheetCount || 0} sheets · {p.shapeCount || 0} items
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
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

      {/* Compact search under header on very small screens */}
      <div className="border-b border-border/40 bg-background/80 px-3 py-2 sm:hidden" ref={mobileSearchRef}>
        <div className="relative mx-auto w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={projectQuery}
            onChange={(e) => {
              const next = e.target.value;
              setProjectQuery(next);
              setSearchOpen(true);
              pushProjectSearch(next);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search projects…"
            className="h-9 w-full border-border/80 pl-10 shadow-xs"
            aria-label="Search recent projects"
          />
          {searchOpen && projectQuery.trim() && (
            <div
              role="listbox"
              className="absolute left-3 right-3 top-11 z-50 animate-in fade-in slide-in-from-top-2 rounded-xl border bg-card p-1.5 shadow-elevated duration-150"
            >
              {projectHits.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">No projects match</p>
              ) : (
                projectHits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    onClick={() => openRecentProject(p)}
                    className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-primary/5"
                  >
                    <span className="truncate text-xs font-semibold text-foreground">{p.name}</span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                      {p.sheetCount || 0} sheets · {p.shapeCount || 0} items
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
