import { pointInPolygon } from "../geometry";
import { classifyRoomText, prettyRoomName } from "../roomTypes";
import { looksLikeDimension, parseDimensionString } from "./ocr";
import type { ElementProposal } from "./schema";

export interface TextPlacement {
  cx: number;
  cy: number;
  text: string;
}

// Tokens that are units/annotations, not part of a room name.
const NAME_STOP = /^(wide|high|open|double|height|ht|ft|mm|up|dn|down|nos?|no|typ|clg|ceiling|dia|thk|lvl|level|min|max|approx)$/i;

function stripCad(text: string): string {
  // Remove MTEXT formatting codes and braces.
  return text.replace(/\\[A-Za-z][^;\\]*;?/g, "").replace(/[{}]/g, "").trim();
}

function findDimension(joined: string): { text: string } | null {
  const compact = joined.replace(/\s+/g, "");
  const m = compact.match(/\d+(?:\.\d+)?'?-?\d*"?[x×X]\d+(?:\.\d+)?'?-?\d*"?/);
  if (m) {
    const parsed = parseDimensionString(m[0]);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Assigns plan text (OCR words or CAD TEXT/MTEXT) to room polygons: the room's
 * name comes from alpha tokens whose center falls inside it, the room type is
 * classified from that name, and any printed dimension string is captured. Named
 * rooms get a confidence boost; the rest keep their geometry-derived score.
 */
export function enrichRoomsWithText(rooms: ElementProposal[], placements: TextPlacement[]): number {
  let labelled = 0;
  const cleaned = placements
    .map((p) => ({ ...p, text: stripCad(p.text) }))
    .filter((p) => p.text.length > 0);

  for (const room of rooms) {
    if (room.kind !== "room") continue;
    const inside = cleaned.filter((p) => pointInPolygon({ x: p.cx, y: p.cy }, room.points));
    if (inside.length === 0) continue;

    const joined = inside.map((p) => p.text).join(" ");
    const dim = findDimension(joined) ?? inside.map((p) => parseDimensionString(p.text)).find(Boolean) ?? null;

    const nameTokens = inside
      .filter((p) => /[a-zA-Z]/.test(p.text) && !looksLikeDimension(p.text))
      .map((p) => p.text.replace(/[^a-zA-Z0-9\-/&]/g, "").trim())
      .filter((t) => t.length >= 2 && !NAME_STOP.test(t));
    const nameStr = nameTokens.join(" ").trim();

    const cls = classifyRoomText(nameStr);
    if (nameStr) {
      room.label = prettyRoomName(nameStr);
      room.roomType = cls.type;
      if (room.source !== "dxf") room.source = "ocr";
      room.confidence = Math.min(0.96, Math.max(room.confidence, cls.matched ? 0.85 : 0.7));
      labelled += 1;
    }
    if (dim) room.printedDimensions = dim.text;
  }
  return labelled;
}
