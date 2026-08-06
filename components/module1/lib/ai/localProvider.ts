"use client";

import { DEFAULT_WALL_HEIGHT_M, type DxfTransform, type ElementKind, type Floor, type Point } from "../types";
import { detectAllRooms } from "../vision";
import { getDxf } from "./dxfRegistry";
import { enrichRoomsWithText, type TextPlacement } from "./labeling";
import { runOcr } from "./ocr";
import type { ElementProposal, ScaleProposal, TakeoffProposal } from "./schema";

function classifyByName(name: string | undefined): ElementKind | null {
  if (!name) return null;
  if (/door/i.test(name)) return "door";
  if (/wind|glaz/i.test(name)) return "window";
  if (/col(umn)?\b/i.test(name)) return "column";
  if (/wall/i.test(name)) return "wall";
  if (/room|space|area/i.test(name)) return "room";
  return null;
}

function makeToPx(t: DxfTransform) {
  return (wx: number, wy: number): Point => ({
    x: (wx - t.minX + t.pad) * t.pxScale,
    y: t.canvasH - (wy - t.minY + t.pad) * t.pxScale,
  });
}

function entityCentroidWxWy(e: any): { x: number; y: number } | null {
  const type = e?.type;
  if (type === "TEXT" || type === "MTEXT") {
    const pos = e.startPoint || e.position || e.insertionPoint || {};
    if (typeof pos.x === "number" && typeof pos.y === "number") return { x: pos.x, y: pos.y };
  } else if (type === "INSERT") {
    const pos = e.position || {};
    if (typeof pos.x === "number" && typeof pos.y === "number") return { x: pos.x, y: pos.y };
  } else if (type === "LINE" || type === "LWPOLYLINE" || type === "POLYLINE") {
    const verts = (e.vertices || []).filter((v: any) => typeof v.x === "number" && typeof v.y === "number");
    if (!verts.length) return null;
    let sx = 0;
    let sy = 0;
    for (const v of verts) {
      sx += v.x;
      sy += v.y;
    }
    return { x: sx / verts.length, y: sy / verts.length };
  } else if (type === "CIRCLE" || type === "ARC") {
    const c = e.center || {};
    if (typeof c.x === "number" && typeof c.y === "number") return { x: c.x, y: c.y };
  }
  return null;
}

function entityOnFloor(e: any, floor: Floor, toPx: (x: number, y: number) => Point): boolean {
  const c = entityCentroidWxWy(e);
  if (!c) return true;
  const px = toPx(c.x, c.y);
  const margin = 12;
  return (
    px.x >= -margin &&
    px.x <= floor.naturalWidth + margin &&
    px.y >= -margin &&
    px.y <= floor.naturalHeight + margin
  );
}

