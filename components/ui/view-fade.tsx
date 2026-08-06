"use client";

import { cn } from "@/lib/utils";

interface ViewFadeProps {
  /** Remount key — change triggers enter animation */
  viewKey: string;
  children: React.ReactNode;
  className?: string;
  /** `view` = module/page switches · `tab` = lighter inner tab panels */
  variant?: "view" | "tab";
}

export function ViewFade({ viewKey, children, className, variant = "view" }: ViewFadeProps) {
  return (
    <div
      key={viewKey}
      className={cn(
        variant === "tab" ? "animate-tab-enter" : "animate-view-enter",
        "motion-reduce:animate-none",
        className
      )}
    >
      {children}
    </div>
  );
}
