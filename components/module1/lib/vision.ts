import type { Point } from "./types";

/**
 * Lightweight in-browser room detection: the user clicks inside an enclosed
 * space and we region-grow across light pixels bounded by dark wall lines,
 * then trace and simplify the outline into a polygon.
 *
 * This is an assist — results are always shown for the estimator to verify and
 * adjust. Hard guardrails reject "leaked" regions (open door gaps) so we never
 * silently report a wrong, oversized area.
 */

export interface DetectResult {
  ok: true;
  points: Point[];
  /** Filled pixel count (exact region area in px²). */
  fillPx: number;
}

export interface DetectError {
  ok: false;
  message: string;
}

function luminance(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

export function detectRoomAt(
  image: ImageData,
  startX: number,
  startY: number,
  opts: { threshold?: number; maxAreaFraction?: number } = {}
): DetectResult | DetectError {
  const { width: w, height: h, data } = image;
  const threshold = opts.threshold ?? 205;
  const maxAreaFraction = opts.maxAreaFraction ?? 0.6;

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
    return { ok: false, message: "Clicked outside the drawing." };
  }

  const startIdx = (sy * w + sx) * 4;
  if (luminance(data, startIdx) < threshold) {
    return {
      ok: false,
      message: "That point is on a wall or line. Click inside the open floor of a room.",
    };
  }

  const mask = new Uint8Array(w * h);
  const stack: number[] = [sy * w + sx];
  mask[sy * w + sx] = 1;
  let count = 0;
  const limit = w * h * maxAreaFraction;

  while (stack.length) {
    const p = stack.pop() as number;
    count++;
    if (count > limit) {
      return {
        ok: false,
        message:
          "The region isn't fully enclosed (it leaked through an opening). Close the door/window gap or draw this room manually.",
      };
    }
    const y = (p / w) | 0;
    const x = p - y * w;
    // 4-connected neighbours
    if (x + 1 < w) {
      const n = p + 1;
      if (!mask[n] && luminance(data, n * 4) >= threshold) {
        mask[n] = 1;
        stack.push(n);
      }
    }
    if (x - 1 >= 0) {
      const n = p - 1;
      if (!mask[n] && luminance(data, n * 4) >= threshold) {
        mask[n] = 1;
        stack.push(n);
      }
    }
    if (y + 1 < h) {
      const n = p + w;
      if (!mask[n] && luminance(data, n * 4) >= threshold) {
        mask[n] = 1;
        stack.push(n);
      }
    }
    if (y - 1 >= 0) {
      const n = p - w;
      if (!mask[n] && luminance(data, n * 4) >= threshold) {
        mask[n] = 1;
        stack.push(n);
      }
    }
  }

  if (count < 400) {
    return {
      ok: false,
      message: "The detected space is too small. Zoom in and click a clearer area, or draw it manually.",
    };
  }

  const contour = mooreTrace(mask, w, h);
  if (contour.length < 4) {
    return { ok: false, message: "Couldn't trace the room outline. Please draw it manually." };
  }

  const epsilon = Math.max(2, Math.max(w, h) * 0.004);
  const simplified = rdp(contour, epsilon);
  const points: Point[] = (simplified.length >= 3 ? simplified : contour).map(([x, y]) => ({ x, y }));

  return { ok: true, points, fillPx: count };
}

/** Moore-neighbour boundary tracing (clockwise) of a solid binary blob. */
function mooreTrace(mask: Uint8Array, w: number, h: number): [number, number][] {
  const isSet = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  // Clockwise 8-neighbourhood starting at West.
  const off: [number, number][] = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ];

  let start: [number, number] | null = null;
  for (let y = 0; y < h && !start; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 1) {
        start = [x, y];
        break;
      }
    }
  }
  if (!start) return [];

  const out: [number, number][] = [start];
  let b: [number, number] = [start[0] - 1, start[1]];
  let p: [number, number] = start;
  const maxSteps = 8 * (w + h) + count1(mask) * 2 + 1000;
  let steps = 0;

  while (steps++ < maxSteps) {
    let d = 0;
    for (let i = 0; i < 8; i++) {
      if (p[0] + off[i][0] === b[0] && p[1] + off[i][1] === b[1]) {
        d = i;
        break;
      }
    }
    let found: [number, number] | null = null;
    let prev: [number, number] = b;
    for (let k = 1; k <= 8; k++) {
      const i = (d + k) % 8;
      const cx = p[0] + off[i][0];
      const cy = p[1] + off[i][1];
      if (isSet(cx, cy)) {
        found = [cx, cy];
        break;
      }
      prev = [cx, cy];
    }
    if (!found) break;
    b = prev;
    p = found;
    if (p[0] === start[0] && p[1] === start[1]) break;
    out.push(p);
  }
  return out;
}