async function imageDataFromUrl(url: string, w: number, h: number): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(ctx.getImageData(0, 0, w, h));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function detectDxf(floor: Floor, rawText: string): Promise<TakeoffProposal> {
  const t = floor.dxfTransform;
  if (!t) throw new Error("Missing DXF transform");
  const { default: DxfParser } = await import("dxf-parser");
  const parser = new DxfParser();
  let dxf: any;
  try {
    dxf = parser.parseSync(rawText);
  } catch {
    throw new Error("DXF could not be parsed in-browser.");
  }

  const toPx = makeToPx(t);
  const entities: any[] = dxf?.entities ?? [];
  const elements: ElementProposal[] = [];
  const texts: TextPlacement[] = [];
  const warnings: string[] = [];
  let roomN = 0;
  let wallN = 0;
  const countN: Record<string, number> = { door: 0, window: 0, column: 0 };

  for (const e of entities) {
    if (!entityOnFloor(e, floor, toPx)) continue;
    const type = e?.type;
    const layerKind = classifyByName(e?.layer);

    if (type === "TEXT" || type === "MTEXT") {
      const raw = (e.text ?? "").toString();
      const pos = e.startPoint || e.position || e.insertionPoint || {};
      if (raw && typeof pos.x === "number") {
        const px = toPx(pos.x, pos.y);
        texts.push({ cx: px.x, cy: px.y, text: raw });
      }
    } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const verts = (e.vertices || []).filter((v: any) => typeof v.x === "number" && typeof v.y === "number");
      if (verts.length < 2) continue;
      const pts = verts.map((v: any) => toPx(v.x, v.y));
      const closed = !!(e.shape || e.closed);
      if (closed && pts.length >= 3) {
        roomN += 1;
        elements.push({
          kind: "room",
          geometryType: "polygon",
          points: pts,
          label: layerKind === "room" && e.layer ? `${e.layer} ${roomN}` : `Room ${roomN}`,
          confidence: 0.95,
          source: "dxf",
          layer: e.layer,
        });
      } else {
        wallN += 1;
        elements.push({
          kind: "wall",
          geometryType: "polyline",
          points: pts,
          label: `Wall ${wallN}`,
          confidence: 0.9,
          source: "dxf",
          layer: e.layer,
          wallHeightM: DEFAULT_WALL_HEIGHT_M,
        });
      }
    } else if (type === "LINE" && layerKind === "wall") {
      const v = e.vertices || [];
      if (v.length < 2) continue;
      wallN += 1;
      elements.push({
        kind: "wall",
        geometryType: "polyline",
        points: [toPx(v[0].x, v[0].y), toPx(v[1].x, v[1].y)],
        label: `Wall ${wallN}`,
        confidence: 0.75,
        source: "dxf",
        layer: e.layer,
        wallHeightM: DEFAULT_WALL_HEIGHT_M,
      });
    } else if (type === "INSERT") {
      const kind = classifyByName(e?.name) ?? layerKind;
      if (kind === "door" || kind === "window" || kind === "column") {
        const pos = e.position || {};
        if (typeof pos.x !== "number") continue;
        countN[kind] += 1;
        elements.push({
          kind,
          geometryType: "count",
          points: [toPx(pos.x, pos.y)],
          label: `${kind[0].toUpperCase()}${kind.slice(1)} ${countN[kind]}`,
          confidence: 0.85,
          source: "dxf",
          layer: e.layer,
        });
      }
    }
  }

  // Name rooms + classify types from CAD text entities.
  const labelled = enrichRoomsWithText(elements, texts);
  const roomCount = elements.filter((el) => el.kind === "room").length;
  if (roomCount > 0 && labelled === 0) {
    warnings.push("Found rooms but no CAD text labels inside them — they'll be generic until named.");
  }

  if (elements.length === 0) {
    warnings.push(
      "No closed rooms, wall polylines, or named blocks found in the CAD layers. Try the raster detection or draw manually."
    );
  }

  const scale: ScaleProposal = {
    metersPerPixel: t.metersPerUnit / t.pxScale,
    method: "dxf-native",
    confidence: 0.95,
    note: "Derived from the DXF's native units.",
  };

  return { elements, scale, warnings, engine: "local" };
}

async function detectRaster(floor: Floor): Promise<TakeoffProposal> {
  const data = await imageDataFromUrl(floor.imageDataUrl, floor.naturalWidth, floor.naturalHeight);
  if (!data) {
    return {
      elements: [],
      scale: null,
      warnings: ["Couldn't read the drawing image for detection."],
      engine: "local",
    };
  }
  const rooms = detectAllRooms(data);
  const elements: ElementProposal[] = rooms.map((r, i) => ({
    kind: "room",
    geometryType: "polygon",
    points: r.points,
    label: `Room ${i + 1}`,
    confidence: r.confidence,
    source: "opencv",
  }));

  const warnings: string[] = [];

  // Read the plan text and use it to name/classify rooms + capture dimensions.
  if (elements.length > 0) {
    const words = await runOcr(floor.imageDataUrl);
    if (words.length === 0) {
      warnings.push("Couldn't read any text on the drawing — rooms stay generic. Rename them after adding.");
    } else {
      const placements: TextPlacement[] = words.map((w) => ({ cx: w.cx, cy: w.cy, text: w.text }));
      const labelled = enrichRoomsWithText(elements, placements);
      if (labelled === 0) {
        warnings.push("Text was found but none fell inside a detected room — rooms stay generic.");
      }
    }
  }

  if (elements.length === 0) {
    warnings.push("No enclosed rooms detected automatically. Use Magic Room or draw manually.");
  }
  if (!floor.scale) {
    warnings.push("This floor has no scale yet — set it so detected areas are quantified.");
  }

  return { elements, scale: null, warnings, engine: "local" };
}

export async function localDetectTakeoff(floor: Floor): Promise<TakeoffProposal> {
  if (floor.sourceType === "dxf") {
    const raw = await getDxf(floor.id, floor.rawSource);
    if (raw && floor.dxfTransform) {
      return detectDxf(floor, raw);
    }
    // Fall back to raster detection on the rendered CAD image.
    const res = await detectRaster(floor);
    res.warnings.unshift(
      "Original CAD data isn't available this session (re-upload the DXF for exact extraction) — used image detection."
    );
    return res;
  }
  return detectRaster(floor);
}
