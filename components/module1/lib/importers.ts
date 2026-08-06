"use client";

import { registerPdf } from "./ai/pdfRegistry";
import { uid } from "./store";
import type { DxfTransform, ScaleCalibration, SourceType } from "./types";

/** Max pixel dimension we rasterize to — keeps quality high but storage sane. */
const MAX_DIM = 2000;
const JPEG_QUALITY = 0.85;

export interface ImportedSheet {
  imageDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  sourceType: SourceType;
  fileName: string;
  /** Multi-page sources label each page, e.g. "Page 2 of 5". */
  pageLabel?: string;
  /** DXF sources carry a native (real-unit) scale so no manual calibration is needed. */
  nativeScale?: ScaleCalibration;
  /** DXF-only: transform to map CAD world coords onto this raster. */
  dxfTransform?: DxfTransform;
  /** DXF-only: raw file text for exact AI re-extraction. */
  rawSource?: string;
  /** PDF-only: session id for the source file's bytes (see pdfRegistry). */
  pdfFileId?: string;
  /** PDF-only: 0-based page index within the source file. */
  pdfPageIndex?: number;
  notes?: string;
}

export type SupportedKind = "image" | "pdf" | "dxf" | "dwg" | "unsupported";

export function classifyFile(file: File): SupportedKind {
  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return "image";
  if (/\.pdf$/.test(name)) return "pdf";
  if (/\.dxf$/.test(name)) return "dxf";
  if (/\.dwg$/.test(name)) return "dwg";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "unsupported";
}

function drawToDataUrl(
  source: CanvasImageSource,
  srcW: number,
  srcH: number
): { imageDataUrl: string; naturalWidth: number; naturalHeight: number } {
  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return {
    imageDataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
    naturalWidth: w,
    naturalHeight: h,
  };
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function importImage(file: File): Promise<ImportedSheet[]> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImageElement(dataUrl);
  const out = drawToDataUrl(img, img.naturalWidth, img.naturalHeight);
  return [
    {
      ...out,
      sourceType: "image",
      fileName: file.name,
      notes:
        "Raster/photo import — set the drawing scale before measuring (no embedded dimensions).",
    },
  ];
}

/* ------------------------------- PDF ------------------------------- */

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function importPdf(file: File): Promise<ImportedSheet[]> {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();

  // Retain the original bytes (session-only) so the backend can do exact vector
  // extraction. base64 via data URL avoids call-stack limits of btoa+spread.
  const pdfFileId = uid("pdf");
  try {
    registerPdf(pdfFileId, await fileToBase64(file));
  } catch {
    /* if we can't cache bytes, the vector path just falls back to raster */
  }

  const pdf = await pdfjs.getDocument({ data }).promise;
  const sheets: ImportedSheet[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_DIM / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    sheets.push({
      imageDataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      naturalWidth: canvas.width,
      naturalHeight: canvas.height,
      sourceType: "pdf",
      fileName: file.name,
      pageLabel: pdf.numPages > 1 ? `Page ${pageNum} of ${pdf.numPages}` : undefined,
      pdfFileId,
      pdfPageIndex: pageNum - 1,
      notes:
        "PDF page — vector PDFs usually print to a scale; confirm the drawing scale before measuring.",
    });
  }

  await pdf.cleanup();
  return sheets;
}

/* ------------------------------- DXF ------------------------------- */

/** Map DXF $INSUNITS code -> meters per drawing unit. */
const DXF_UNIT_TO_METERS: Record<number, { m: number; label: string }> = {
  0: { m: 0.001, label: "unitless (assumed mm)" },
  1: { m: 0.0254, label: "inches" },
  2: { m: 0.3048, label: "feet" },
  4: { m: 0.001, label: "millimeters" },
  5: { m: 0.01, label: "centimeters" },
  6: { m: 1, label: "meters" },
};

