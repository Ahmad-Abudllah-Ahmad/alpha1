"use client";

import type { Floor } from "../types";
import { getDxf } from "./dxfRegistry";
import { getPdf } from "./pdfRegistry";
import type { TakeoffProposal } from "./schema";

/**
 * Calls the Python FastAPI backend. Sends the raster image for CV detection and,
 * for DXF floors, the raw CAD text plus the exact rasterization transform so the
 * backend returns points already aligned to the floor image (pixel frame).
 */
/**
 * The backend pipeline (CubiCasa CPU inference + GPT-5.5 Vision at full
 * "original" detail, sequentially) routinely takes 30-60s even on modest
 * images, and large DXF/DWG-derived CAD payloads take longer still to parse.
 * A flat 60s budget aborts real requests mid-flight, so we scale the timeout
 * with how much work there plausibly is: a generous base (vision alone can
 * take a while) plus extra time proportional to the DXF text size, capped so
 * a hung request still fails eventually instead of waiting forever.
 */
const BASE_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const DXF_MS_PER_CHAR = 0.02; // ~20s per extra 1,000,000 chars of DXF text

function computeTimeoutMs(dxfTextLength: number): number {
  return Math.min(MAX_TIMEOUT_MS, BASE_TIMEOUT_MS + dxfTextLength * DXF_MS_PER_CHAR);
}

export async function apiDetectTakeoff(floor: Floor, backendUrl: string): Promise<TakeoffProposal> {
  const base = backendUrl.replace(/\/+$/, "");
  const raw = await getDxf(floor.id, floor.rawSource);
  const pdfBytes = floor.sourceType === "pdf" ? getPdf(floor.pdfFileId) : undefined;

  const body = {
    sourceType: floor.sourceType,
    imageWidth: floor.naturalWidth,
    imageHeight: floor.naturalHeight,
    imageDataUrl: floor.imageDataUrl,
    dxf:
      floor.sourceType === "dxf" && raw && floor.dxfTransform
        ? { text: raw, transform: floor.dxfTransform }
        : null,
    pdf:
      pdfBytes && floor.pdfPageIndex != null
        ? { bytesBase64: pdfBytes, pageIndex: floor.pdfPageIndex }
        : null,
  };

  const timeoutMs = computeTimeoutMs(raw?.length ?? 0);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/takeoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Backend took longer than ${Math.round(timeoutMs / 1000)}s and was cancelled.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`backend responded ${res.status}`);
  }
  const json = await res.json();
  return {
    elements: Array.isArray(json.elements) ? json.elements : [],
    scale: json.scale ?? null,
    warnings: Array.isArray(json.warnings) ? json.warnings : [],
    engine: "api",
  };
}
