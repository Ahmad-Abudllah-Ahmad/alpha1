"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { themeCookieValue, writeThemeCookie } from "@/lib/themeCookie";
import { cn } from "@/lib/utils";

function readDarkPreference(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("adicc-theme");
  return stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isDark = readDarkPreference();
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    writeThemeCookie(themeCookieValue(isDark));
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    const theme = themeCookieValue(next);
    localStorage.setItem("adicc-theme", theme);
    writeThemeCookie(theme);
    window.dispatchEvent(new CustomEvent("adicc:theme", { detail: theme }));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn("titleblock-tool", className)}
    >
      {ready ? (
        dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5 opacity-50" />
      )}
    </button>
  );
}