/** When $INSUNITS is missing/0, infer from drawing size (typical floor plans are 8–40 m). */
function inferMetersPerUnit(unitsCode: number | undefined, bbox: BBox): { m: number; label: string } {
  const declared = unitsCode != null ? DXF_UNIT_TO_METERS[unitsCode] : undefined;
  if (declared && unitsCode !== 0) return declared;

  const diag = bboxDiag(bbox);
  if (diag >= 4 && diag <= 80) return { m: 1, label: "meters (inferred from drawing size)" };
  if (diag >= 400 && diag <= 5000) return { m: 0.01, label: "centimeters (inferred from drawing size)" };
  if (diag >= 4000 && diag <= 80000) return { m: 0.001, label: "millimeters (inferred from drawing size)" };
  if (diag >= 80 && diag <= 400) return { m: 0.3048, label: "feet (inferred from drawing size)" };

  return declared ?? { m: 0.01, label: "centimeters (assumed)" };
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CadPoint {
  x: number;
  y: number;
}

interface CadTransform {
  origin: CadPoint;
  scaleX: number;
  scaleY: number;
  rotationRad: number;
  base: CadPoint;
}

function expand(b: BBox, x: number, y: number) {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

function entityBBox(entity: { type?: string; vertices?: { x: number; y: number }[]; center?: { x: number; y: number }; radius?: number; position?: { x: number; y: number } }): BBox | null {
  const b: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let has = false;
  forEachVertex(entity, (x, y) => {
    expand(b, x, y);
    has = true;
  });
  if (!has || !isFinite(b.minX) || b.maxX <= b.minX || b.maxY <= b.minY) return null;
  return b;
}

function bboxArea(b: BBox): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

function bboxCenter(b: BBox): { x: number; y: number } {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

function bboxDiag(b: BBox): number {
  return Math.hypot(Math.max(0, b.maxX - b.minX), Math.max(0, b.maxY - b.minY));
}

function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function isUsableBBox(b: BBox): boolean {
  return isFinite(b.minX) && isFinite(b.minY) && b.maxX > b.minX && b.maxY > b.minY;
}

function normalizeRotationRad(rotation: unknown): number {
  if (typeof rotation !== "number" || !Number.isFinite(rotation)) return 0;
  return Math.abs(rotation) > Math.PI * 2 ? (rotation * Math.PI) / 180 : rotation;
}

function getPoint(value: unknown): CadPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && typeof point.y === "number" && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : null;
}

function getEntityPoint(entity: unknown, keys: string[]): CadPoint | null {
  if (!entity || typeof entity !== "object") return null;
  const record = entity as Record<string, unknown>;
  for (const key of keys) {
    const point = getPoint(record[key]);
    if (point) return point;
  }
  return null;
}

function forEachPointList(value: unknown, cb: (x: number, y: number) => void) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const point = getPoint(item);
    if (point) cb(point.x, point.y);
  }
}

function makeInsertTransform(insert: any, block: any): CadTransform {
  const origin = getPoint(insert?.position) ?? { x: 0, y: 0 };
  const base = getPoint(block?.position) ?? getPoint(block?.basePoint) ?? { x: 0, y: 0 };
  return {
    origin,
    scaleX: typeof insert?.xScale === "number" ? insert.xScale : 1,
    scaleY: typeof insert?.yScale === "number" ? insert.yScale : 1,
    rotationRad: normalizeRotationRad(insert?.rotation),
    base,
  };
}

function transformPoint(point: CadPoint, transform: CadTransform): CadPoint {
  const x = (point.x - transform.base.x) * transform.scaleX;
  const y = (point.y - transform.base.y) * transform.scaleY;
  const cos = Math.cos(transform.rotationRad);
  const sin = Math.sin(transform.rotationRad);
  return {
    x: transform.origin.x + x * cos - y * sin,
    y: transform.origin.y + x * sin + y * cos,
  };
}

/** AutoCAD's reserved "Defpoints" layer holds invisible dimension helper points
 *  that are never meant to be seen or printed — but DWG->DXF conversion often
 *  keeps them, and a single stray point far from the drawing can balloon the
 *  bounding box and squeeze the real geometry into a corner of the raster. */
function isNonGraphicalLayer(layer: string | undefined): boolean {
  return !!layer && /^defpoints$/i.test(layer.trim());
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Computes the bounding box that actually frames the drawing, guarding
 * against a handful of far-flung stray entities (Defpoints markers, leftover
 * UCS icons, survey-coordinate origin points) that would otherwise dominate a
 * simple min/max bbox. Returns the tight content bbox plus a predicate for
 * which entities to keep (outliers/non-graphical layers are dropped).
 */
function computeContentBBox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  blockBounds: Map<string, BBox>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { bbox: BBox; keep: (e: any) => boolean } {
  const raw: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const centroids: { x: number; y: number }[] = [];

  for (const e of entities) {
    if (isNonGraphicalLayer(e?.layer)) continue;
    const b = worldEntityBBox(e, blockBounds);
    if (!b || !isFinite(b.minX)) continue;
    expand(raw, b.minX, b.minY);
    expand(raw, b.maxX, b.maxY);
    centroids.push({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  }

  const keepGraphical = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) => !isNonGraphicalLayer(e?.layer);

  if (!isFinite(raw.minX) || centroids.length < 20) {
    return { bbox: raw, keep: keepGraphical };
  }

  const xs = centroids.map((c) => c.x).sort((a, b) => a - b);
  const ys = centroids.map((c) => c.y).sort((a, b) => a - b);
  const trimmed: BBox = {
    minX: percentile(xs, 0.01),
    maxX: percentile(xs, 0.99),
    minY: percentile(ys, 0.01),
    maxY: percentile(ys, 0.99),
  };

  const rawDiag = bboxDiag(raw);
  const trimmedDiag = bboxDiag(trimmed);
  // Only intervene when trimming meaningfully shrinks the box — i.e. there's
  // a genuine far-flung outlier. Otherwise leave the untouched raw bbox alone.
  if (rawDiag <= 0 || trimmedDiag <= 0 || trimmedDiag > rawDiag * 0.6) {
    return { bbox: raw, keep: keepGraphical };
  }

  const marginX = (trimmed.maxX - trimmed.minX) * 0.08 || rawDiag * 0.02;
  const marginY = (trimmed.maxY - trimmed.minY) * 0.08 || rawDiag * 0.02;
  const padded: BBox = {
    minX: trimmed.minX - marginX,
    maxX: trimmed.maxX + marginX,
    minY: trimmed.minY - marginY,
    maxY: trimmed.maxY + marginY,
  };

  const keep = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) => {
    if (isNonGraphicalLayer(e?.layer)) return false;
    const b = worldEntityBBox(e, blockBounds);
    if (!b) return true;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    return cx >= padded.minX && cx <= padded.maxX && cy >= padded.minY && cy <= padded.maxY;
  };

  const tight: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of entities) {
    if (!keep(e)) continue;
    const b = worldEntityBBox(e, blockBounds);
    if (b) {
      expand(tight, b.minX, b.minY);
      expand(tight, b.maxX, b.maxY);
    }
  }

  return isFinite(tight.minX) ? { bbox: tight, keep } : { bbox: raw, keep: keepGraphical };
}

