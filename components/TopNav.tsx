"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AdiccLogo } from "@/components/AdiccLogo";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useRole } from "@/components/RoleProvider";
import { useNotifications } from "@/components/NotificationProvider";
import { modules, type ModuleId } from "@/lib/modules";
import { canViewModule } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import {
  Bell,
  Check,
  ChevronLeft,
  Contrast,
  Search,
  X,
} from "lucide-react";

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

type SubNavId = "tools" | "view";
type ToolbarId = "measure" | "workspace" | "takeoffs";
type ToolbarStatus = Record<ToolbarId, { visible: boolean }>;
type ViewId = "estimate" | "readout" | "minimap" | "rulers" | "grid" | "scaleBar";
type ViewStatus = Record<ViewId, boolean>;
type ExpandHint = "in" | "out";

const SUB_NAV: { id: SubNavId; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "view", label: "View" },
];

/** Canvas chrome controlled through the embedded OpenTakeoff message bridge. */
const TOOLS_MENU_ITEMS = [
  { id: "measure", label: "Measure Rail", shortcut: "Alt+Shift+1", code: "Digit1" },
  { id: "workspace", label: "Workspace Bar", shortcut: "Alt+Shift+2", code: "Digit2" },
  { id: "takeoffs", label: "Takeoffs Drawer", shortcut: "Alt+Shift+3", code: "Digit3" },
] as const;

const DEFAULT_TOOLBAR_STATUS: ToolbarStatus = {
  measure: { visible: true },
  workspace: { visible: true },
  takeoffs: { visible: true },
};

const VIEW_MENU_ITEMS = [
  { id: "estimate", label: "Takeoff Value", shortcut: "Alt+Shift+4", code: "Digit4" },
  { id: "readout", label: "Live Readout", shortcut: "Alt+Shift+5", code: "Digit5" },
  { id: "minimap", label: "Minimap", shortcut: "Alt+Shift+6", code: "Digit6" },
  { id: "rulers", label: "Rulers", shortcut: "Alt+Shift+7", code: "Digit7" },
  { id: "grid", label: "Drafting Grid", shortcut: "Alt+Shift+8", code: "Digit8" },
  { id: "scaleBar", label: "Scale Bar", shortcut: "Alt+Shift+9", code: "Digit9" },
] as const;

const DEFAULT_VIEW_STATUS: ViewStatus = {
  estimate: false,
  readout: false,
  minimap: true,
  rulers: false,
  grid: false,
  scaleBar: true,
};

