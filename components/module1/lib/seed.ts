import { uid } from "./store";
import type { Floor, ScaleCalibration } from "./types";

/**
 * Seeds a ready-to-use project from bundled sample floor plans so
 * the workspace is populated on first open. Floors are imported CLEAN (no
 * takeoff elements) — the Auto-Takeoff pipeline detects rooms/openings on
 * demand. A plausible scale is pre-set so quantities can be priced immediately
 * after detection; re-calibrate against a real dimension for live work.
 */

interface SampleSpec {
  src: string;
  name: string;
  levelIndex: number;
  /** Assumed real building width (m) used to derive a demo scale. */
  assumedWidthM: number;
}

const SAMPLES: SampleSpec[] = [
  { src: "/floormap-villa.png", name: "Ground Floor", levelIndex: 0, assumedWidthM: 18 },
  { src: "/floormap-house.png", name: "First Floor", levelIndex: 1, assumedWidthM: 16 },
  { src: "/floormap-apartment.png", name: "Second Floor", levelIndex: 2, assumedWidthM: 13 },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Loads a bundled sample image and re-encodes it as an inline base64 data URL
 * (not just its public path). The Python backend's raster tier needs to
 * base64-decode `imageDataUrl` directly, so demo floors must carry real image
 * bytes just like user-imported ones do.
 */
function loadAsDataUrl(src: string): Promise<{ dataUrl: string; w: number; h: number }> {
  return loadImage(src).then((img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  });
}

export async function buildDemoFloors(): Promise<Floor[]> {
  const floors: Floor[] = [];
  for (const s of SAMPLES) {
    let img: { dataUrl: string; w: number; h: number };
    try {
      img = await loadAsDataUrl(s.src);
    } catch {
      continue;
    }
    const scale: ScaleCalibration = {
      metersPerPixel: s.assumedWidthM / img.w,
      knownLengthM: s.assumedWidthM,
      pixelDistance: img.w,
      method: "two-point",
      verified: true,
      verifiedLengthM: s.assumedWidthM,
      verifiedExpectedM: s.assumedWidthM,
      createdAt: Date.now(),
    };
    floors.push({
      id: uid("flr"),
      name: s.name,
      levelIndex: s.levelIndex,
      sourceType: "image",
      fileName: s.src.replace("/", ""),
      imageDataUrl: img.dataUrl,
      naturalWidth: img.w,
      naturalHeight: img.h,
      scale,
      elements: [],
      notes: "Ground floor — scale calibrated for sample drawing. Run Auto-Takeoff, then verify against a known dimension.",
      createdAt: Date.now(),
    });
  }
  return floors;
}
