"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, FileUp, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { classifyFile, importFiles, type ImportedSheet } from "./lib/importers";

interface UploadDropzoneProps {
  onImported: (sheets: ImportedSheet[]) => void;
  backendUrl: string;
  title?: string;
  hint?: string;
  compact?: boolean;
}

export function UploadDropzone({
  onImported,
  backendUrl,
  title = "Bulk upload drawings",
  hint = "PNG, JPG, PDF, DXF, or DWG (CAD). Multi-page PDFs and multi-plan DWG/DXF files become one floor per plan.",
  compact = false,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [errors, setErrors] = useState<{ fileName: string; message: string }[]>([]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const unsupported = files.filter((f) => classifyFile(f) === "unsupported");
      setBusy(true);
      setErrors([]);
      setStatus(`Reading ${files.length} file${files.length > 1 ? "s" : ""}…`);

      try {
        const { sheets, errors: importErrors } = await importFiles(files, backendUrl);
        const allErrors = [
          ...importErrors,
          ...unsupported
            .filter((f) => !importErrors.some((e) => e.fileName === f.name))
            .map((f) => ({ fileName: f.name, message: "Unsupported file type." })),
        ];
        setErrors(allErrors);
        if (sheets.length > 0) {
          const multiPlan = sheets.filter((s) => s.pageLabel?.startsWith("Plan ")).length;
          setStatus(
            multiPlan > 1
              ? `Detected ${multiPlan} separate plans — added as individual floors.`
              : `Imported ${sheets.length} sheet${sheets.length > 1 ? "s" : ""}.`
          );
          onImported(sheets);
        } else {
          setStatus("");
        }
      } catch (err) {
        setErrors([
          { fileName: "Upload", message: err instanceof Error ? err.message : "Import failed." },
        ]);
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onImported, backendUrl]
  );

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all duration-200",
          compact ? "gap-1 px-4 py-4" : "gap-2 px-5 py-7",
          dragging ? "border-primary bg-primary/5" : "border-border/80 bg-muted/20 hover:border-primary/40",
          busy && "pointer-events-none opacity-70"
        )}
      >
        {busy ? (
          <div className="flex w-full max-w-xs flex-col gap-2 px-4">
            <Skeleton className="mx-auto h-8 w-8 rounded-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4 mx-auto" />
          </div>
        ) : (
          <UploadCloud className={cn("text-primary", compact ? "h-5 w-5" : "h-8 w-8")} />
        )}
        <p className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
          {busy ? status || "Processing…" : title}
        </p>
        {!compact && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
        {!busy && (
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg gradient-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft">
            <FileUp className="h-3.5 w-3.5" /> Choose files
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.dxf,.dwg,image/*,application/pdf"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {!busy && status && errors.length === 0 && (
        <p className="text-xs font-medium text-primary">{status}</p>
      )}

      {errors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
          {errors.map((e, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">{e.fileName}:</span> {e.message}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
