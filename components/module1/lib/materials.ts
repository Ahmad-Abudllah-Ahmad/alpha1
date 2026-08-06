/**
 * Materials-based cost build-up for the BOQ.
 *
 * Instead of a single opaque "AED per m²" rate, every room-finish and every
 * building element is costed from the actual construction materials it consumes
 * per unit of measured quantity (per m² of floor, per m² of wall, per door,
 * etc.). The rate for a line is therefore DERIVED:
 *
 *     rate(per unit) = Σ  consumption(material, per unit) × unitRate(material)
 *
 * Material unit rates come from the daily live feed (backend /rates: cement,
 * concrete, block, glass, wood, sand, tiles, rebar) with an Abu Dhabi baseline
 * fallback, and can be overridden by the user. Users can also register extra
 * custom materials. This mirrors how a QS actually builds a rate.
 */
import type { RoomType } from "./roomTypes";
import type { ElementKind } from "./types";

export type MaterialKey =
  | "cement"
  | "concrete"
  | "block"
  | "glass"
  | "wood"
  | "sand"
  | "tiles"
  | "rebar"
  | "aluminium"
  | "paint"
  | "waterproofing"
  | "labor";

export interface MaterialDef {
  key: string;
  label: string;
  /** Display / pricing unit, e.g. "bag", "m³", "m²", "pc", "sheet", "tonne", "kg", "L", "hr". */
  unit: string;
  /** AED per unit. Mutable at runtime: updated by the live feed + user overrides. */
  rate: number;
  /** Which live-feed key (from backend /rates materials) drives this, if any. */
  liveKey?: string;
}

/**
 * Baseline Abu Dhabi indicative unit rates (AED). `liveKey` links the material
 * to the backend web-search feed so its rate tracks the market daily.
 */
export const MATERIALS: Record<MaterialKey, MaterialDef> = {
  cement: { key: "cement", label: "Cement (OPC 50kg)", unit: "bag", rate: 15.5, liveKey: "cement" },
  concrete: { key: "concrete", label: "Ready-mix concrete C30", unit: "m³", rate: 310, liveKey: "concrete" },
  block: { key: "block", label: "Concrete block 200mm", unit: "pc", rate: 4.4, liveKey: "block" },
  glass: { key: "glass", label: "Glass 6mm", unit: "m²", rate: 42.5, liveKey: "glass" },
  wood: { key: "wood", label: "Plywood / timber 18mm", unit: "sheet", rate: 138, liveKey: "wood" },
  sand: { key: "sand", label: "Washed sand", unit: "m³", rate: 70, liveKey: "sand" },
  tiles: { key: "tiles", label: "Ceramic tiles", unit: "m²", rate: 60, liveKey: "tiles" },
  rebar: { key: "rebar", label: "Steel rebar", unit: "tonne", rate: 2780, liveKey: "rebar" },
  aluminium: { key: "aluminium", label: "Aluminium section", unit: "kg", rate: 22 },
  paint: { key: "paint", label: "Paint (emulsion)", unit: "L", rate: 18 },
  waterproofing: { key: "waterproofing", label: "Waterproofing membrane", unit: "m²", rate: 35 },
  labor: { key: "labor", label: "Labour", unit: "hr", rate: 35 },
};

/** Runtime registry of user-added custom materials, keyed by id. */
export const CUSTOM_MATERIALS: Record<string, MaterialDef> = {};

export function getMaterial(key: string): MaterialDef | undefined {
  return (MATERIALS as Record<string, MaterialDef>)[key] ?? CUSTOM_MATERIALS[key];
}

export function allMaterials(): MaterialDef[] {
  return [...Object.values(MATERIALS), ...Object.values(CUSTOM_MATERIALS)];
}

/** consumption of a material per one unit of the element's measured quantity. */
export type Recipe = Partial<Record<string, number>>;

