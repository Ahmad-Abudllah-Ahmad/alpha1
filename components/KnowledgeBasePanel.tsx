"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKnowledgeBase } from "@/components/KnowledgeBaseProvider";
import { cn } from "@/lib/utils";
import { KnowledgeBaseSkeleton } from "@/components/ui/skeleton";
import {
  BookOpenCheck,
  Database,
  FileText,
  Plug,
  PlugZap,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as api from "@/components/module3/lib/api";
import type { ContractDocument } from "@/components/module3/lib/types";

interface UploadTask {
  key: string;
  filename: string;
  progress: number;
  phase: "uploading" | "processing" | "done" | "error";
  error?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeBasePanel() {
  const { open, setOpen, backendUrl, setOnline, setDocCount, readOnly } = useKnowledgeBase();

  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [online, setOnlineLocal] = useState<boolean | null>(null);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    const isOnline = await api.checkBackend(backendUrl);
    setOnlineLocal(isOnline);
    setOnline(isOnline);
    if (isOnline) {
      try {
        const docs = await api.listDocuments(backendUrl, "knowledge_base");
        setDocuments(docs);
        setDocCount(docs.length);
      } catch {
        setDocuments([]);
        setDocCount(0);
      }
    } else {
      setDocuments([]);
      setDocCount(0);
    }
    setLoading(false);
  }, [backendUrl, setOnline, setDocCount]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refresh();
  }, [open, refresh]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      list.forEach((file) => {
        const key = `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        setUploads((prev) => [...prev, { key, filename: file.name, progress: 0, phase: "uploading" }]);
        api
          .uploadDocument(backendUrl, file, "knowledge_base", (pct) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.key === key ? { ...u, progress: pct, phase: pct >= 100 ? "processing" : "uploading" } : u
              )
            );
          })
          .then((doc) => {
            setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, phase: "done", progress: 100 } : u)));
            setDocuments((prev) => {
              const next = [doc, ...prev];
              setDocCount(next.length);
              return next;
            });
            setOnlineLocal(true);
            setOnline(true);
            setTimeout(() => setUploads((prev) => prev.filter((u) => u.key !== key)), 2500);
          })
          .catch((err: Error) => {
            setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, phase: "error", error: err.message } : u)));
          });
      });
    },
    [backendUrl, setDocCount, setOnline]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const prev = documents;
      const next = documents.filter((doc) => doc.id !== id);
      setDocuments(next);
      setDocCount(next.length);
      try {
        await api.deleteDocument(backendUrl, id);
      } catch {
        setDocuments(prev);
        setDocCount(prev.length);
      }
    },
    [backendUrl, documents, setDocCount]
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-svh w-[min(100vw,34rem)] flex-col border-l border-border/70 bg-background shadow-[0_24px_80px_-24px_rgb(0_90_112_/_0.35)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
        aria-hidden={!open}
        aria-label="Knowledge base drawer"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 bg-card/95 py-4 pl-5 pr-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">Knowledge Base</h2>
                {online === true && (
                  <Badge variant="success" className="h-5 gap-1 rounded-full px-2 text-[10px]">
                    <PlugZap className="h-2.5 w-2.5" /> Connected
                  </Badge>
                )}
                {online === false && (
                  <Badge variant="destructive" className="h-5 gap-1 rounded-full px-2 text-[10px]">
                    <Plug className="h-2.5 w-2.5" /> Offline
                  </Badge>
                )}
              </div>
              <p className="max-w-[28rem] text-sm leading-5 text-muted-foreground">
                {documents.length > 0
                  ? `${documents.length} reference document${documents.length === 1 ? "" : "s"} supporting contract analysis`
                  : "Upload FIDIC references, UAE law extracts, or precedents"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
            aria-label="Close knowledge base panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-4 py-4 pl-5 pr-7">
            {loading && <KnowledgeBaseSkeleton />}

            {!loading && online === false && (
              <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm leading-5 text-destructive">
                Document service is temporarily unavailable. Contract analysis and uploads are disabled until the service reconnects.
              </p>
            )}

            {!loading && online !== false && (
              <>
                <div
                  onDragOver={
                    readOnly
                      ? undefined
                      : (e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }
                  }
                  onDragLeave={readOnly ? undefined : () => setDragOver(false)}
                  onDrop={
                    readOnly
                      ? undefined
                      : (e) => {
                          e.preventDefault();
                          setDragOver(false);
                          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
                        }
                  }
                  onClick={readOnly ? undefined : () => fileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-xl border border-dashed px-5 py-5 text-center shadow-xs transition-colors",
                    readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.025]"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Upload reference documents</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      FIDIC clauses, UAE law extracts, prior claims — PDF, DOCX, or TXT
                    </p>
                  </div>
                </div>

                {uploads.length > 0 && (
                  <div className="space-y-2">
                    {uploads.map((u) => (
                      <div key={u.key} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{u.filename}</p>
                          {u.phase === "error" ? (
                            <p className="text-[11px] text-destructive">{u.error}</p>
                          ) : (
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-200",
                                  u.phase === "processing" ? "bg-primary/60 animate-pulse w-full" : "bg-primary"
                                )}
                                style={u.phase === "uploading" ? { width: `${u.progress}%` } : undefined}
                              />
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {u.phase === "uploading" && `${u.progress}%`}
                          {u.phase === "processing" && "Parsing…"}
                          {u.phase === "done" && "Ready"}
                          {u.phase === "error" && "Failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {documents.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Indexed documents
                      </p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {documents.length} ready source{documents.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="group rounded-xl border border-border/80 bg-card p-3 shadow-xs transition-colors hover:border-primary/30"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <BookOpenCheck className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words text-sm font-medium leading-5 text-foreground">{doc.filename}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                              <span>
                                {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
                              </span>
                              <span aria-hidden>·</span>
                              <span>{doc.chunkCount} chunks</span>
                              <span aria-hidden>·</span>
                              <span>{formatBytes(doc.sizeBytes)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => !readOnly && handleDelete(doc.id)}
                            disabled={readOnly}
                            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            aria-label={`Delete ${doc.filename}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Contract intelligence source
                          </span>
                          {doc.status === "ready" && (
                            <Badge variant="success" className="shrink-0 rounded-full px-2 text-[10px]">
                              Ready
                            </Badge>
                          )}
                          {doc.status === "error" && (
                            <Badge variant="warning" className="shrink-0 rounded-full px-2 text-[10px]" title={doc.error ?? ""}>
                              {doc.error ? "Limited" : "Error"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border/80 bg-card px-4 py-6 text-center shadow-xs">
                    <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium text-foreground">No reference documents yet</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Analysis will rely on the uploaded contract until a knowledge base source is added.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
