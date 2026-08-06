"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "h-9 w-9 shrink-0 rounded-full border-border/80 bg-background/90 shadow-xs",
        "hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
      )}
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {ready ? (
        dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}
