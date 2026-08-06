/**
 * Room/section classification for ADICC estimation.
 *
 * Architectural plans label their spaces (KITCHEN, BED-2, LOUNGE, BATH, ...).
 * We read that text (via OCR on rasters or TEXT/MTEXT on CAD) and map it to a
 * canonical room type. The type drives a room-specific rate profile so the BOQ
 * reflects that, e.g., bathrooms carry waterproofing + tiling while a porch is
 * just a screed/paver.
 */

export type RoomType =
  | "bathroom"
  | "kitchen"
  | "bedroom"
  | "living"
  | "store"
  | "circulation"
  | "parking"
  | "outdoor"
  | "generic";

interface RoomTypeDef {
  type: RoomType;
  label: string;
  /** Matched in priority order; first hit wins. */
  patterns: RegExp[];
}

// Order matters — more specific / higher-priority types first.
const ROOM_TYPE_DEFS: RoomTypeDef[] = [
  {
    type: "bathroom",
    label: "Bathroom",
    patterns: [/\bbath/i, /\bwc\b/i, /toilet/i, /powder/i, /washroom/i, /\bw\.?c\b/i, /ensuite/i, /en-?suite/i, /shower/i],
  },
  {
    type: "kitchen",
    label: "Kitchen",
    patterns: [/kitchen/i, /pantry/i],
  },
  {
    type: "parking",
    label: "Parking / Porch",
    patterns: [/parking/i, /garage/i, /porch/i, /\bcar\b/i, /car\s*port/i],
  },
  {
    type: "outdoor",
    label: "Outdoor / Balcony",
    patterns: [/balcony/i, /terrace/i, /\bdeck\b/i, /veranda/i, /patio/i, /gallery/i, /\byard\b/i, /lawn/i, /garden/i],
  },
  {
    type: "circulation",
    label: "Circulation",
    patterns: [/corridor/i, /lobby/i, /passage/i, /foyer/i, /stair/i, /landing/i, /\blift\b/i, /elevator/i, /entrance/i, /\bhall\s*way\b/i],
  },
  {
    type: "store",
    label: "Store / Utility",
    patterns: [/store/i, /storage/i, /closet/i, /wardrobe/i, /dressing/i, /laundry/i, /utility/i, /\bw\.?i\.?c\b/i, /\bwir\b/i],
  },
  {
    type: "bedroom",
    label: "Bedroom",
    patterns: [/bed\s*room/i, /\bbed\b/i, /\bbed-?\d/i, /master/i, /guest\s*room/i],
  },
  {
    type: "living",
    label: "Living / Reception",
    patterns: [/living/i, /lounge/i, /majlis/i, /drawing/i, /dining/i, /family/i, /sitting/i, /\bhall\b/i, /\btv\b/i, /reception/i, /media/i],
  },
];

export interface RoomTypeMeta {
  label: string;
  /** Indicative composite supply-and-install rate (AED per m²). */
  rate: number;
  /** BOQ line description for this room type's finish package. */
  description: string;
}

export const ROOM_TYPE_META: Record<RoomType, RoomTypeMeta> = {
  bathroom: { label: "Bathroom", rate: 620, description: "Bathroom finish (waterproofing + floor/wall tiling + sanitary allowance)" },
  kitchen: { label: "Kitchen", rate: 540, description: "Kitchen finish (floor + wall tiling + counter allowance)" },
  bedroom: { label: "Bedroom", rate: 320, description: "Bedroom finish (flooring + paint + skirting)" },
  living: { label: "Living / Reception", rate: 340, description: "Reception finish (flooring + paint + skirting)" },
  store: { label: "Store / Utility", rate: 210, description: "Store/utility finish (screed + basic finish)" },
  circulation: { label: "Circulation", rate: 260, description: "Circulation finish (tiling + paint)" },
  parking: { label: "Parking / Porch", rate: 180, description: "Parking/porch finish (power-float screed / paver)" },
  outdoor: { label: "Outdoor / Balcony", rate: 300, description: "External finish (waterproofing + external tiling)" },
  generic: { label: "Room / Area", rate: 220, description: "Floor finish + screed (per plan area)" },
};

/** Classify a raw plan label into a canonical room type. */
export function classifyRoomText(text: string | undefined | null): { type: RoomType; matched: boolean } {
  if (!text) return { type: "generic", matched: false };
  const t = text.trim();
  if (!t) return { type: "generic", matched: false };
  for (const def of ROOM_TYPE_DEFS) {
    if (def.patterns.some((re) => re.test(t))) {
      return { type: def.type, matched: true };
    }
  }
  return { type: "generic", matched: false };
}

/** Tidy an OCR/CAD room name for display: collapse whitespace, Title Case-ish. */
export function prettyRoomName(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  return cleaned
    .split(" ")
    .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(" ");
}
