"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContractRepositorySkeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import * as api from "./lib/api";
import type { ContractDocument, DocStatus } from "./lib/types";

const STATUS_BADGE: Record<DocStatus, "success" | "warning" | "destructive"> = {
  ready: "success",
  processing: "warning",
  error: "destructive",
};

interface ContractRepositoryProps {
  backendUrl: string;
  backendOnline: boolean | null;
  onOpen: (doc: ContractDocument) => void;
}

export function ContractRepository({ backendUrl, backendOnline, onOpen }: ContractRepositoryProps) {
  const [docs, setDocs] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (backendOnline === false) {
      setLoading(false);
      setError("Analysis service is offline — open Knowledge Base when the backend is back.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.listDocuments(backendUrl, "contract");
      setDocs(list.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load contracts.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, backendOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ContractRepositorySkeleton />;
  }

  if (error) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 surface-card p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-semibold text-foreground">Repository unavailable</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 surface-card border-dashed p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-semibold text-foreground">No contracts uploaded yet</p>
          <p className="text-xs text-muted-foreground">
            Switch to Analyzer and upload a contract — it will appear here for quick re-open.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Contract Repository</p>
          <p className="text-xs text-muted-foreground">
            {docs.length} contract{docs.length === 1 ? "" : "s"} on server
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} className="h-8 gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-center">Pages</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[88px] text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <TableRow
              key={doc.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => onOpen(doc)}
            >
              <TableCell className="max-w-[240px] truncate font-medium">{doc.filename}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(doc.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-center tabular-nums">{doc.pageCount || "—"}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[doc.status]} className="text-[10px] uppercase">
                  {doc.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(doc);
                  }}
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
