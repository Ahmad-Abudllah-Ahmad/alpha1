"use client";

import { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Modal } from "@/components/Modal";
import { formatAED } from "@/lib/utils";
import { BASELINE_MATERIAL_RATES, type LiveRateCard } from "./lib/liveRates";
import { MATERIALS, type MaterialKey } from "./lib/materials";
import { uid, type ProjectsStore } from "./lib/store";
import type { CustomMaterial, RateOverrides } from "./lib/types";

interface RateSettingsProps {
  open: boolean;
  onClose: () => void;
  store: ProjectsStore;
  projectId: string;
  card: LiveRateCard | null;
}

const MATERIAL_KEYS = Object.keys(MATERIALS) as MaterialKey[];

/** A numeric input that keeps its own draft while typing and commits on blur. */
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

function TextInput({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      value={draft}
      placeholder={placeholder}
      className={className}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function RateSettings({ open, onClose, store, projectId, card }: RateSettingsProps) {
  const project = store.getProject(projectId);
  // Tolerate older persisted shapes that lack `materials`.
  const overrides: RateOverrides = { materials: store.settings.rateOverrides?.materials ?? {} };
  const customMaterials = store.settings.customMaterials ?? [];

  const setOverride = (key: string, v: number | null) => {
    const next: RateOverrides = { materials: { ...overrides.materials } };
    if (v == null) delete next.materials[key];
    else next.materials[key] = v;
    store.updateSettings({ rateOverrides: next });
  };

  const setCustomMaterials = (list: CustomMaterial[]) => store.updateSettings({ customMaterials: list });

  // Market (live) reference for a material — the daily web-search / feed price.
  const marketRate = (key: MaterialKey): number => {
    const liveKey = MATERIALS[key].liveKey;
    const m = liveKey ? card?.materials?.find((x) => x.key === liveKey) : undefined;
    if (m?.ok && typeof m.price === "number" && m.price > 0) return m.price;
    return BASELINE_MATERIAL_RATES[key] ?? MATERIALS[key].rate;
  };

  const items = project?.customItems ?? [];
  const customSubtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.rate || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Materials, rates & custom items"
      description="Room/element costs are built up from the materials they consume. Set the unit rate you actually pay for any material, register materials we don't know about, or add lump-sum items. Your rates win over the daily market feed."
      className="max-w-3xl"
    >
      <ScrollArea className="max-h-[70vh] pr-3">
        <div className="space-y-6">
          {/* Material unit rates */}
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

          {/* Custom materials */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Custom materials</h4>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCustomMaterials([
                    ...customMaterials,
                    { id: uid("mat"), label: "New material", unit: "unit", rate: 0 },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add material
              </Button>
            </div>
            {customMaterials.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                Register materials we don&apos;t track (e.g. gypsum board, insulation, special cladding) so they can be priced.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border shadow-soft">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="w-24 px-2 py-2 text-left font-medium">Unit</th>
                      <th className="w-28 px-2 py-2 text-left font-medium">Rate (AED)</th>
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customMaterials.map((cm) => (
                      <tr key={cm.id} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <TextInput
                            value={cm.label}
                            onCommit={(v) =>
                              setCustomMaterials(customMaterials.map((m) => (m.id === cm.id ? { ...m, label: v } : m)))
                            }
                            className="h-8"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <TextInput
                            value={cm.unit}
                            onCommit={(v) =>
                              setCustomMaterials(
                                customMaterials.map((m) => (m.id === cm.id ? { ...m, unit: v || "unit" } : m))
                              )
                            }
                            className="h-8 w-20"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberInput
                            value={cm.rate}
                            onCommit={(v) =>
                              setCustomMaterials(customMaterials.map((m) => (m.id === cm.id ? { ...m, rate: v ?? 0 } : m)))
                            }
                            className="h-8 w-24"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => setCustomMaterials(customMaterials.filter((m) => m.id !== cm.id))}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Remove material"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Custom items */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Custom line items</h4>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  store.addCustomItem(projectId, { description: "New item", unit: "No.", quantity: 1, rate: 0 })
                }
              >
                <Plus className="h-4 w-4" /> Add item
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                Add allowances, provisional sums, or any scope not drawn on the plans (e.g. MEP, joinery).
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border shadow-soft">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="w-20 px-2 py-2 text-left font-medium">Unit</th>
                      <th className="w-20 px-2 py-2 text-left font-medium">Qty</th>
                      <th className="w-28 px-2 py-2 text-left font-medium">Rate</th>
                      <th className="w-28 px-2 py-2 text-right font-medium">Amount</th>
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <TextInput
                            value={it.description}
                            onCommit={(v) => store.updateCustomItem(projectId, it.id, { description: v })}
                            className="h-8"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <TextInput
                            value={it.unit}
                            onCommit={(v) => store.updateCustomItem(projectId, it.id, { unit: v || "No." })}
                            className="h-8 w-16"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberInput
                            value={it.quantity}
                            onCommit={(v) => store.updateCustomItem(projectId, it.id, { quantity: v ?? 0 })}
                            className="h-8 w-16"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberInput
                            value={it.rate}
                            onCommit={(v) => store.updateCustomItem(projectId, it.id, { rate: v ?? 0 })}
                            className="h-8 w-24"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-foreground">
                          {formatAED(Math.round((it.quantity || 0) * (it.rate || 0)))}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => store.removeCustomItem(projectId, it.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Custom items subtotal
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-foreground">
                        {formatAED(Math.round(customSubtotal))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