/** Precomputes each named block's local (unscaled) bounding box, for exploding INSERTs. */
function buildBlockBoundsCache(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: Record<string, any> | undefined
): Map<string, BBox> {
  const cache = new Map<string, BBox>();
  if (!blocks) return cache;
  for (const [name, block] of Object.entries(blocks)) {
    const b = emptyBBox();
    let has = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const be of (block as any)?.entities || []) {
      forEachVertex(be, (x, y) => {
        expand(b, x, y);
        has = true;
      });
    }
    if (has && isUsableBBox(b)) cache.set(name, b);
  }
  return cache;
}

/** World-space bbox of an entity, exploding INSERTs via their block definition + transform. */
function worldEntityBBox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: any,
  blockBounds: Map<string, BBox>
): BBox | null {
  if (e?.type === "INSERT" && e.position) {
    const pos = e.position;
    const sx = e.xScale ?? 1;
    const sy = e.yScale ?? 1;
    const bb = blockBounds.get(e.name);
    if (!bb) return { minX: pos.x, minY: pos.y, maxX: pos.x, maxY: pos.y };
    const transform = makeInsertTransform(e, null);
    transform.scaleX = sx;
    transform.scaleY = sy;
    const out = emptyBBox();
    for (const corner of [
      { x: bb.minX, y: bb.minY },
      { x: bb.minX, y: bb.maxY },
      { x: bb.maxX, y: bb.minY },
      { x: bb.maxX, y: bb.maxY },
    ]) {
      const p = transformPoint(corner, transform);
      expand(out, p.x, p.y);
    }
    return out;
  }
  return entityBBox(e);
}

/**
 * Splits a multi-plan CAD sheet into one region per floor plan / elevation.
 *
 * Strategy: stamp every entity's world-space footprint onto a fine occupancy
 * grid, then flood-fill connected components. Long "bridging" entities (sheet
 * borders, match lines, dimension/leader lines that span across several
 * plans) are excluded from the stamp — otherwise they fuse every plan into a
 * single blob, which is the #1 failure mode for this kind of layout.
 *
 * We only ever return a split when it's unambiguous (no candidate region
 * dominates the sheet, no region is essentially empty); otherwise we fall
 * back to a single combined floor rather than risk a broken partial split.
 */