function count1(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) c++;
  return c;
}

/** Ramer–Douglas–Peucker polyline simplification. */
function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpDistance(points[i], ax, ay, bx, by);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function perpDistance(
  p: [number, number],
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p[0] - ax) * dy - (p[1] - ay) * dx) / len;
}

/* --------------------- Whole-plan automatic room detection --------------------- */

export interface DetectedRoom {
  points: Point[];
  /** 0..1 */
  confidence: number;
  fillPx: number;
}

interface Region {
  pixels: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  touchedBorder: boolean;
}

function floodRegion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  visited: Uint8Array,
  seed: number,
  threshold: number
): Region {
  const pixels: number[] = [];
  const stack: number[] = [seed];
  visited[seed] = 1;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0,
    touchedBorder = false;

  while (stack.length) {
    const p = stack.pop() as number;
    pixels.push(p);
    const y = (p / w) | 0;
    const x = p - y * w;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchedBorder = true;

    if (x + 1 < w) {
      const n = p + 1;
      if (!visited[n] && luminance(data, n * 4) >= threshold) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (x - 1 >= 0) {
      const n = p - 1;
      if (!visited[n] && luminance(data, n * 4) >= threshold) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (y + 1 < h) {
      const n = p + w;
      if (!visited[n] && luminance(data, n * 4) >= threshold) {
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (y - 1 >= 0) {
      const n = p - w;
      if (!visited[n] && luminance(data, n * 4) >= threshold) {
        visited[n] = 1;
        stack.push(n);
      }
    }
  }

  return { pixels, minX, minY, maxX, maxY, count: pixels.length, touchedBorder };
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Scans the whole plan and returns every enclosed room-like region as a polygon.
 * Regions that leak to the drawing border (exterior/background) or fall outside
 * plausible room-size bounds are discarded, so we don't emit garbage the user
 * has to clean up.
 */
export function detectAllRooms(
  image: ImageData,
  opts: { threshold?: number } = {}
): DetectedRoom[] {
  const { width: w, height: h, data } = image;
  const threshold = opts.threshold ?? 205;
  const visited = new Uint8Array(w * h);
  const total = w * h;
  const minRoom = Math.max(700, total * 0.0006);
  const maxRoom = total * 0.5;
  const stride = 5;
  const rooms: DetectedRoom[] = [];

  for (let sy = 0; sy < h; sy += stride) {
    for (let sx = 0; sx < w; sx += stride) {
      const seed = sy * w + sx;
      if (visited[seed]) continue;
      if (luminance(data, seed * 4) < threshold) {
        visited[seed] = 1;
        continue;
      }
      const region = floodRegion(data, w, h, visited, seed, threshold);
      if (region.touchedBorder) continue;
      if (region.count < minRoom || region.count > maxRoom) continue;

      const bw = region.maxX - region.minX + 1;
      const bh = region.maxY - region.minY + 1;
      const local = new Uint8Array(bw * bh);
      for (const idx of region.pixels) {
        const y = (idx / w) | 0;
        const x = idx - y * w;
        local[(y - region.minY) * bw + (x - region.minX)] = 1;
      }
      const contour = mooreTrace(local, bw, bh);
      if (contour.length < 4) continue;

      const epsilon = Math.max(2, Math.max(w, h) * 0.004);
      const simplified = rdp(contour, epsilon);
      const src = simplified.length >= 3 ? simplified : contour;
      const points: Point[] = src.map(([x, y]) => ({ x: x + region.minX, y: y + region.minY }));

      const polyA = polygonArea(points);
      const agreement = polyA > 0 ? Math.min(polyA, region.count) / Math.max(polyA, region.count) : 0;
      // Discard very concave / ragged traces (likely walls or text clusters).
      if (agreement < 0.55) continue;

      rooms.push({
        points,
        confidence: Math.max(0.35, Math.min(0.97, agreement)),
        fillPx: region.count,
      });
    }
  }

  return rooms;
}