export function TopNav({ active, onChange }: TopNavProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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
  const [sheetsViewActive, setSheetsViewActive] = useState(false);
  const [sheetInvert, setSheetInvert] = useState(false);
  const [subNavActive, setSubNavActive] = useState<SubNavId | null>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [toolsMenuPos, setToolsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [viewMenuPos, setViewMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [toolbarStatus, setToolbarStatus] = useState<ToolbarStatus>(DEFAULT_TOOLBAR_STATUS);
  const [viewStatus, setViewStatus] = useState<ViewStatus>(DEFAULT_VIEW_STATUS);
  const [primaryCollapsed, setPrimaryCollapsed] = useState(false);
  const [expandHint, setExpandHint] = useState<ExpandHint | null>(null);
  const [menuVeilTop, setMenuVeilTop] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const { role } = useRole();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const visibleModules = modules.filter((m) => canViewModule(role, m.id));

  const projectHits = recentProjects
    .filter((p) => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()))
    .slice(0, 8);

  const pushProjectSearch = useCallback((query: string) => {
    window.dispatchEvent(new CustomEvent("adicc:project-search", { detail: query }));
  }, []);

  const clearSearch = useCallback(() => {
    setSearchOpen(false);
    setProjectQuery("");
    pushProjectSearch("");
  }, [pushProjectSearch]);

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
    const onHome = () => {
      setSheetsViewActive(false);
      setPrimaryCollapsed(false);
    };
    const onInvertState = (e: Event) => {
      setSheetInvert(!!(e as CustomEvent<boolean>).detail);
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("adicc:opentakeoff-home", onHome);
    window.addEventListener("adicc:sheet-invert-state", onInvertState as EventListener);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("adicc:opentakeoff-home", onHome);
      window.removeEventListener("adicc:sheet-invert-state", onInvertState as EventListener);
    };
  }, []);

  useEffect(() => {
    const onToolbarState = (e: Event) => {
      const detail = (e as CustomEvent<Partial<ToolbarStatus>>).detail;
      if (!detail || typeof detail !== "object") return;
      setToolbarStatus((current) => {
        const next = { ...current };
        for (const id of ["measure", "workspace", "takeoffs"] as ToolbarId[]) {
          const value = detail[id];
          if (!value || typeof value !== "object") continue;
          next[id] = {
            visible: typeof value.visible === "boolean" ? value.visible : current[id].visible,
          };
        }
        return next;
      });
    };
    window.addEventListener("adicc:toolbar-state", onToolbarState as EventListener);
    return () => window.removeEventListener("adicc:toolbar-state", onToolbarState as EventListener);
  }, []);

  useEffect(() => {
    const onViewState = (e: Event) => {
      const detail = (e as CustomEvent<Partial<ViewStatus>>).detail;
      if (!detail || typeof detail !== "object") return;
      setViewStatus((current) => {
        const next = { ...current };
        for (const id of ["estimate", "readout", "minimap", "rulers", "grid", "scaleBar"] as ViewId[]) {
          if (typeof detail[id] === "boolean") next[id] = detail[id];
        }
        return next;
      });
    };
    const onExpandState = (e: Event) => {
      setPrimaryCollapsed(!!(e as CustomEvent<boolean>).detail);
    };
    window.addEventListener("adicc:view-state", onViewState as EventListener);
    window.addEventListener("adicc:canvas-expand-state", onExpandState as EventListener);
    return () => {
      window.removeEventListener("adicc:view-state", onViewState as EventListener);
      window.removeEventListener("adicc:canvas-expand-state", onExpandState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (active !== "estimation") {
      setSheetsViewActive(false);
      setSheetInvert(false);
      setPrimaryCollapsed(false);
    }
  }, [active]);

  useEffect(() => {
    if (!sheetsViewActive) {
      setSheetInvert(false);
      setSubNavActive(null);
      setToolsMenuOpen(false);
      setViewMenuOpen(false);
      setPrimaryCollapsed(false);
    }
  }, [sheetsViewActive]);

  const closeChromeMenus = useCallback(() => {
    setToolsMenuOpen(false);
    setToolsMenuPos(null);
    setViewMenuOpen(false);
    setViewMenuPos(null);
    setSubNavActive(null);
  }, []);

  const toggleToolsMenu = useCallback(() => {
    setViewMenuOpen(false);
    setViewMenuPos(null);
    setToolsMenuOpen((open) => {
      const next = !open;
      setSubNavActive(next ? "tools" : null);
      if (!next) setToolsMenuPos(null);
      return next;
    });
  }, []);

  const toggleViewMenu = useCallback(() => {
    setToolsMenuOpen(false);
    setToolsMenuPos(null);
    setViewMenuOpen((open) => {
      const next = !open;
      setSubNavActive(next ? "view" : null);
      if (!next) setViewMenuPos(null);
      return next;
    });
  }, []);

  const controlToolbar = useCallback((tool: ToolbarId) => {
    setToolbarStatus((current) => {
      const target = current[tool];
      return { ...current, [tool]: { visible: !target.visible } };
    });
    window.dispatchEvent(new CustomEvent("adicc:toolbar-control", {
      detail: { tool, action: "toggle-visible" },
    }));
    closeChromeMenus();
  }, [closeChromeMenus]);

  const controlView = useCallback((view: ViewId) => {
    setViewStatus((current) => ({ ...current, [view]: !current[view] }));
    window.dispatchEvent(new CustomEvent("adicc:view-control", {
      detail: { view, action: "toggle" },
    }));
    closeChromeMenus();
  }, [closeChromeMenus]);

  useEffect(() => {
    if (!sheetsViewActive) return undefined;
    const onShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const tool = TOOLS_MENU_ITEMS.find((item) => item.code === event.code);
      if (tool) {
        event.preventDefault();
        controlToolbar(tool.id);
        return;
      }
      const view = VIEW_MENU_ITEMS.find((item) => item.code === event.code);
      if (!view) return;
      event.preventDefault();
      controlView(view.id);
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [controlToolbar, controlView, sheetsViewActive]);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    window.dispatchEvent(new CustomEvent("adicc:toolbar-control", {
      detail: { action: "request-state" },
    }));
  }, [toolsMenuOpen]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    window.dispatchEvent(new CustomEvent("adicc:view-control", {
      detail: { action: "request-state" },
    }));
  }, [viewMenuOpen]);

  useLayoutEffect(() => {
    if (!toolsMenuOpen || !toolsButtonRef.current) {
      setToolsMenuPos(null);
      return;
    }
    const updatePos = () => {
      const rect = toolsButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolsMenuPos({ top: rect.bottom + 2, left: rect.left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [toolsMenuOpen]);

  useLayoutEffect(() => {
    if (!viewMenuOpen || !viewButtonRef.current) {
      setViewMenuPos(null);
      return;
    }
    const updatePos = () => {
      const rect = viewButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setViewMenuPos({ top: rect.bottom + 2, left: rect.left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [viewMenuOpen]);

  useLayoutEffect(() => {
    if (!toolsMenuOpen && !viewMenuOpen) return;
    const updateVeil = () => {
      const rect = headerRef.current?.getBoundingClientRect();
      setMenuVeilTop(rect ? Math.round(rect.bottom) : 0);
    };
    updateVeil();
    window.addEventListener("resize", updateVeil);
    window.addEventListener("scroll", updateVeil, true);
    return () => {
      window.removeEventListener("resize", updateVeil);
      window.removeEventListener("scroll", updateVeil, true);
    };
  }, [toolsMenuOpen, viewMenuOpen, primaryCollapsed]);

  useEffect(() => {
    if (!primaryCollapsed) {
      setExpandHint((current) => (current ? "out" : null));
      const hide = window.setTimeout(() => setExpandHint(null), 280);
      return () => window.clearTimeout(hide);
    }
    closeChromeMenus();
    setExpandHint("in");
    const leave = window.setTimeout(() => setExpandHint("out"), 3800);
    const hide = window.setTimeout(() => setExpandHint(null), 4160);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(hide);
    };
  }, [primaryCollapsed, closeChromeMenus]);

  useEffect(() => {
    const onWheel = (e: Event) => {
      const we = e as WheelEvent;
      if (we.ctrlKey || we.metaKey) we.preventDefault();
    };
    const header = document.querySelector("header.sticky.top-0");
    header?.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      header?.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!showNotifications && !searchOpen && !toolsMenuOpen && !viewMenuOpen && !primaryCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (showNotifications && !notificationsRef.current?.contains(target)) setShowNotifications(false);
      if (searchOpen && !searchRef.current?.contains(target)) setSearchOpen(false);
      if (toolsMenuOpen && !toolsMenuRef.current?.contains(target) && !toolsDropdownRef.current?.contains(target)) {
        closeChromeMenus();
      }
      if (viewMenuOpen && !viewMenuRef.current?.contains(target) && !viewDropdownRef.current?.contains(target)) {
        closeChromeMenus();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNotifications(false);
        if (searchOpen) setSearchOpen(false);
        if (toolsMenuOpen || viewMenuOpen) closeChromeMenus();
        if (primaryCollapsed) {
          setPrimaryCollapsed(false);
          window.dispatchEvent(new CustomEvent("adicc:canvas-expand-control", {
            detail: { active: false },
          }));
        }
      }
    };

    const onHostPointer = () => {
      if (toolsMenuOpen || viewMenuOpen) closeChromeMenus();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("adicc:host-pointer-down", onHostPointer);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("adicc:host-pointer-down", onHostPointer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeChromeMenus, showNotifications, searchOpen, toolsMenuOpen, viewMenuOpen, primaryCollapsed]);

  return (
    <>
      <header
        ref={headerRef}
        className={cn("titleblock-nav sticky top-0 z-20", primaryCollapsed && "is-canvas-expanded")}
      >
        <nav
          className={cn("titleblock-plate", primaryCollapsed && "is-collapsed")}
          aria-label="Primary"
          aria-hidden={primaryCollapsed}
          inert={primaryCollapsed ? true : undefined}
        >
            <div className="titleblock-cell titleblock-brand">
              <button
                type="button"
                onClick={() => onChange("dashboard")}
                aria-label="ADICC home"
                className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <AdiccLogo />
              </button>
              {sheetsViewActive && (
                <button
                  type="button"
                  onClick={goAllProjects}
                  title="Back to all projects"
                  className="titleblock-back"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                  All projects
                </button>
              )}
            </div>

            <div className="titleblock-cell titleblock-links">
              {visibleModules.map((mod) => {
                const isActive = active === mod.id;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => onChange(mod.id)}
                    aria-current={isActive ? "page" : undefined}
                    title={mod.label}
                    className="titleblock-link"
                  >
                    {mod.short}
                    {mod.status === "preview" && (
                      <Badge variant="preview" className="ml-1 hidden h-4 px-1 text-[8px] xl:inline-flex">
                        Preview
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="titleblock-cell titleblock-tools">
              <ThemeToggle />
              {active === "estimation" && sheetsViewActive && (
                <button
                  type="button"
                  className={cn("titleblock-tool", sheetInvert && "is-on")}
                  title={sheetInvert ? "Sheet back to positive print" : "Invert sheet — negative print"}
                  aria-label={sheetInvert ? "Sheet back to positive print" : "Invert sheet — negative print"}
                  aria-pressed={sheetInvert}
                  onClick={() => window.dispatchEvent(new CustomEvent("adicc:sheet-invert-toggle"))}
                >
                  <Contrast className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showNotifications;
                    setShowNotifications(next);
                    if (next) markAllRead();
                  }}
                  className="titleblock-tool relative"
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                  aria-haspopup="true"
                >
                  {unreadCount > 0 && (
                    <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full gradient-gold px-1 text-[8px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                  <Bell className="h-3.5 w-3.5" />
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
        {active === "estimation" && sheetsViewActive && (
          <nav
            className="titleblock-sub"
            aria-label="Secondary"
            aria-hidden={primaryCollapsed || undefined}
          >
            <div className="titleblock-sub-nav">
              {SUB_NAV.map((item) => (
                <div
                  key={item.id}
                  className="relative"
                  ref={item.id === "tools" ? toolsMenuRef : viewMenuRef}
                >
                  <button
                    ref={item.id === "tools" ? toolsButtonRef : viewButtonRef}
                    type="button"
                    className={cn(
                      "titleblock-sub-link",
                      (subNavActive === item.id || (item.id === "tools" ? toolsMenuOpen : viewMenuOpen)) && "is-on",
                    )}
                    aria-current={subNavActive === item.id ? "page" : undefined}
                    aria-expanded={item.id === "tools" ? toolsMenuOpen : viewMenuOpen}
                    aria-haspopup="menu"
                    onClick={item.id === "tools" ? toggleToolsMenu : toggleViewMenu}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>
            <div className="titleblock-sub-tools">
              <div className="relative" ref={searchRef}>
                <div className="titleblock-sub-seek">
                  <span className="titleblock-sub-seek-ico" aria-hidden="true">
                    <Search className="h-3 w-3" />
                  </span>
                  <input
                    ref={searchInputRef}
                    value={projectQuery}
                    onChange={(e) => {
                      const next = e.target.value;
                      setProjectQuery(next);
                      setSearchOpen(true);
                      pushProjectSearch(next);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Find a project…"
                    className="titleblock-sub-seek-input"
                    aria-label="Search recent projects"
                    aria-expanded={searchOpen && !!projectQuery.trim()}
                    aria-haspopup="listbox"
                  />
                  {projectQuery.trim() ? (
                    <button
                      type="button"
                      className="titleblock-sub-seek-clear"
                      aria-label="Clear search"
                      onClick={clearSearch}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
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
            </div>
          </nav>
        )}
      </header>
        {expandHint ? (
          <div
            className={cn("canvas-expand-hint", expandHint === "out" && "is-leaving")}
            role="status"
            aria-live="polite"
          >
            <strong>ADICC</strong>
            <span className="canvas-expand-hint-sep" aria-hidden="true">—</span>
            <span>To restore, press</span>
            <kbd>Esc</kbd>
          </div>
        ) : null}
      {(toolsMenuOpen || viewMenuOpen) ? (
        <div
          className="titleblock-sub-menu-veil"
          style={{ top: menuVeilTop }}
          onPointerDown={closeChromeMenus}
        />
      ) : null}
      {toolsMenuOpen && toolsMenuPos ? (
        <div
          ref={toolsDropdownRef}
          className="titleblock-sub-menu titleblock-sub-menu--floating"
          role="menu"
          aria-label="Canvas toolbars"
          style={{ top: toolsMenuPos.top, left: toolsMenuPos.left }}
        >
          {TOOLS_MENU_ITEMS.map((option) => {
            const status = toolbarStatus[option.id];
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                className="titleblock-sub-menu-item"
                aria-checked={status.visible}
                onClick={() => controlToolbar(option.id)}
              >
                <span className="titleblock-sub-menu-check" aria-hidden="true">
                  {status.visible ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="titleblock-sub-menu-label">{option.label}</span>
                <kbd className="titleblock-sub-menu-shortcut">{option.shortcut}</kbd>
              </button>
            );
          })}
        </div>
      ) : null}
      {viewMenuOpen && viewMenuPos ? (
        <div
          ref={viewDropdownRef}
          className="titleblock-sub-menu titleblock-sub-menu--floating titleblock-view-menu"
          role="menu"
          aria-label="Canvas view"
          style={{ top: viewMenuPos.top, left: viewMenuPos.left }}
        >
          {VIEW_MENU_ITEMS.map((option, index) => {
            const enabled = viewStatus[option.id];
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                className={cn("titleblock-sub-menu-item", index === 2 && "is-section-start")}
                aria-checked={enabled}
                onClick={() => controlView(option.id)}
              >
                <span className="titleblock-sub-menu-check" aria-hidden="true">
                  {enabled ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="titleblock-sub-menu-label">{option.label}</span>
                <kbd className="titleblock-sub-menu-shortcut">{option.shortcut}</kbd>
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