function detectPlanRegions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  overall: BBox,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: Record<string, any> | undefined
): BBox[] {
  const overallDiag = bboxDiag(overall);
  if (overallDiag <= 0) return [overall];

  const blockBounds = buildBlockBoundsCache(blocks);
  const boxed: { bbox: BBox }[] = [];
  for (const e of entities) {
    const b = worldEntityBBox(e, blockBounds);
    if (b && isFinite(b.minX) && b.maxX > b.minX && b.maxY > b.minY) boxed.push({ bbox: b });
  }
  if (boxed.length < 8) return [overall];

  // Entities spanning a large fraction of the whole sheet are almost always
  // borders/annotations that bridge plans rather than belong to one — drop
  // them from clustering (they're still rendered later via entitiesForCluster).
  const seeds = boxed.filter(({ bbox }) => bboxDiag(bbox) <= overallDiag * 0.32);
  if (seeds.length < 8) return [overall];

  const spanW = overall.maxX - overall.minX;
  const spanH = overall.maxY - overall.minY;
  const aspect = spanW / spanH;
  const GH = 200;
  const GW = Math.max(40, Math.min(400, Math.round(GH * aspect)));
  const grid = new Uint8Array(GW * GH);

  for (const { bbox } of seeds) {
    const x0 = Math.max(0, Math.floor(((bbox.minX - overall.minX) / spanW) * GW));
    const x1 = Math.min(GW - 1, Math.floor(((bbox.maxX - overall.minX) / spanW) * GW));
    const y0 = Math.max(0, Math.floor(((bbox.minY - overall.minY) / spanH) * GH));
    const y1 = Math.min(GH - 1, Math.floor(((bbox.maxY - overall.minY) / spanH) * GH));
    for (let gy = y0; gy <= y1; gy++) {
      const row = gy * GW;
      for (let gx = x0; gx <= x1; gx++) grid[row + gx] = 1;
    }
  }

  const visited = new Uint8Array(GW * GH);
  interface Comp {
    minGX: number;
    maxGX: number;
    minGY: number;
    maxGY: number;
    cells: number;
  }
  const comps: Comp[] = [];

  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const start = gy * GW + gx;
      if (!grid[start] || visited[start]) continue;

      const comp: Comp = { minGX: gx, maxGX: gx, minGY: gy, maxGY: gy, cells: 0 };
      const stack = [start];
      visited[start] = 1;

      while (stack.length) {
        const cur = stack.pop()!;
        const cx = cur % GW;
        const cy = (cur - cx) / GW;
        comp.cells++;
        if (cx < comp.minGX) comp.minGX = cx;
        if (cx > comp.maxGX) comp.maxGX = cx;
        if (cy < comp.minGY) comp.minGY = cy;
        if (cy > comp.maxGY) comp.maxGY = cy;

        if (cx > 0 && grid[cur - 1] && !visited[cur - 1]) {
          visited[cur - 1] = 1;
          stack.push(cur - 1);
        }
        if (cx < GW - 1 && grid[cur + 1] && !visited[cur + 1]) {
          visited[cur + 1] = 1;
          stack.push(cur + 1);
        }
        if (cy > 0 && grid[cur - GW] && !visited[cur - GW]) {
          visited[cur - GW] = 1;
          stack.push(cur - GW);
        }
        if (cy < GH - 1 && grid[cur + GW] && !visited[cur + GW]) {
          visited[cur + GW] = 1;
          stack.push(cur + GW);
        }
      }

      comps.push(comp);
    }
  }

  if (comps.length < 2) return [overall];

  let regions: BBox[] = comps.map((c) => ({
    minX: overall.minX + (c.minGX / GW) * spanW,
    maxX: overall.minX + ((c.maxGX + 1) / GW) * spanW,
    minY: overall.minY + (c.minGY / GH) * spanH,
    maxY: overall.minY + ((c.maxGY + 1) / GH) * spanH,
  }));

  // Drop noise (stray marks, isolated dimension text) relative to the typical region.
  const areas = regions.map(bboxArea).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] || areas[0];
  regions = regions.filter((r) => bboxArea(r) >= Math.max(median * 0.15, overallDiag * overallDiag * 0.0004));

  if (regions.length < 2) return [overall];

  // A confident split shouldn't have one region swallowing most of the sheet,
  // nor should it be leaving most of the drawing's area unclustered.
  const totalArea = bboxArea(overall);
  if (regions.some((r) => bboxArea(r) > totalArea * 0.55)) return [overall];
  const coveredArea = regions.reduce((sum, r) => sum + bboxArea(r), 0);
  if (coveredArea < totalArea * 0.15) return [overall];

  if (!isConfidentMultiPlanSplit(regions, entities, blockBounds, blocks, overall)) {
    return [overall];
  }

  return regions.sort((a, b) => bboxCenter(b).y - bboxCenter(a).y || bboxCenter(a).x - bboxCenter(b).x);
}

/** Only split when every region looks like a real separate plan, not a wall fragment. */
function isConfidentMultiPlanSplit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  regions: BBox[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  blockBounds: Map<string, BBox>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: Record<string, any> | undefined,
  overall: BBox
): boolean {
  if (regions.length < 2 || regions.length > 6) return false;

  const span = Math.max(overall.maxX - overall.minX, overall.maxY - overall.minY);
  const pad = 0.04 * span;
  const counts = regions.map((r) => entitiesForCluster(entities, blockBounds, blocks, r, pad).length);
  const totalAssigned = counts.reduce((sum, n) => sum + n, 0);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const minRequired = Math.max(15, Math.round(entities.length * 0.12));

  if (minCount < minRequired) return false;
  if (maxCount > entities.length * 0.6) return false;
  if (totalAssigned < entities.length * 0.8) return false;

  const regionAreas = regions.map(bboxArea).sort((a, b) => a - b);
  if (regionAreas[0] < regionAreas[regionAreas.length - 1] * 0.1) return false;

  return true;
}


function tightenCluster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  region: BBox,
  pad: number
): BBox {
  const cb: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of entities) {
    if (!entityInCluster(e, region, pad)) continue;
    const eb = entityBBox(e);
    if (!eb) continue;
    expand(cb, eb.minX, eb.minY);
    expand(cb, eb.maxX, eb.maxY);
    count++;
  }
  return count > 0 ? cb : region;
}

