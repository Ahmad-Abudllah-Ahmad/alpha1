"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function readDarkPreference(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("adicc-theme");
  return stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDark(readDarkPreference());
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    const theme = next ? "dark" : "light";
    localStorage.setItem("adicc-theme", theme);
    window.dispatchEvent(new CustomEvent("adicc:theme", { detail: theme }));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="titleblock-tool"
    >
      {ready ? (
        dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5 opacity-50" />
      )}
    </button>
  );
}
