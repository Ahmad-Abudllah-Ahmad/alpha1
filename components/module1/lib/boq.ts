import { elementQuantity } from "./geometry";
import { ROOM_TYPE_META, type RoomType } from "./roomTypes";
import {
  compositeRate,
  expandRecipe,
  recipeFor,
  type MaterialBreakdownLine,
} from "./materials";
import type { CustomBoqItem, ElementKind, Floor, Project } from "./types";

/**
 * Line metadata (description + measurement unit) per element kind. Costs are
 * NOT stored here anymore — they are derived from the material recipes in
 * materials.ts at the current (live + user) material rates.
 */
export interface RateItem {
  kind: ElementKind;
  description: string;
  unit: "m²" | "m" | "No.";
  rate: number;
}

export const DEFAULT_RATES: Record<ElementKind, RateItem> = {
  room: { kind: "room", description: "Floor finish + screed (per plan area)", unit: "m²", rate: 220 },
  wall: { kind: "wall", description: "Blockwork + plaster + paint (per wall area)", unit: "m²", rate: 185 },
  door: { kind: "door", description: "Flush door + frame + ironmongery", unit: "No.", rate: 1450 },
  window: { kind: "window", description: "Aluminium window + glazing", unit: "No.", rate: 2100 },
  column: { kind: "column", description: "RC column (supply + form + pour)", unit: "No.", rate: 3200 },
};

/** Default waste/contingency allowance applied to measured areas. */
export const DEFAULT_WASTE_PCT = 5;

export interface BoqLine {
  /** Unique line id (room lines are keyed by room type). */
  id: string;
  kind: ElementKind;
  roomType?: RoomType;
  description: string;
  unit: "m²" | "m" | "No.";
  quantity: number;
  /** Derived composite rate (AED/unit) = Σ material consumption × material rate. */
  rate: number;
  amount: number;
  itemCount: number;
  /** Per-material build-up for this line. */
  materials: MaterialBreakdownLine[];
}

/** An aggregated material total across a floor / project. */
export interface MaterialSummaryLine {
  key: string;
  label: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface FloorBoq {
  floorId: string;
  floorName: string;
  calibrated: boolean;
  lines: BoqLine[];
  /** All materials consumed by this floor, aggregated by material. */
  materials: MaterialSummaryLine[];
  subtotal: number;
  /** Elements that could not be quantified because the floor lacks a scale. */
  unmeasuredCount: number;
}

/** Roll a set of per-line material breakdowns up into per-material totals. */
export function aggregateMaterials(lines: BoqLine[]): MaterialSummaryLine[] {
  const agg: Record<string, MaterialSummaryLine> = {};
  for (const line of lines) {
    for (const m of line.materials) {
      const cur = (agg[m.key] ??= { key: m.key, label: m.label, unit: m.unit, quantity: 0, rate: m.rate, amount: 0 });
      cur.quantity += m.quantity;
      cur.amount += m.amount;
      cur.rate = m.rate;
    }
  }
  return Object.values(agg).sort((a, b) => b.amount - a.amount);
}

export function computeFloorBoq(
  floor: Floor,
  _rates: Record<ElementKind, RateItem> = DEFAULT_RATES,
  wastePct = DEFAULT_WASTE_PCT
): FloorBoq {
  const roomAgg: Partial<Record<RoomType, { qty: number; count: number }>> = {};
  const otherAgg: Partial<Record<ElementKind, { qty: number; count: number; unit: "m²" | "m" | "No." }>> = {};
  let unmeasuredCount = 0;

  for (const el of floor.elements) {
    const q = elementQuantity(el, floor.scale);
    if (!q) {
      unmeasuredCount += 1;
      continue;
    }
    if (el.kind === "room") {
      const type: RoomType = el.roomType ?? "generic";
      const bucket = (roomAgg[type] ??= { qty: 0, count: 0 });
      bucket.qty += q.value;
      bucket.count += 1;
    } else {
      const bucket = (otherAgg[el.kind] ??= { qty: 0, count: 0, unit: q.unit });
      bucket.qty += q.value;
      bucket.count += 1;
      bucket.unit = q.unit;
    }
  }

  const wasteFactorArea = 1 + wastePct / 100;
  const lines: BoqLine[] = [];

  // Room lines — one per classified type, priced from that type's recipe.
  (Object.keys(roomAgg) as RoomType[]).forEach((type) => {
    const a = roomAgg[type]!;
    if (a.count === 0) return;
    const meta = ROOM_TYPE_META[type];
    const quantity = a.qty * wasteFactorArea;
    const recipe = recipeFor("room", type);
    const rate = compositeRate(recipe);
    lines.push({
      id: `room:${type}`,
      kind: "room",
      roomType: type,
      description: meta.description,
      unit: "m²",
      quantity,
      rate,
      amount: quantity * rate,
      itemCount: a.count,
      materials: expandRecipe(recipe, quantity),
    });
  });
  lines.sort((x, y) => y.amount - x.amount);

  // Wall / count lines, priced from their element recipes.
  (["wall", "door", "window", "column"] as ElementKind[]).forEach((kind) => {
    const a = otherAgg[kind];
    if (!a || a.count === 0) return;
    const meta = DEFAULT_RATES[kind];
    const wasteFactor = a.unit === "No." ? 1 : wasteFactorArea;
    const quantity = a.qty * wasteFactor;
    const recipe = recipeFor(kind, undefined);
    const rate = compositeRate(recipe);
    lines.push({
      id: kind,
      kind,
      description: meta.description,
      unit: a.unit,
      quantity,
      rate,
      amount: quantity * rate,
      itemCount: a.count,
      materials: expandRecipe(recipe, quantity),
    });
  });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);