/** Each BLOCK INSERT at a distinct position often represents one plan view in DWG exports. */
function transformBlockEntity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: any,
  transform: CadTransform
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const t = e?.type;
  if (t === "LINE" || t === "LWPOLYLINE" || t === "POLYLINE") {
    return {
      ...e,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vertices: (e.vertices || []).map((v: any) => ({ ...v, ...transformPoint(v, transform) })),
    };
  }
  if (t === "CIRCLE" || t === "ARC") {
    const c = e.center || {};
    const center = transformPoint(c, transform);
    return {
      ...e,
      center,
      radius: (e.radius || 0) * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY)),
      startAngle: typeof e.startAngle === "number" ? e.startAngle + transform.rotationRad : e.startAngle,
      endAngle: typeof e.endAngle === "number" ? e.endAngle + transform.rotationRad : e.endAngle,
    };
  }
  if (t === "ELLIPSE") {
    const center = transformPoint(e.center || e.position || { x: 0, y: 0 }, transform);
    const axis = transformPoint(e.majorAxisEndPoint || e.majorAxisEndpoint || { x: 0, y: 0 }, {
      ...transform,
      origin: { x: 0, y: 0 },
      base: { x: 0, y: 0 },
    });
    return { ...e, center, majorAxisEndPoint: axis, majorAxisEndpoint: axis };
  }
  if (t === "SPLINE") {
    return {
      ...e,
      controlPoints: (e.controlPoints || []).map((p: any) => ({ ...p, ...transformPoint(p, transform) })),
      fitPoints: (e.fitPoints || []).map((p: any) => ({ ...p, ...transformPoint(p, transform) })),
    };
  }
  if (t === "SOLID" || t === "TRACE" || t === "3DFACE") {
    return {
      ...e,
      points: (e.points || []).map((p: any) => ({ ...p, ...transformPoint(p, transform) })),
      vertices: (e.vertices || []).map((p: any) => ({ ...p, ...transformPoint(p, transform) })),
    };
  }
  if (t === "TEXT" || t === "MTEXT") {
    const p = e.startPoint || e.position || {};
    const point = transformPoint(p, transform);
    return {
      ...e,
      startPoint: point,
      position: point,
    };
  }
  return e;
}

/** Expand INSERT references into world-space LINE/LWPOLYLINE/etc. for raster + takeoff. */
function flattenEntities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: Record<string, any> | undefined,
  depth = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  if (depth > 8) return entities;
  for (const e of entities) {
    if (e?.type === "INSERT" && e.position) {
      const block = blocks?.[e.name];
      if (block?.entities?.length) {
        const transform = makeInsertTransform(e, block);
        const flattenedBlock = flattenEntities(block.entities, blocks, depth + 1);
        for (const be of flattenedBlock.filter((candidate: any) => candidate?.type !== "INSERT")) {
          out.push(transformBlockEntity(be, transform));
        }
        continue;
      }
    }
    out.push(e);
  }
  return out;
}

function computeEntitiesBBox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  blockBounds: Map<string, BBox>
): BBox {
  const b: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of entities) {
    const eb = worldEntityBBox(e, blockBounds);
    if (eb) {
      expand(b, eb.minX, eb.minY);
      expand(b, eb.maxX, eb.maxY);
    }
  }
  return b;
}

/** Collect model-space entities (and exploded block geometry) that belong to one plan region. */
function entitiesForCluster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  blockBounds: Map<string, BBox>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: Record<string, any> | undefined,
  cluster: BBox,
  pad: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (const e of entities) {
    if (e?.type === "INSERT" && e.position) {
      const insBbox = worldEntityBBox(e, blockBounds);
      if (!insBbox) continue;
      const cx = (insBbox.minX + insBbox.maxX) / 2;
      const cy = (insBbox.minY + insBbox.maxY) / 2;
      if (cx < cluster.minX - pad || cx > cluster.maxX + pad || cy < cluster.minY - pad || cy > cluster.maxY + pad) {
        continue;
      }
      const block = blocks?.[e.name];
      if (block) {
        const transform = makeInsertTransform(e, block);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const be of block.entities || []) {
          out.push(transformBlockEntity(be, transform));
        }
      }
    } else if (entityInCluster(e, cluster, pad)) {
      out.push(e);
    }
  }
  return out;
}

function entityInCluster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entity: any,
  cluster: BBox,
  pad: number
): boolean {
  const eb = entityBBox(entity);
  if (!eb) return false;
  const cx = (eb.minX + eb.maxX) / 2;
  const cy = (eb.minY + eb.maxY) / 2;
  return cx >= cluster.minX - pad && cx <= cluster.maxX + pad && cy >= cluster.minY - pad && cy <= cluster.maxY + pad;
}

