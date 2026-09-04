"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CanvasPanelId = "files" | "summary" | "sheets" | "markup" | "stamp" | "rfi";
const CANVAS_PANEL_IDS: CanvasPanelId[] = ["files", "summary", "sheets", "markup", "stamp", "rfi"];

function readPlatformTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem("adicc-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* private mode */ }
  if (document.documentElement.classList.contains("dark")) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function buildTakeoffUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_OPENTAKEOFF_URL || "").trim();
  // Dev: load Vite directly so `?url` / HMR keep working. The Next /takeoff
  // rewrite is for production same-origin embeds only.
  const fallback =
    process.env.NODE_ENV !== "production"
      ? "http://127.0.0.1:5173/takeoff/"
      : "/takeoff/";
  const base = fromEnv
    ? (fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`)
    : fallback;
  const parentUrl = new URL(
    typeof window !== "undefined" ? window.location.href : "http://127.0.0.1:3001"
  );
  const url = new URL(base, parentUrl);
  url.searchParams.set("theme", readPlatformTheme());
  const projectId = parentUrl.searchParams.get("takeoffProject");
  if (projectId) url.searchParams.set("db", projectId);
  return url.toString();
}

/**
 * Embeds OpenTakeoff in the Estimation preview pane.
 * Keeps takeoff chrome theme in sync with the parent platform theme toggle.
 * Relays recent-project search between TopNav and the iframe home.
 */
export function OpenTakeoffEmbed({
  className,
  title = "OpenTakeoff",
}: {
  className?: string;
  title?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const expandedRef = useRef(false);
  const [src, setSrc] = useState(buildTakeoffUrl);
  const [sheetInvert, setSheetInvert] = useState(false);

  const postToIframe = useCallback((payload: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ source: "adicc-platform", ...payload }, "*");
  }, []);

  const pushSupabaseSession = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      postToIframe({
        type: "adicc:supabase-session",
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
      });
    } catch {
      /* auth not configured */
    }
  }, [postToIframe]);

  const pushTheme = useCallback((theme: "dark" | "light") => {
    postToIframe({ type: "adicc:theme", theme });
  }, [postToIframe]);

  const pushHome = useCallback(() => {
    postToIframe({ type: "adicc:home" });
  }, [postToIframe]);

  useEffect(() => {
    const publishExpandState = (active: boolean) => {
      window.dispatchEvent(new CustomEvent("adicc:canvas-expand-state", { detail: active }));
      postToIframe({ type: "adicc:canvas-expand-control", active });
    };
    const applyExpandedClass = (active: boolean) => {
      document.documentElement.classList.toggle("is-canvas-expanded", active);
      const host = document.querySelector("main");
      if (host instanceof HTMLElement) host.classList.toggle("is-canvas-expanded", active);
    };
    const setHostExpanded = (active: boolean) => {
      if (expandedRef.current === active) return;
      expandedRef.current = active;
      applyExpandedClass(active);
      publishExpandState(active);
    };
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "dark" || detail === "light") pushTheme(detail);
      else pushTheme(readPlatformTheme());
    };
    const onHome = () => pushHome();
    const onSearch = (e: Event) => {
      const query = (e as CustomEvent<string>).detail ?? "";
      postToIframe({ type: "adicc:project-search", query });
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; name?: string }>).detail;
      if (!detail?.id) return;
      postToIframe({ type: "adicc:open-project", id: detail.id, name: detail.name || "" });
    };
    const onInvertToggle = () => {
      postToIframe({ type: "adicc:sheet-invert-toggle" });
    };
    const onSubNav = (e: Event) => {
      const detail = (e as CustomEvent<string | {
        action?: string;
        presentation?: "menu";
        anchorLeft?: number;
        anchorWidth?: number;
      }>).detail;
      const payload = typeof detail === "string"
        ? { action: detail }
        : (detail && typeof detail === "object" ? detail : null);
      const action = payload?.action;
      if (!action) return;
      if (
        CANVAS_PANEL_IDS.includes(action as CanvasPanelId)
        || action === "tools"
        || action === "view"
        || action === "close-panel"
      ) {
        postToIframe({
          type: "adicc:canvas-subnav",
          action,
          presentation: payload.presentation,
          anchorLeft: payload.anchorLeft,
          anchorWidth: payload.anchorWidth,
        });
      }
    };
    const onToolbarControl = (e: Event) => {
      const detail = (e as CustomEvent<{
        tool?: "measure" | "workspace" | "takeoffs";
        action?: "toggle-visible" | "request-state" | "set-measure-icon-size";
        size?: "small" | "medium" | "large";
      }>).detail;
      if (!detail?.action) return;
      postToIframe({ type: "adicc:toolbar-control", ...detail });
    };
    const onViewControl = (e: Event) => {
      const detail = (e as CustomEvent<{
        view?: "estimate" | "readout" | "minimap" | "rulers" | "grid" | "scaleBar";
        action?: "set" | "toggle" | "request-state";
        enabled?: boolean;
      }>).detail;
      if (!detail?.action) return;
      postToIframe({ type: "adicc:view-control", ...detail });
    };
    const onExpandControl = (e: Event) => {
      const detail = (e as CustomEvent<{ active?: boolean }>).detail;
      setHostExpanded(!!detail?.active);
    };
    const onLoad = () => {
      pushTheme(readPlatformTheme());
      void pushSupabaseSession();
      postToIframe({ type: "adicc:request-project-list" });
      postToIframe({ type: "adicc:toolbar-control", action: "request-state" });
      postToIframe({ type: "adicc:view-control", action: "request-state" });
      postToIframe({ type: "adicc:canvas-subnav", action: "request-panel-state" });
    };

    let authUnsubscribe: (() => void) | undefined;
    try {
      const supabase = createClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        void pushSupabaseSession();
      });
      authUnsubscribe = () => subscription.unsubscribe();
    } catch {
      /* auth not configured */
    }

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "opentakeoff") return;
      if (d.type === "adicc:request-supabase-session") {
        void pushSupabaseSession();
      }
      if (d.type === "adicc:project-list" && Array.isArray(d.projects)) {
        try {
          sessionStorage.setItem("adicc:recent-projects", JSON.stringify(d.projects));
        } catch { /* private mode */ }
        window.dispatchEvent(new CustomEvent("adicc:project-list", { detail: d.projects }));
      }
      if (d.type === "adicc:sheet-invert-state") {
        setSheetInvert(!!d.active);
        window.dispatchEvent(new CustomEvent("adicc:sheet-invert-state", { detail: !!d.active }));
      }
      if (d.type === "adicc:toolbar-state" && d.tools && typeof d.tools === "object") {
        window.dispatchEvent(new CustomEvent("adicc:toolbar-state", { detail: d.tools }));
      }
      if (d.type === "adicc:view-state" && d.views && typeof d.views === "object") {
        window.dispatchEvent(new CustomEvent("adicc:view-state", { detail: d.views }));
      }
      if (d.type === "adicc:canvas-panel-state") {
        const panel = CANVAS_PANEL_IDS.includes(d.panel as CanvasPanelId) ? d.panel : null;
        window.dispatchEvent(new CustomEvent("adicc:canvas-panel-state", { detail: panel }));
      }
      if (d.type === "adicc:canvas-ready-state") {
        window.dispatchEvent(new CustomEvent("adicc:canvas-ready-state", {
          detail: !!d.ready,
        }));
      }
      if (d.type === "adicc:canvas-expand-state") {
        setHostExpanded(!!d.active);
      }
      if (d.type === "adicc:sheets-view") {
        if (!d.active) setSheetInvert(false);
        window.dispatchEvent(new CustomEvent("adicc:takeoff-route-state", {
          detail: {
            active: !!d.active,
            projectId: typeof d.projectId === "string" ? d.projectId : "",
          },
        }));
      }
      if (d.type === "adicc:host-pointer-down") {
        window.dispatchEvent(new CustomEvent("adicc:host-pointer-down"));
      }
    };
    const onPopState = () => setSrc(buildTakeoffUrl());

    window.addEventListener("adicc:theme", onTheme as EventListener);
    window.addEventListener("adicc:opentakeoff-home", onHome);
    window.addEventListener("adicc:project-search", onSearch as EventListener);
    window.addEventListener("adicc:open-project", onOpen as EventListener);
    window.addEventListener("adicc:sheet-invert-toggle", onInvertToggle);
    window.addEventListener("adicc:canvas-subnav", onSubNav as EventListener);
    window.addEventListener("adicc:toolbar-control", onToolbarControl as EventListener);
    window.addEventListener("adicc:view-control", onViewControl as EventListener);
    window.addEventListener("adicc:canvas-expand-control", onExpandControl as EventListener);
    window.addEventListener("message", onMessage);
    window.addEventListener("popstate", onPopState);
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", onLoad);
    pushTheme(readPlatformTheme());
    return () => {
      window.removeEventListener("adicc:theme", onTheme as EventListener);
      window.removeEventListener("adicc:opentakeoff-home", onHome);
      window.removeEventListener("adicc:project-search", onSearch as EventListener);
      window.removeEventListener("adicc:open-project", onOpen as EventListener);
      window.removeEventListener("adicc:sheet-invert-toggle", onInvertToggle);
      window.removeEventListener("adicc:canvas-subnav", onSubNav as EventListener);
      window.removeEventListener("adicc:toolbar-control", onToolbarControl as EventListener);
      window.removeEventListener("adicc:view-control", onViewControl as EventListener);
      window.removeEventListener("adicc:canvas-expand-control", onExpandControl as EventListener);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("popstate", onPopState);
      iframe?.removeEventListener("load", onLoad);
      authUnsubscribe?.();
      expandedRef.current = false;
      applyExpandedClass(false);
      document.documentElement.classList.remove("is-measure-rail-dragging");
    };
  }, [pushTheme, pushHome, postToIframe, pushSupabaseSession]);

  return (
    <div
      className={
        className ??
        "relative h-full min-h-0 w-full overflow-hidden bg-[#dbe3e6] dark:bg-[#1a2332]"
      }
      style={sheetInvert ? { background: "#0b0e14" } : undefined}
    >
      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        data-adicc-takeoff-iframe=""
        className="absolute inset-0 h-full w-full border-0 bg-transparent"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