  return {
    floorId: floor.id,
    floorName: floor.name,
    calibrated: !!floor.scale,
    lines,
    materials: aggregateMaterials(lines),
    subtotal,
    unmeasuredCount,
  };
}

export interface CustomBoqLine extends CustomBoqItem {
  amount: number;
}

export interface ProjectBoq {
  floors: FloorBoq[];
  /** Measured (drawn) subtotal across all floors. */
  measuredSubtotal: number;
  /** User-added custom line items and their subtotal. */
  customLines: CustomBoqLine[];
  customSubtotal: number;
  /** All materials consumed by the whole project, aggregated by material. */
  materials: MaterialSummaryLine[];
  total: number;
  uncalibratedFloors: number;
  totalElements: number;
}

/** Merge several floors' material summaries into one project total. */
function mergeMaterialSummaries(summaries: MaterialSummaryLine[][]): MaterialSummaryLine[] {
  const agg: Record<string, MaterialSummaryLine> = {};
  for (const list of summaries) {
    for (const m of list) {
      const cur = (agg[m.key] ??= { key: m.key, label: m.label, unit: m.unit, quantity: 0, rate: m.rate, amount: 0 });
      cur.quantity += m.quantity;
      cur.amount += m.amount;
      cur.rate = m.rate;
    }
  }
  return Object.values(agg).sort((a, b) => b.amount - a.amount);
}

export function computeCustomLines(items: CustomBoqItem[] | undefined): CustomBoqLine[] {
  return (items ?? []).map((it) => ({
    ...it,
    amount: (Number.isFinite(it.quantity) ? it.quantity : 0) * (Number.isFinite(it.rate) ? it.rate : 0),
  }));
}

export function computeProjectBoq(
  project: Project,
  rates: Record<ElementKind, RateItem> = DEFAULT_RATES,
  wastePct = DEFAULT_WASTE_PCT
): ProjectBoq {
  const floors = project.floors.map((f) => computeFloorBoq(f, rates, wastePct));
  const measuredSubtotal = floors.reduce((s, f) => s + f.subtotal, 0);
  const customLines = computeCustomLines(project.customItems);
  const customSubtotal = customLines.reduce((s, l) => s + l.amount, 0);
  return {
    floors,
    measuredSubtotal,
    customLines,
    customSubtotal,
    materials: mergeMaterialSummaries(floors.map((f) => f.materials)),
    total: measuredSubtotal + customSubtotal,
    uncalibratedFloors: project.floors.filter((f) => !f.scale && f.elements.length > 0).length,
    totalElements: project.floors.reduce((s, f) => s + f.elements.length, 0),
  };
}
