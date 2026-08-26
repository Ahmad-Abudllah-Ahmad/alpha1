"use client";

import type {
  AnalysisResult,
  ChatScope,
  ChatSource,
  ClaimType,
  ContractDocument,
  DocType,
  DraftResult,
} from "./types";

function base(backendUrl: string): string {
  return backendUrl.replace(/\/+$/, "");
}

function fromApiDocument(d: any): ContractDocument {
  return {
    id: d.id,
    filename: d.filename,
    docType: d.docType,
    mime: d.mime,
    sizeBytes: d.sizeBytes ?? 0,
    pageCount: d.pageCount ?? 0,
    chunkCount: d.chunkCount ?? 0,
    status: d.status,
    error: d.error ?? null,
    createdAt: d.createdAt,
  };
}

export async function checkBackend(backendUrl: string): Promise<boolean> {
  if (!backendUrl.trim()) return false;
  try {
    const res = await fetch(`${base(backendUrl)}/contracts/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.available;
  } catch {
    return false;
  }
}

/** Uploads via XHR (not fetch) so we can report real byte-level progress. */
export function uploadDocument(
  backendUrl: string,
  file: File,
  docType: DocType,
  onProgress?: (pct: number) => void
): Promise<ContractDocument> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("docType", docType);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base(backendUrl)}/contracts/documents`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(fromApiDocument(JSON.parse(xhr.responseText)));
        } catch (err) {
          reject(err);
        }
      } else {
        let detail = xhr.statusText;
        try {
          detail = JSON.parse(xhr.responseText).detail || detail;
        } catch {
          /* ignore parse errors, use statusText */
        }
        reject(new Error(detail));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(form);
  });
}

export async function listDocuments(backendUrl: string, docType?: DocType): Promise<ContractDocument[]> {
  const qs = docType ? `?docType=${docType}` : "";
  const res = await fetch(`${base(backendUrl)}/contracts/documents${qs}`);
  if (!res.ok) throw new Error(`Failed to list documents (${res.status})`);
  const json = await res.json();
  return (Array.isArray(json) ? json : []).map(fromApiDocument);
}

export async function getDocument(backendUrl: string, id: string): Promise<ContractDocument> {
  const res = await fetch(`${base(backendUrl)}/contracts/documents/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch document (${res.status})`);
  return fromApiDocument(await res.json());
}

export async function deleteDocument(backendUrl: string, id: string): Promise<void> {
  const res = await fetch(`${base(backendUrl)}/contracts/documents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete document (${res.status})`);
}

export async function analyzeContract(backendUrl: string, id: string): Promise<AnalysisResult> {
  const res = await fetch(`${base(backendUrl)}/contracts/documents/${id}/analyze`, {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Analysis failed (${res.status})`);
  }
  return res.json();
}

export async function getAnalysis(backendUrl: string, id: string): Promise<AnalysisResult | null> {
  const res = await fetch(`${base(backendUrl)}/contracts/documents/${id}/analysis`);
  if (!res.ok) return null;
  const json = await res.json();
  return json ?? null;
}

export async function sendChatMessage(
  backendUrl: string,
  payload: {
    message: string;
    contractId?: string | null;
    scope: ChatScope;
    history: { role: "user" | "assistant"; content: string }[];
  }
): Promise<{ answer: string; sources: ChatSource[] }> {
  const res = await fetch(`${base(backendUrl)}/contracts/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Chat failed (${res.status})`);
  }
  return res.json();
}

export async function draftNotice(
  backendUrl: string,
  contractId: string,
  claimType: ClaimType,
  notes?: string,
  timeoutMs = 45_000
): Promise<DraftResult> {
  const res = await fetch(`${base(backendUrl)}/contracts/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contractId, claimType, notes }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Drafting failed (${res.status})`);
  }
  return res.json();
}

export function documentFileUrl(backendUrl: string, id: string): string {
  return `${base(backendUrl)}/contracts/documents/${id}/file`;
}
