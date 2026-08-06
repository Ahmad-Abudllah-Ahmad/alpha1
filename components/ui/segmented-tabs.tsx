"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SegmentedTabOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  shortLabel?: React.ReactNode;
};

interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedTabOption<T>[];
  ariaLabel: string;
  className?: string;
  /** Stretch tabs evenly on small screens */
  stretch?: boolean;
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  stretch = false,
}: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pill, setPill] = useState({ left: 0, width: 0 });

  const measure = useCallback(() => {
    const btn = btnRefs.current.get(value);
    const list = listRef.current;
    if (!btn || !list) return;
    const lr = list.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setPill({ left: br.left - lr.left + list.scrollLeft, width: br.width });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, value]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 shadow-xs",
        stretch && "flex w-full sm:w-auto",
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 rounded-md bg-background shadow-sm transition-[left,width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ left: pill.left, width: pill.width }}
      />
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) btnRefs.current.set(opt.value, el);
              else btnRefs.current.delete(opt.value);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              stretch && "min-w-0 flex-1 sm:flex-none",
              selected ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
            {opt.shortLabel ? (
              <>
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.shortLabel}</span>
              </>
            ) : (
              opt.label
            )}
          </button>
        );
      })}
    </div>
  );
}
