"use client";

/**
 * Live material-rate feed for the BOQ.
 *
 * The Python backend (see backend/pipeline/rates.py) fetches the day's commodity
 * anchors (steel, aluminium, copper, lumber, crude) every 24h and re-scales the
 * UAE / Abu Dhabi baseline rates. This module pulls that card from GET /rates,
 * applies it onto the in-memory rate tables the BOQ engine reads
 * (DEFAULT_RATES + ROOM_TYPE_META), and caches the last good card in
 * localStorage so pricing survives reloads / a backend outage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CUSTOM_MATERIALS, MATERIALS, type MaterialKey } from "./materials";
import type { CustomMaterial, RateOverrides } from "./types";

const CACHE_KEY = "adicc.estimation.rates.v1";

// Snapshot the original (baseline) material unit rates once at module load,
// before any live card or override mutates the shared MATERIALS table. Used as
// the final fallback and to power "reset to market" in the editor.
export const BASELINE_MATERIAL_RATES: Record<string, number> = Object.fromEntries(
  (Object.keys(MATERIALS) as MaterialKey[]).map((k) => [k, MATERIALS[k].rate])
);

export interface CommodityQuote {
  key: string;
  label: string;
  ticker: string;
  currency: string;
  price: number | null;
  baselinePrice: number | null;
  index: number;
  changePct: number;
  ok: boolean;
}

/** Locally-priced material fetched via web search (AED). */
export interface MaterialQuote {
  key: string;
  label: string;
  unit: string;
  currency: string;
  price: number | null;
  baselinePrice: number | null;
  index: number;
  changePct: number;
  source: string | null;
  ok: boolean;
}

interface ElementRateEntry {
  description: string;
  unit: string;
  baseRate: number;
  rate: number;
  factor: number;
}

interface RoomRateEntry {
  label: string;
  description: string;
  baseRate: number;
  rate: number;
  factor: number;
}

export interface LiveRateCard {
  currency: string;
  /** Unix seconds (backend clock). */
  fetchedAt: number;
  source: string;
  live: boolean;
  elementRates: Record<string, ElementRateEntry>;
  roomRates: Record<string, RoomRateEntry>;
  commodities: CommodityQuote[];
  materials?: MaterialQuote[];
  warnings: string[];
}

export type LiveRateStatus = "idle" | "loading" | "ready" | "error";

function readCache(): LiveRateCard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as LiveRateCard) : null;
  } catch {
    return null;
  }
}

function writeCache(card: LiveRateCard): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(card));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** The market (live) unit rate for a material's live-feed key, if fetched. */
function liveMaterialRate(card: LiveRateCard | null, liveKey: string | undefined): number | undefined {
  if (!liveKey) return undefined;
  const m = card?.materials?.find((x) => x.key === liveKey);
  const r = m?.price;
  return m?.ok && typeof r === "number" && Number.isFinite(r) && r > 0 ? r : undefined;
}

/** The effective rate for a material: override → live-market → baseline. */
export function effectiveMaterialRate(
  key: string,
  liveKey: string | undefined,
  card: LiveRateCard | null,
  overrides?: RateOverrides
): number {
  const ov = overrides?.materials?.[key];
  if (typeof ov === "number" && Number.isFinite(ov) && ov >= 0) return ov;
  return liveMaterialRate(card, liveKey) ?? BASELINE_MATERIAL_RATES[key] ?? 0;
}

/**
 * Apply effective material rates (override → live → baseline) onto the shared
 * MATERIALS table, and (re)register the user's custom materials. The BOQ engine
 * derives every line's cost from these, so mutating them in place updates all
 * estimates without threading arguments through the tree.
 */
export function applyMaterialRates(
  card: LiveRateCard | null,
  overrides?: RateOverrides,
  customMaterials?: CustomMaterial[]
): void {
  for (const key of Object.keys(MATERIALS) as MaterialKey[]) {
    const def = MATERIALS[key];
    def.rate = effectiveMaterialRate(key, def.liveKey, card, overrides);
  }
  // Rebuild the custom-material registry from the user's list (+ any override).
  for (const id of Object.keys(CUSTOM_MATERIALS)) delete CUSTOM_MATERIALS[id];
  for (const cm of customMaterials ?? []) {
    const ov = overrides?.materials?.[cm.id];
    CUSTOM_MATERIALS[cm.id] = {
      key: cm.id,
      label: cm.label,
      unit: cm.unit,
      rate: typeof ov === "number" && Number.isFinite(ov) && ov >= 0 ? ov : cm.rate,
    };
  }
}

async function fetchRateCard(backendUrl: string, force: boolean): Promise<LiveRateCard> {
  const base = backendUrl.replace(/\/+$/, "");
  const url = `${base}/rates${force ? "?refresh=true" : ""}`;
  const controller = new AbortController();
  // A forced refresh runs the (slow) web-search material pull server-side.
  const timer = setTimeout(() => controller.abort(), force ? 150_000 : 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`backend responded ${res.status}`);
    return (await res.json()) as LiveRateCard;
  } finally {
    clearTimeout(timer);
  }
}

export interface UseLiveRates {
  card: LiveRateCard | null;
  status: LiveRateStatus;
  error: string | null;
  /** Force a fresh fetch from the backend (bypasses the 24h cache server-side). */
  refresh: () => Promise<void>;
}

/**
 * Hook: on mount, applies any cached card immediately (instant pricing), then
 * fetches the latest from the backend. Effective rates always follow the
 * precedence override → live → baseline, and are re-applied whenever the card
 * OR the overrides change. A bump counter forces consumers to recompute their
 * BOQ after the shared rate tables are mutated.
 */
export function useLiveRates(
  backendUrl: string,
  overrides?: RateOverrides,
  customMaterials?: CustomMaterial[]
): UseLiveRates {
  const [card, setCard] = useState<LiveRateCard | null>(null);
  const [status, setStatus] = useState<LiveRateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, setApplied] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      if (!backendUrl.trim() || inFlight.current) return;
      inFlight.current = true;
      setStatus("loading");
      setError(null);
      try {
        const fresh = await fetchRateCard(backendUrl, force);
        writeCache(fresh);
        setCard(fresh);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load live rates");
        setStatus((prev) => (prev === "ready" ? "ready" : "error"));
      } finally {
        inFlight.current = false;
      }
    },
    [backendUrl]
  );

  // Initial: apply cached card immediately, then fetch fresh.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setCard(cached);
      setStatus("ready");
    }
    if (backendUrl.trim()) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  // Re-apply effective material rates whenever the card, the overrides, or the
  // custom materials change, then bump so consumers recompute their BOQ.
  useEffect(() => {
    applyMaterialRates(card, overrides, customMaterials);
    setApplied((n) => n + 1);
  }, [card, overrides, customMaterials]);

  const refresh = useCallback(() => load(true), [load]);

  return { card, status, error, refresh };
}
