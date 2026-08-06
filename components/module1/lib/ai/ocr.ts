"use client";

/**
 * In-browser OCR (tesseract.js) used to read the text already printed on a plan:
 * room names ("KITCHEN", "BED-2") and dimension strings ("11'-0\"x14'-5\"").
 * We return every word with its pixel bounding box so callers can match text to
 * detected room polygons. The Tesseract worker + language model are created once
 * and reused (model cached in IndexedDB).
 */

export interface OcrWord {
  text: string;
  /** Center of the word box, in image pixel coordinates. */
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0..100 from Tesseract. */
  confidence: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let workerPromise: Promise<any> | null = null;

async function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng");
    })();
  }
  return workerPromise;
}

function flattenWords(data: any): OcrWord[] {
  const out: OcrWord[] = [];
  const push = (w: any) => {
    if (!w || !w.bbox) return;
    const text = (w.text ?? "").trim();
    if (!text) return;
    const { x0, y0, x1, y1 } = w.bbox;
    out.push({
      text,
      x0,
      y0,
      x1,
      y1,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      confidence: w.confidence ?? 0,
    });
  };

  if (Array.isArray(data?.words) && data.words.length) {
    data.words.forEach(push);
    return out;
  }
  // Fallback: walk the block tree (tesseract.js v5 with blocks output).
  for (const block of data?.blocks ?? []) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        for (const w of line?.words ?? []) push(w);
      }
    }
  }
  return out;
}

export async function runOcr(imageSrc: string): Promise<OcrWord[]> {
  try {
    const worker = await getWorker();
    const result = await worker.recognize(imageSrc, {}, { blocks: true });
    return flattenWords(result.data).filter((w) => w.confidence >= 40 && w.text.length >= 2);
  } catch {
    return [];
  }
}

/* --------------------------- Dimension string parsing --------------------------- */

function parseLenToM(s: string, feetContext: boolean): number | null {
  const t = s.trim();
  // Feet-inch: 11'-0", 11'0", 11'
  const fi = t.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*"?$/);
  if (fi) {
    const ft = parseFloat(fi[1]);
    const inch = fi[2] ? parseFloat(fi[2]) : 0;
    return (ft * 12 + inch) * 0.0254;
  }
  // Bare number: interpret via surrounding context (feet if the string used ').
  const num = t.match(/^(\d+(?:\.\d+)?)\s*(m|mm)?$/i);
  if (num) {
    const v = parseFloat(num[1]);
    const unit = (num[2] || "").toLowerCase();
    if (unit === "mm") return v / 1000;
    if (unit === "m") return v;
    return feetContext ? v * 0.3048 : v;
  }
  return null;
}

/**
 * Parse a printed dimension like `11'-0"x14'-5"` or `4.50 x 3.20` into metres.
 * Returns null if it doesn't look like a two-part dimension in a plausible range.
 */
export function parseDimensionString(
  raw: string
): { widthM: number; lengthM: number; text: string } | null {
  const text = raw.replace(/\s+/g, "");
  const parts = text.split(/[x×X]/);
  if (parts.length !== 2) return null;
  const feetContext = text.includes("'");
  const a = parseLenToM(parts[0], feetContext);
  const b = parseLenToM(parts[1], feetContext);
  if (a == null || b == null) return null;
  if (a < 0.3 || b < 0.3 || a > 60 || b > 60) return null;
  return { widthM: a, lengthM: b, text: raw.trim() };
}

export function looksLikeDimension(text: string): boolean {
  return /\d\s*['"]/.test(text) || /\d(?:\.\d+)?\s*[x×X]\s*\d/.test(text);
}
