/**
 * In-memory store of raw PDF bytes (base64) keyed by a per-file id. Like the DXF
 * registry, PDFs aren't persisted to localStorage (quota); they're kept for the
 * session so the backend "Online" engine can do exact vector extraction. One
 * entry per source file (shared across that file's pages).
 */
const registry = new Map<string, string>();

export function registerPdf(fileId: string, base64: string): void {
  registry.set(fileId, base64);
}

export function getPdf(fileId: string | undefined): string | undefined {
  return fileId ? registry.get(fileId) : undefined;
}
