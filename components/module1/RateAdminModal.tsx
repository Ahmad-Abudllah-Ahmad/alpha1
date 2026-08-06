"use client";

import { useEffect, useState } from "react";
import { RotateCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Modal } from "@/components/Modal";
import { BASELINE_MATERIAL_RATES, type LiveRateCard } from "./lib/liveRates";
import { MATERIALS, type MaterialKey } from "./lib/materials";
import type { ProjectsStore } from "./lib/store";
import type { RateOverrides } from "./lib/types";

const MATERIAL_KEYS = Object.keys(MATERIALS) as MaterialKey[];

function NumberInput({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: number | undefined;
  placeholder?: string;
  onCommit: (v: number | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      className={className}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t === "") return onCommit(null);
        const v = parseFloat(t);
        onCommit(Number.isFinite(v) ? v : null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

interface RateAdminModalProps {
  open: boolean;
  onClose: () => void;
  store: ProjectsStore;
  card: LiveRateCard | null;
}

export function RateAdminModal({ open, onClose, store, card }: RateAdminModalProps) {
  const overrides: RateOverrides = { materials: store.settings.rateOverrides?.materials ?? {} };

  const setOverride = (key: string, v: number | null) => {
    const next: RateOverrides = { materials: { ...overrides.materials } };
    if (v == null) delete next.materials[key];
    else next.materials[key] = v;
    store.updateSettings({ rateOverrides: next });
  };

  const marketRate = (key: MaterialKey): number => {
    const liveKey = MATERIALS[key].liveKey;
    const m = liveKey ? card?.materials?.find((x) => x.key === liveKey) : undefined;
    if (m?.ok && typeof m.price === "number" && m.price > 0) return m.price;
    return BASELINE_MATERIAL_RATES[key] ?? MATERIALS[key].rate;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cost database — material rates"
      description="Global unit rates used across all estimation projects. Your overrides win over the daily market feed."
      className="max-w-2xl"
    >
      <ScrollArea className="max-h-[70vh] pr-3">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Material unit rates (AED)</h4>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-emerald-600" /> daily market reference
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Material</th>
                  <th className="px-2 py-2 text-left font-medium">Unit</th>
                  <th className="px-2 py-2 text-right font-medium">Market</th>
                  <th className="px-2 py-2 text-left font-medium">Your rate</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MATERIAL_KEYS.map((key) => {
                  const ov = overrides.materials[key];
                  const mkt = marketRate(key);
                  return (
                    <tr key={key} className="hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-medium text-foreground">{MATERIALS[key].label}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{MATERIALS[key].unit}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {mkt.toLocaleString("en-AE")}
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={ov}
                          placeholder={String(mkt)}
                          onCommit={(v) => setOverride(key, v)}
                          className="h-8 w-28"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {ov != null && (
                          <button
                            type="button"
                            onClick={() => setOverride(key, null)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Reset to market rate"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </ScrollArea>
    </Modal>
  );
}
