"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useContractsSettings } from "@/components/module3/lib/store";
import { useRole } from "@/components/RoleProvider";
import { KnowledgeBasePanel } from "@/components/KnowledgeBasePanel";
import * as api from "@/components/module3/lib/api";

interface KnowledgeBaseContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  backendUrl: string;
  online: boolean | null;
  setOnline: (online: boolean | null) => void;
  docCount: number;
  setDocCount: (count: number) => void;
  readOnly: boolean;
}

const KnowledgeBaseContext = createContext<KnowledgeBaseContextValue | null>(null);

export function KnowledgeBaseProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useContractsSettings();
  const { can } = useRole();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [docCount, setDocCount] = useState(0);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Keep backend status in sync even when the panel is closed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isOnline = await api.checkBackend(settings.backendUrl);
      if (cancelled) return;
      setOnline(isOnline);
      if (isOnline) {
        try {
          const docs = await api.listDocuments(settings.backendUrl, "knowledge_base");
          if (!cancelled) setDocCount(docs.length);
        } catch {
          if (!cancelled) setDocCount(0);
        }
      } else {
        setDocCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.backendUrl]);

  return (
    <KnowledgeBaseContext.Provider
      value={{
        open,
        setOpen,
        toggle,
        backendUrl: settings.backendUrl,
        online,
        setOnline,
        docCount,
        setDocCount,
        readOnly: !can("manage_kb"),
      }}
    >
      {children}
      <KnowledgeBasePanel />
    </KnowledgeBaseContext.Provider>
  );
}

export function useKnowledgeBase() {
  const ctx = useContext(KnowledgeBaseContext);
  if (!ctx) throw new Error("useKnowledgeBase must be used within KnowledgeBaseProvider");
  return ctx;
}