function getOrderedPoints(entity: any): CadPoint[] {
  const points: CadPoint[] = [];
  const pushPoint = (value: unknown) => {
    const p = getPoint(value);
    if (p) points.push(p);
  };

  if (Array.isArray(entity?.vertices)) entity.vertices.forEach(pushPoint);
  else if (Array.isArray(entity?.points)) entity.points.forEach(pushPoint);
  else if (Array.isArray(entity?.fitPoints)) entity.fitPoints.forEach(pushPoint);
  else if (Array.isArray(entity?.controlPoints)) entity.controlPoints.forEach(pushPoint);

  if (points.length === 0) {
    const start = getEntityPoint(entity, ["startPoint", "start", "p1"]);
    const end = getEntityPoint(entity, ["endPoint", "end", "p2"]);
    if (start && end) points.push(start, end);
  }

  return points;
}

function strokePoints(
  ctx: CanvasRenderingContext2D,
  points: CadPoint[],
  tx: (x: number) => number,
  ty: (y: number) => number,
  closed: boolean
) {
  ctx.beginPath();
  ctx.moveTo(tx(points[0].x), ty(points[0].y));
  for (let i = 1; i < points.length; i++) ctx.lineTo(tx(points[i].x), ty(points[i].y));
  if (closed) ctx.closePath();
  ctx.stroke();
}

function sampleEllipsePoints(entity: any): CadPoint[] {
  const points: CadPoint[] = [];
  forEachEllipsePoint(entity, (x, y) => points.push({ x, y }));
  return points;
}

function getHatchPaths(entity: any): CadPoint[][] {
  const paths = entity?.boundaryPaths || entity?.boundaryPath || entity?.paths || [];
  const out: CadPoint[][] = [];
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const points = getOrderedPoints(path);
    const edges = path?.edges || path?.edgeData || [];
    for (const edge of Array.isArray(edges) ? edges : [edges]) {
      const edgePoints = getOrderedPoints(edge);
      if (edgePoints.length > 0) points.push(...edgePoints);
    }
    if (points.length > 0) out.push(points);
  }
  return out;
}