/**
 * Room-finish recipes — consumption PER m² of floor area. Tuned to reflect the
 * finish package each space type carries (bathrooms: waterproofing + heavy
 * tiling; parking: concrete slab; bedrooms: screed + tile + paint, etc.).
 */
export const ROOM_RECIPES: Record<RoomType, Recipe> = {
  bathroom: { tiles: 2.2, cement: 0.7, sand: 0.06, waterproofing: 1.6, paint: 0.15, labor: 2.6 },
  kitchen: { tiles: 1.9, cement: 0.6, sand: 0.05, waterproofing: 0.3, paint: 0.25, labor: 2.1 },
  bedroom: { tiles: 1.05, cement: 0.4, sand: 0.05, paint: 0.35, labor: 1.3 },
  living: { tiles: 1.1, cement: 0.4, sand: 0.05, paint: 0.35, labor: 1.4 },
  store: { tiles: 0.5, cement: 0.35, sand: 0.04, paint: 0.2, labor: 0.9 },
  circulation: { tiles: 1.1, cement: 0.4, sand: 0.05, paint: 0.3, labor: 1.3 },
  parking: { concrete: 0.06, cement: 0.2, sand: 0.03, paint: 0.05, labor: 1.0 },
  outdoor: { tiles: 1.05, cement: 0.5, sand: 0.06, waterproofing: 1.0, labor: 1.5 },
  generic: { tiles: 1.0, cement: 0.4, sand: 0.05, paint: 0.3, labor: 1.2 },
};

/**
 * Element recipes for non-room kinds.
 *  - wall:   per m² of wall area (200mm blockwork + plaster + paint, 2 faces)
 *  - door:   per door (flush leaf + frame + finish + hanging)
 *  - window: per window (glazing + aluminium frame + install)
 *  - column: per RC column (concrete + rebar + formwork + labour)
 */
export const ELEMENT_RECIPES: Record<Exclude<ElementKind, "room">, Recipe> = {
  wall: { block: 12.5, cement: 0.35, sand: 0.04, paint: 0.35, labor: 1.6 },
  door: { wood: 0.9, paint: 0.8, labor: 5 },
  window: { glass: 2.2, aluminium: 12, labor: 4 },
  column: { concrete: 0.35, rebar: 0.05, wood: 0.6, labor: 8 },
};

export interface MaterialBreakdownLine {
  key: string;
  label: string;
  unit: string;
  /** Consumption per unit of the parent line's measured quantity. */
  perUnit: number;
  /** Total quantity of this material for the parent line (perUnit × quantity). */
  quantity: number;
  rate: number;
  amount: number;
}

/** The derived composite rate (AED per unit) for a recipe at current material rates. */
export function compositeRate(recipe: Recipe): number {
  let sum = 0;
  for (const key of Object.keys(recipe)) {
    const perUnit = recipe[key] ?? 0;
    const mat = getMaterial(key);
    if (!mat || perUnit <= 0) continue;
    sum += perUnit * mat.rate;
  }
  return Math.round(sum * 100) / 100;
}

/** Expand a recipe into per-material lines for a given measured quantity. */
export function expandRecipe(recipe: Recipe, quantity: number): MaterialBreakdownLine[] {
  const lines: MaterialBreakdownLine[] = [];
  for (const key of Object.keys(recipe)) {
    const perUnit = recipe[key] ?? 0;
    const mat = getMaterial(key);
    if (!mat || perUnit <= 0) continue;
    const qty = perUnit * quantity;
    lines.push({
      key,
      label: mat.label,
      unit: mat.unit,
      perUnit,
      quantity: qty,
      rate: mat.rate,
      amount: qty * mat.rate,
    });
  }
  return lines.sort((a, b) => b.amount - a.amount);
}

/** The recipe that applies to a room type or non-room element kind. */
export function recipeFor(kind: ElementKind, roomType: RoomType | undefined): Recipe {
  if (kind === "room") return ROOM_RECIPES[roomType ?? "generic"];
  return ELEMENT_RECIPES[kind];
}
