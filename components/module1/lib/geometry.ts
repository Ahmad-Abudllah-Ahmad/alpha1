import type { Point, ScaleCalibration, TakeoffElement } from "./types";

/** Euclidean distance between two points (pixels). */
export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Signed polygon area via the Shoelace formula (pixels²). */
export function polygonAreaPx(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/** Total length of an open polyline (pixels). */
export function polylineLengthPx(points: Point[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += distancePx(points[i], points[i + 1]);
  }
  return len;
}

/** Convert a pixel area to real m² using the calibration. */
export function areaToM2(areaPx: number, scale: ScaleCalibration): number {
  return areaPx * scale.metersPerPixel * scale.metersPerPixel;
}

/** Convert a pixel length to real meters using the calibration. */
export function lengthToM(lengthPx: number, scale: ScaleCalibration): number {
  return lengthPx * scale.metersPerPixel;
}

/**
 * Compute the real-world quantity for an element given the floor scale.
 * Returns null when the element cannot be quantified without a scale
 * (rooms and walls). Counts never need a scale.
 */
export function elementQuantity(
  el: TakeoffElement,
  scale: ScaleCalibration | null
): { value: number; unit: "m²" | "m" | "No." } | null {
  if (el.geometryType === "count") {
    return { value: 1, unit: "No." };
  }
  if (!scale) return null;
  if (el.geometryType === "polygon") {
    return { value: areaToM2(polygonAreaPx(el.points), scale), unit: "m²" };
  }
  // polyline (wall run) -> if a wall height is set, return wall AREA (m²),
  // otherwise return the run length (m).
  const runM = lengthToM(polylineLengthPx(el.points), scale);
  if (el.wallHeightM && el.wallHeightM > 0) {
    return { value: runM * el.wallHeightM, unit: "m²" };
  }
  return { value: runM, unit: "m" };
}

/**
 * Measured room footprint (axis-aligned bounding box) in real metres.
 * Returns null without a scale or for non-polygon geometry. Plans are almost
 * always drawn orthogonally, so the AABB is a faithful width x length.
 */
export function roomDimensionsM(
  points: Point[],
  scale: ScaleCalibration | null
): { widthM: number; lengthM: number } | null {
  if (!scale || points.length < 3) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    widthM: (maxX - minX) * scale.metersPerPixel,
    lengthM: (maxY - minY) * scale.metersPerPixel,
  };
}

/** Build a calibration record from a two-point measurement. */
export function buildCalibration(
  p1: Point,
  p2: Point,
  knownLengthM: number
): ScaleCalibration {
  const pixelDistance = distancePx(p1, p2);
  return {
    metersPerPixel: knownLengthM / pixelDistance,
    knownLengthM,
    pixelDistance,
    method: "two-point",
    verified: false,
    createdAt: Date.now(),
  };
}

/** Ray-casting point-in-polygon test (points in the same coordinate space). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Round to a fixed number of decimals for stable display. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