function rasterizeDxfEntities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[],
  bbox: BBox,
  unitsCode: number | undefined,
  fileName: string,
  pageLabel?: string
): ImportedSheet {
  const drawW = bbox.maxX - bbox.minX;
  const drawH = bbox.maxY - bbox.minY;
  const pad = 0.04 * Math.max(drawW, drawH);
  const contentW = drawW + pad * 2;
  const contentH = drawH + pad * 2;
  const pxScale = Math.min(MAX_DIM / contentW, MAX_DIM / contentH);
  const canvasW = Math.max(1, Math.round(contentW * pxScale));
  const canvasH = Math.max(1, Math.round(contentH * pxScale));

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = Math.max(1, pxScale * 0.35);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const tx = (x: number) => (x - bbox.minX + pad) * pxScale;
  const ty = (y: number) => canvasH - (y - bbox.minY + pad) * pxScale;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities.forEach((e: any) => {
    const type = e?.type;
    if (type === "LINE" || type === "LWPOLYLINE" || type === "POLYLINE") {
      const verts = getOrderedPoints(e);
      if (verts.length < 2) return;
      strokePoints(ctx, verts, tx, ty, !!(e.shape || e.closed));
    } else if (type === "CIRCLE") {
      ctx.beginPath();
      ctx.arc(tx(e.center.x), ty(e.center.y), (e.radius || 0) * pxScale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === "ARC") {
      const start = e.startAngle ?? 0;
      const end = e.endAngle ?? Math.PI * 2;
      ctx.beginPath();
      ctx.arc(tx(e.center.x), ty(e.center.y), (e.radius || 0) * pxScale, -start, -end, true);
      ctx.stroke();
    } else if (type === "ELLIPSE") {
      const points = sampleEllipsePoints(e);
      if (points.length > 1) strokePoints(ctx, points, tx, ty, !!e.closed);
    } else if (type === "SPLINE") {
      const points = getOrderedPoints(e);
      if (points.length > 1) strokePoints(ctx, points, tx, ty, false);
    } else if (type === "SOLID" || type === "TRACE" || type === "3DFACE") {
      const points = getOrderedPoints(e);
      if (points.length > 1) strokePoints(ctx, points, tx, ty, true);
    } else if (type === "HATCH") {
      for (const points of getHatchPaths(e)) {
        if (points.length > 1) strokePoints(ctx, points, tx, ty, true);
      }
    }
  });

  const unit = inferMetersPerUnit(unitsCode, bbox);
  const metersPerUnit = unit.m;
  const metersPerPixel = metersPerUnit / pxScale;

  const nativeScale: ScaleCalibration = {
    metersPerPixel,
    knownLengthM: drawW * metersPerUnit,
    pixelDistance: drawW * pxScale,
    method: "dxf-native",
    verified: unitsCode != null && unitsCode !== 0,
    createdAt: Date.now(),
  };

  const notes =
    unitsCode != null && unitsCode !== 0
      ? `CAD import — real units detected (${unit.label}). Scale set automatically from the DXF.`
      : `CAD import — ${unit.label}. Scale inferred from drawing size; verify before measuring.`;

  const dxfTransform: DxfTransform = {
    minX: bbox.minX,
    minY: bbox.minY,
    pad,
    pxScale,
    canvasH,
    metersPerUnit,
  };

  return {
    imageDataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
    naturalWidth: canvasW,
    naturalHeight: canvasH,
    sourceType: "dxf",
    fileName,
    pageLabel,
    nativeScale,
    dxfTransform,
    notes,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function forEachVertex(entity: any, cb: (x: number, y: number) => void) {
  const type = entity?.type;
  if (!type) return;
  if (type === "LINE" || type === "LWPOLYLINE" || type === "POLYLINE") {
    forEachPointList(entity.vertices, cb);
    const start = getEntityPoint(entity, ["startPoint", "start", "p1"]);
    const end = getEntityPoint(entity, ["endPoint", "end", "p2"]);
    if (start && end) {
      cb(start.x, start.y);
      cb(end.x, end.y);
    }
  } else if (type === "CIRCLE") {
    const c = entity.center;
    const r = entity.radius || 0;
    if (c) {
      cb(c.x - r, c.y - r);
      cb(c.x + r, c.y + r);
    }
  } else if (type === "ARC") {
    forEachArcPoint(entity, cb);
  } else if (type === "ELLIPSE") {
    forEachEllipsePoint(entity, cb);
  } else if (type === "SPLINE") {
    forEachPointList(entity.fitPoints, cb);
    forEachPointList(entity.controlPoints, cb);
  } else if (type === "SOLID" || type === "TRACE" || type === "3DFACE") {
    forEachPointList(entity.points, cb);
    forEachPointList(entity.vertices, cb);
  } else if (type === "HATCH") {
    forEachHatchPoint(entity, cb);
  } else if (type === "POINT" && entity.position) {
    cb(entity.position.x, entity.position.y);
  } else if (type === "INSERT" && entity.position) {
    cb(entity.position.x, entity.position.y);
  } else if ((type === "TEXT" || type === "MTEXT") && (entity.startPoint || entity.position)) {
    const p = entity.startPoint || entity.position;
    if (typeof p.x === "number" && typeof p.y === "number") cb(p.x, p.y);
  }
}

function forEachArcPoint(entity: any, cb: (x: number, y: number) => void) {
  const c = getPoint(entity.center);
  const radius = typeof entity.radius === "number" ? entity.radius : 0;
  if (!c || radius <= 0) return;
  let start = typeof entity.startAngle === "number" ? entity.startAngle : 0;
  let end = typeof entity.endAngle === "number" ? entity.endAngle : Math.PI * 2;
  start = normalizeRotationRad(start);
  end = normalizeRotationRad(end);
  const span = end >= start ? end - start : end + Math.PI * 2 - start;
  const steps = Math.max(8, Math.ceil(span / (Math.PI / 12)));
  for (let i = 0; i <= steps; i++) {
    const angle = start + (span * i) / steps;
    cb(c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius);
  }
}

function forEachEllipsePoint(entity: any, cb: (x: number, y: number) => void) {
  const c = getPoint(entity.center) ?? getPoint(entity.position);
  if (!c) return;
  const axis = getPoint(entity.majorAxisEndPoint) ?? getPoint(entity.majorAxisEndpoint) ?? { x: entity.majorX || 0, y: entity.majorY || 0 };
  const ratio = typeof entity.axisRatio === "number" && entity.axisRatio > 0 ? entity.axisRatio : 1;
  const major = Math.hypot(axis.x, axis.y);
  const rotation = Math.atan2(axis.y, axis.x);
  const minor = major * ratio;
  if (major <= 0) return;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    const x = Math.cos(t) * major;
    const y = Math.sin(t) * minor;
    cb(c.x + x * cos - y * sin, c.y + x * sin + y * cos);
  }
}

function forEachHatchPoint(entity: any, cb: (x: number, y: number) => void) {
  const paths = entity.boundaryPaths || entity.boundaryPath || entity.paths || [];
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    forEachPointList(path?.vertices, cb);
    forEachPointList(path?.points, cb);
    const edges = path?.edges || path?.edgeData || [];
    for (const edge of Array.isArray(edges) ? edges : [edges]) {
      const start = getEntityPoint(edge, ["startPoint", "start"]);
      const end = getEntityPoint(edge, ["endPoint", "end"]);
      if (start) cb(start.x, start.y);
      if (end) cb(end.x, end.y);
      if (edge?.center && edge?.radius) forEachArcPoint(edge, cb);
    }
  }
}

/** Shared by DXF (parsed client-side) and DWG (converted server-side, then parsed here). */
async function buildDxfSheet(text: string, fileName: string): Promise<ImportedSheet[]> {
  const { default: DxfParser } = await import("dxf-parser");
  const parser = new DxfParser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dxf: any;
  try {
    dxf = parser.parseSync(text);
  } catch {
    throw new Error("This DXF could not be parsed. Export it as an ASCII DXF and retry.");
  }
  if (!dxf || !Array.isArray(dxf.entities) || dxf.entities.length === 0) {
    throw new Error("No drawing entities were found in this DXF file.");
  }

  const blockBounds = buildBlockBoundsCache(dxf.blocks);
  const { bbox: rawBbox, keep } = computeContentBBox(dxf.entities, blockBounds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entities: any[] = flattenEntities(dxf.entities.filter(keep), dxf.blocks);

  if (entities.length === 0) {
    throw new Error("No drawable geometry was found in this DXF file.");
  }

  const bbox = computeEntitiesBBox(entities, blockBounds);
  const hasExtent =
    isFinite(bbox.minX) && bbox.maxX > bbox.minX && bbox.maxY > bbox.minY;
  if (!hasExtent) {
    if (!isFinite(rawBbox.minX) || rawBbox.maxX <= rawBbox.minX || rawBbox.maxY <= rawBbox.minY) {
      throw new Error("DXF geometry has no measurable extent (unsupported entity types).");
    }
    Object.assign(bbox, rawBbox);
  }

  const unitsCode: number | undefined = dxf.header?.["$INSUNITS"];
  const clusters = detectPlanRegions(entities, bbox, dxf.blocks);

  if (clusters.length <= 1) {
    const sheet = rasterizeDxfEntities(entities, bbox, unitsCode, fileName);
    return [{ ...sheet, rawSource: text }];
  }

  return clusters.map((cluster, i) => {
    const clusterW = cluster.maxX - cluster.minX;
    const clusterH = cluster.maxY - cluster.minY;
    const pad = 0.04 * Math.max(clusterW, clusterH);
    const subset = entitiesForCluster(entities, blockBounds, dxf.blocks, cluster, pad);
    const tight = subset.length > 0 ? tightenCluster(subset, cluster, pad * 0.5) : cluster;
    const pageLabel = `Plan ${i + 1} of ${clusters.length}`;
    const sheet = rasterizeDxfEntities(subset, tight, unitsCode, fileName, pageLabel);
    return {
      ...sheet,
      rawSource: text,
      notes: `${sheet.notes} Detected ${clusters.length} separate plans in this file — each is imported as its own floor.`,
    };
  });
}

export async function importDxf(file: File): Promise<ImportedSheet[]> {
  const text = await file.text();
  return buildDxfSheet(text, file.name);
}

/** Backend base64-encodes bytes without call-stack-limited spread tricks. */
async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

/**
 * DWG is Autodesk's proprietary binary format with no reliable open-source
 * parser, so we can't read it client-side like DXF. Instead we send the raw
 * bytes to the Python backend, which shells out to the free ODA File
 * Converter (DWG -> DXF) and returns plain DXF text — from there it's the
 * same exact/native pipeline as a native DXF import.
 */
export async function importDwg(file: File, backendUrl: string): Promise<ImportedSheet[]> {
  const base64 = await fileToBase64(file);
  const base = backendUrl.replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${base}/convert-dwg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64: base64 }),
    });
  } catch {
    throw new Error(
      "Couldn't reach the Python backend to convert this DWG. Make sure it's running (Settings → Online engine URL)."
    );
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message =
      typeof detail?.detail === "string"
        ? detail.detail
        : `DWG conversion failed (HTTP ${res.status}). The server could not read this DWG — try exporting DXF from AutoCAD, or use a 2013-or-older DWG.`;
    throw new Error(message);
  }

  const { dxfText, dwgVersion, converter, warnings } = (await res.json()) as {
    dxfText: string;
    dwgVersion?: string;
    converter?: string;
    warnings?: string[];
  };
  const sheets = await buildDxfSheet(dxfText, file.name);
  const conversionNote = [
    dwgVersion ? `DWG converted from ${dwgVersion}` : null,
    converter ? `converter: ${converter}` : null,
    ...(warnings ?? []),
  ].filter(Boolean);

  if (conversionNote.length === 0) return sheets;
  return sheets.map((sheet) => ({
    ...sheet,
    notes: `${sheet.notes ?? ""} ${conversionNote.join(" · ")}`.trim(),
  }));
}

export interface ImportResult {
  sheets: ImportedSheet[];
  errors: { fileName: string; message: string }[];
}

/** Import a batch of mixed files, expanding multi-page PDFs into multiple sheets. */
export async function importFiles(files: File[], backendUrl: string): Promise<ImportResult> {
  const sheets: ImportedSheet[] = [];
  const errors: { fileName: string; message: string }[] = [];

  for (const file of files) {
    const kind = classifyFile(file);
    try {
      if (kind === "image") sheets.push(...(await importImage(file)));
      else if (kind === "pdf") sheets.push(...(await importPdf(file)));
      else if (kind === "dxf") sheets.push(...(await importDxf(file)));
      else if (kind === "dwg") sheets.push(...(await importDwg(file, backendUrl)));
      else
        errors.push({
          fileName: file.name,
          message: "Unsupported file type. Use PNG, JPG, PDF, or DXF.",
        });
    } catch (err) {
      errors.push({
        fileName: file.name,
        message: err instanceof Error ? err.message : "Import failed.",
      });
    }
  }

  return { sheets, errors };
}
