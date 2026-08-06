"use client";

/**
 * Shared Recharts tooltip that matches the app surface + design tokens.
 * Used across the Executive Dashboard and Scheduling module so every chart
 * reads the same. Pass `valueSuffix` (e.g. "%") and `nameKey` to pull a
 * friendlier series label from the datum (e.g. a full activity name).
 */
interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  valueSuffix?: string;
  nameKey?: string;
}

export function ChartTooltip({ active, payload, label, valueSuffix = "", nameKey }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-elevated">
      {label != null && label !== "" && (
        <p className="mb-1 text-[11px] font-semibold text-foreground">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((p: any, i: number) => {
          const name = nameKey ? p.payload?.[nameKey] ?? p.name : p.name;
          return (
            <div key={p.dataKey ?? i} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
              <span className="capitalize text-muted-foreground">{name}</span>
              <span className="tnum ml-auto pl-3 font-semibold text-foreground">
                {p.value}
                {valueSuffix}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
