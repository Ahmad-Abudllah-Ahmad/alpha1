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

  const pushTheme = useCallback((theme: "dark" | "light") => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ source: "adicc-platform", type: "adicc:theme", theme }, "*");
  }, []);

  const pushHome = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ source: "adicc-platform", type: "adicc:home" }, "*");
  }, []);

  useEffect(() => {
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "dark" || detail === "light") pushTheme(detail);
      else pushTheme(readPlatformTheme());
    };
    const onHome = () => pushHome();
    const onLoad = () => pushTheme(readPlatformTheme());
    window.addEventListener("adicc:theme", onTheme as EventListener);
    window.addEventListener("adicc:opentakeoff-home", onHome);
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", onLoad);
    // Initial sync (in case load already fired)
    pushTheme(readPlatformTheme());
    return () => {
      window.removeEventListener("adicc:theme", onTheme as EventListener);
      window.removeEventListener("adicc:opentakeoff-home", onHome);
      iframe?.removeEventListener("load", onLoad);
    };
  }, [pushTheme, pushHome]);

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
