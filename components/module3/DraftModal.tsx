"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, Copy, Download, FileText, Loader2 } from "lucide-react";
import * as api from "./lib/api";
import { downloadDocument } from "./lib/export";
import { buildLocalDraft } from "./lib/localDraft";
import type { AnalysisResult, ChatSource, ClaimType } from "./lib/types";

interface DraftModalProps {
  open: boolean;
  onClose: () => void;
  backendUrl: string;
  contractId: string;
  contractFilename: string;
  analysis: AnalysisResult | null;
}

const CLAIM_TYPES: { value: ClaimType; label: string; description: string }[] = [
  { value: "contract", label: "New Contract", description: "Full contract or subcontract draft aligned with UAE law & ADICC policy." },
  { value: "eot", label: "Extension of Time", description: "Formal EOT claim notice under the notice-of-claim clause." },
  { value: "notice", label: "Notice of Claim", description: "General contractual notice preserving an entitlement." },
  { value: "mitigation", label: "Mitigation Notice", description: "Cost-impact statement outlining mitigation taken." },
];

const CLAIM_FILENAME: Record<ClaimType, string> = {
  contract: "contract-draft",
  eot: "eot-notice",
  notice: "claim-notice",
  mitigation: "mitigation-notice",
};

export function DraftModal({ open, onClose, backendUrl, contractId, contractFilename, analysis }: DraftModalProps) {
  const [claimType, setClaimType] = useState<ClaimType>("contract");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "word" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [copied, setCopied] = useState(false);
  const [usedLocalFallback, setUsedLocalFallback] = useState(false);

  const baseName = `${CLAIM_FILENAME[claimType]}-${contractFilename.replace(/\.[^.]+$/, "")}`;
  const draftTitle = CLAIM_TYPES.find((t) => t.value === claimType)?.label ?? "Contract Draft";

  const generate = async () => {
    setLoading(true);
    setError(null);
    setUsedLocalFallback(false);
    try {
      const res = await api.draftNotice(backendUrl, contractId, claimType, notes || undefined);
      if (res.draft.includes("OPENAI_API_KEY")) {
        throw new Error("AI unavailable");
      }
      setDraft(res.draft);
      setSources(res.sources);
    } catch {
      if (analysis) {
        setDraft(buildLocalDraft(contractFilename, claimType, analysis, notes || undefined));
        setSources([]);
        setUsedLocalFallback(true);
      } else {
        setError("Drafting failed — upload and analyze a contract first, then try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setDraft(null);
    setError(null);
    setNotes("");
    setUsedLocalFallback(false);
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = async (format: "pdf" | "word" | "txt") => {
    if (!draft) return;
    if (format === "pdf" || format === "word") setDownloading(format);
    try {
      await downloadDocument(format, baseName, draftTitle, draft);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Draft contract or notice"
      description={`Grounded in "${contractFilename}" and the UAE laws & ADICC policy knowledge base.`}
      className="max-w-2xl"
    >
      {!draft ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CLAIM_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setClaimType(t.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  claimType === t.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"
                )}
              >
                <p className="text-xs font-semibold text-foreground">{t.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-normal">{t.description}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Requirements &amp; notes (optional) — scope, dates, amounts, parties
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Subcontract for MEP works, lump-sum AED 4.2M, completion 30 June 2027, DIAC arbitration…"
              className="text-sm"
              rows={3}
            />
          </div>

          {error && <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
                </>
              ) : (
                "Generate draft"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {usedLocalFallback && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Draft prepared from your risk analysis — review and edit placeholders before exporting.
            </p>
          )}
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="h-80 font-mono text-xs leading-relaxed" />

          {!!sources.length && (
            <div className="flex flex-wrap gap-1.5">
              {sources.slice(0, 6).map((s, i) => (
                <div
                  key={i}
                  title={s.snippet}
                  className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground"
                >
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[140px] truncate">
                    {s.filename}
                    {s.page ? ` · p.${s.page}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              Start over
            </Button>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" onClick={() => handleDownload("txt")}>
              <Download className="h-3.5 w-3.5" />
              TXT
            </Button>
            <Button variant="outline" onClick={() => handleDownload("word")} disabled={downloading === "word"}>
              {downloading === "word" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Word
            </Button>
            <Button onClick={() => handleDownload("pdf")} disabled={downloading === "pdf"}>
              {downloading === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              PDF
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
