import type { ElementKind, GeometryType, Point } from "../types";
import type { RoomType } from "../roomTypes";

/**
 * Unified proposal schema shared by every takeoff engine (in-browser LocalProvider
 * and the Python ApiProvider). Points are always in the floor image's natural
 * pixel frame so proposals overlay exactly on what the user sees.
 */

export interface ScaleProposal {
  metersPerPixel: number;
  method: "dxf-native" | "ocr" | "manual";
  /** 0..1 */
  confidence: number;
  note?: string;
}

export interface ElementProposal {
  kind: ElementKind;
  geometryType: GeometryType;
  points: Point[];
  label: string;
  /** 0..1 */
  confidence: number;
  /** dxf | pdf | opencv | ocr | openai */
  source: string;
  layer?: string;
  wallHeightM?: number;
  /** Classified room type (rooms only). */
  roomType?: RoomType;
  /** Dimension text read from the drawing, if any. */
  printedDimensions?: string;
}

export interface TakeoffProposal {
  elements: ElementProposal[];
  scale: ScaleProposal | null;
  warnings: string[];
  /** Which engine produced this (for UI messaging). */
  engine: "local" | "api";
}
