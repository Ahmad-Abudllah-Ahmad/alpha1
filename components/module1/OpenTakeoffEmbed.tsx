"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

function readPlatformTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem("adicc-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* private mode */ }
  if (document.documentElement.classList.contains("dark")) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

  const src = useMemo(() => {
    const fromEnv = (process.env.NEXT_PUBLIC_OPENTAKEOFF_URL || "").trim();
    const base = fromEnv
      ? (fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`)
      : "http://127.0.0.1:5173/takeoff/";
    const theme = readPlatformTheme();
    const url = new URL(base, typeof window !== "undefined" ? window.location.href : "http://127.0.0.1:3001");
    url.searchParams.set("theme", theme);
    return url.toString();
  }, []);

  const postToIframe = useCallback((payload: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ source: "adicc-platform", ...payload }, "*");
  }, []);

  const pushTheme = useCallback((theme: "dark" | "light") => {
    postToIframe({ type: "adicc:theme", theme });
  }, [postToIframe]);

  const pushHome = useCallback(() => {
    postToIframe({ type: "adicc:home" });
  }, [postToIframe]);

  useEffect(() => {
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
    const onLoad = () => {
      pushTheme(readPlatformTheme());
      postToIframe({ type: "adicc:request-project-list" });
    };

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "opentakeoff") return;
      if (d.type === "adicc:project-list" && Array.isArray(d.projects)) {
        try {
          sessionStorage.setItem("adicc:recent-projects", JSON.stringify(d.projects));
        } catch { /* private mode */ }
        window.dispatchEvent(new CustomEvent("adicc:project-list", { detail: d.projects }));
      }
    };

    window.addEventListener("adicc:theme", onTheme as EventListener);
    window.addEventListener("adicc:opentakeoff-home", onHome);
    window.addEventListener("adicc:project-search", onSearch as EventListener);
    window.addEventListener("adicc:open-project", onOpen as EventListener);
    window.addEventListener("message", onMessage);
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", onLoad);
    pushTheme(readPlatformTheme());
    return () => {
      window.removeEventListener("adicc:theme", onTheme as EventListener);
      window.removeEventListener("adicc:opentakeoff-home", onHome);
      window.removeEventListener("adicc:project-search", onSearch as EventListener);
      window.removeEventListener("adicc:open-project", onOpen as EventListener);
      window.removeEventListener("message", onMessage);
      iframe?.removeEventListener("load", onLoad);
    };
  }, [pushTheme, pushHome, postToIframe]);

  return (
    <div
      className={
        className ??
        "relative h-full min-h-[560px] w-full overflow-hidden rounded-xl border bg-background"
      }
    >
      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        className="absolute inset-0 h-full w-full border-0 bg-background"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
