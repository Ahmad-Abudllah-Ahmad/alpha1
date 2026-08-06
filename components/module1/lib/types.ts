/**
 * Domain model for the AI Estimation & Quantity Takeoff module.
 *
 * Coordinate system: all element/calibration points are stored in the floor
 * image's NATURAL pixel space (0..naturalWidth, 0..naturalHeight). This keeps
 * geometry independent of the on-screen display size and zoom level, which is
 * essential for measurements to stay accurate across devices.
 */

export type SourceType = "image" | "pdf" | "dxf";

export type ElementKind = "room" | "wall" | "door" | "window" | "column";

export type GeometryType = "polygon" | "polyline" | "count";

/** A point in natural image pixel coordinates. */
export interface Point {
  x: number;
  y: number;
}

/**
 * How a floor's drawing was calibrated to real-world units.
 * Without this, no area/length quantity can be trusted.
 */
export interface ScaleCalibration {
  /** Real-world meters represented by one natural image pixel. */
  metersPerPixel: number;
  /** The known real length (m) the user entered during calibration. */
  knownLengthM: number;
  /** The pixel distance that corresponded to knownLengthM. */
  pixelDistance: number;
  method: "two-point" | "dxf-native";
  /** True once the user has run a verification measurement against a 2nd known dimension. */
  verified: boolean;
  /** Reading from a verification measurement, if performed (real m). */
  verifiedLengthM?: number;
  /** The expected value the verification was checked against (real m). */
  verifiedExpectedM?: number;
  createdAt: number;
}

export interface TakeoffElement {
  id: string;
  kind: ElementKind;
  geometryType: GeometryType;
  label: string;
  /**
   * polygon: closed ring of vertices (area).
   * polyline: open run of vertices (linear).
   * count: a single marker point.
   */
  points: Point[];
  /** Wall height in meters, used to turn a wall run length into wall area. */
  wallHeightM?: number;
  /** Detection confidence 0..1 (undefined for hand-drawn items). */
  confidence?: number;
  /** "confirmed" items count toward the BOQ; "proposed" await human review. */
  status?: "proposed" | "confirmed";
  /** Where the item came from: manual, dxf, opencv, ocr, openai, magic. */
  source?: string;
  /** Originating CAD layer name, when known. */
  layer?: string;
  /** Classified room type (rooms only) — drives the rate profile in the BOQ. */
  roomType?: import("./roomTypes").RoomType;
  /** Dimension text read from the drawing (e.g. "11'-0\"x14'-5\""), for reference. */
  printedDimensions?: string;
  createdAt: number;
}

/**
 * The exact rasterization transform used when a DXF was imported. Lets us map
 * DXF world coordinates back onto the stored raster in pixel space so AI
 * proposals line up perfectly with what the user sees.
 */
export interface DxfTransform {
  minX: number;
  minY: number;
  pad: number;
  pxScale: number;
  canvasH: number;
  metersPerUnit: number;
}

export interface Floor {
  id: string;
  name: string;
  /** Ordering index; lower = lower floor. Basements can be negative. */
  levelIndex: number;
  sourceType: SourceType;
  fileName: string;
  /** Displayable raster of the sheet (PDF page rasterized, DXF rendered). */
  imageDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  scale: ScaleCalibration | null;
  elements: TakeoffElement[];
  /** Any importer notes/warnings surfaced to the user (e.g. DXF units assumed). */
  notes?: string;
  /** DXF-only: exact transform to map CAD world coords onto the raster. */
  dxfTransform?: DxfTransform;
  /** DXF-only: raw file text, kept for exact re-extraction (small files only). */
  rawSource?: string;
  /** PDF-only: session id for the source file's bytes (see pdfRegistry). */
  pdfFileId?: string;
  /** PDF-only: 0-based page index within the source file. */
  pdfPageIndex?: number;
  createdAt: number;
}

/**
 * A user-added estimate line that is NOT derived from drawn geometry — e.g.
 * "MEP allowance", "Kitchen joinery", a provisional sum. Amount = quantity ×
 * rate, added on top of the measured floor BOQs.
 */
export interface CustomBoqItem {
  id: string;
  description: string;
  /** Free-text unit label, e.g. "No.", "m²", "LS", "lot". */
  unit: string;
  quantity: number;
  rate: number;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  createdAt: number;
  floors: Floor[];
  /** Extra lump-sum / provisional items appended to the project estimate. */
  customItems?: CustomBoqItem[];
  /** Project-level BOQ approval stamp (optional — backward compatible). */
  approvedAt?: number;
  approvedBy?: string;
}

/**
 * Manual material-rate overrides — the actual supplier/quoted unit rate an
 * estimator enters for a material (cement, tiles, …), which wins over the
 * live-market and baseline rates. Keyed by material key. Empty by default.
 */
export interface RateOverrides {
  materials: Record<string, number>;
}

/** A user-registered material with its own unit rate, usable in recipes/items. */
export interface CustomMaterial {
  id: string;
  label: string;
  unit: string;
  rate: number;
}

/** Default assumed clear wall height (m) applied to new wall runs. */
export const DEFAULT_WALL_HEIGHT_M = 3.0;

export const ELEMENT_KIND_META: Record<
  ElementKind,
  { label: string; color: string; geometry: GeometryType; unit: "m²" | "m" | "No." }
> = {
  room: { label: "Room / Area", color: "#22c55e", geometry: "polygon", unit: "m²" },
  wall: { label: "Wall Run", color: "#3b82f6", geometry: "polyline", unit: "m" },
  door: { label: "Door", color: "#eab308", geometry: "count", unit: "No." },
  window: { label: "Window", color: "#06b6d4", geometry: "count", unit: "No." },
  column: { label: "Column", color: "#ef4444", geometry: "count", unit: "No." },
};
