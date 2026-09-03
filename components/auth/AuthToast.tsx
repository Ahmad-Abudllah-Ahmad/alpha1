"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type AuthToastProps = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
};

export function AuthToast({
  message,
  onDismiss,
  durationMs = 4200,
}: AuthToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto fixed bottom-6 left-1/2 z-[80] w-[min(92vw,24rem)] -translate-x-1/2",
        "rounded-md border border-destructive/30 bg-destructive px-4 py-3 text-sm font-medium",
        "text-destructive-foreground shadow-lg animate-auth-rise",
      )}
    >
      {message}
    </div>
  );
}
