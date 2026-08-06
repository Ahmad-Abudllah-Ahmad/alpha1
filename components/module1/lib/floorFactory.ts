import { registerDxf } from "./ai/dxfRegistry";
import type { ImportedSheet } from "./importers";
import { uid } from "./store";
import type { Floor } from "./types";

const PERSIST_RAW_LIMIT = 1_500_000;

const LEVEL_NAMES = [
  "Ground Floor",
  "First Floor",
  "Second Floor",
  "Third Floor",
  "Fourth Floor",
  "Fifth Floor",
  "Sixth Floor",
];

export function levelName(index: number): string {
  if (index < 0) return `Basement ${Math.abs(index)}`;
  return LEVEL_NAMES[index] ?? `Level ${index}`;
}

/** Try to read a sensible floor name from the source file name. */
function nameFromFile(fileName: string, fallback: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = base.match(/(ground|mezzanine|roof|basement|(?:first|second|third|fourth|fifth|sixth)\s*floor|level\s*-?\d+|l\d+|g\+?\d*)/i);
  if (m) {
    return m[0].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
  }
  return fallback;
}

export function sheetsToFloors(sheets: ImportedSheet[], startLevelIndex: number): Floor[] {
  return sheets.map((sheet, i) => {
    const levelIndex = startLevelIndex + i;
    const isMultiPlan = !!sheet.pageLabel?.match(/^Plan \d+ of \d+$/);
    const fallback = isMultiPlan
      ? levelName(levelIndex)
      : sheet.pageLabel
        ? `${sheet.fileName.replace(/\.[^.]+$/, "")} — ${sheet.pageLabel}`
        : levelName(levelIndex);
    const id = uid("flr");

    if (sheet.rawSource) {
      // Keep full text in-memory for the session (any size).
      registerDxf(id, sheet.rawSource);
    }

    return {
      id,
      name: isMultiPlan || sheet.pageLabel ? fallback : nameFromFile(sheet.fileName, fallback),
      levelIndex,
      sourceType: sheet.sourceType,
      fileName: sheet.fileName,
      imageDataUrl: sheet.imageDataUrl,
      naturalWidth: sheet.naturalWidth,
      naturalHeight: sheet.naturalHeight,
      scale: sheet.nativeScale ?? null,
      elements: [],
      notes: sheet.notes,
      dxfTransform: sheet.dxfTransform,
      // Persist only small DXF text so it survives reloads without blowing quota.
      rawSource:
        sheet.rawSource && sheet.rawSource.length < PERSIST_RAW_LIMIT ? sheet.rawSource : undefined,
      pdfFileId: sheet.pdfFileId,
      pdfPageIndex: sheet.pdfPageIndex,
      createdAt: Date.now() + i,
    };
  });
}
