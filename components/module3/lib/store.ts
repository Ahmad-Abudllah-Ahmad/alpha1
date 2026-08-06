"use client";

import { useCallback, useEffect, useState } from "react";

const SETTINGS_KEY = "adicc.contracts.settings.v1";

export interface ContractsSettings {
  /** Base URL of the Python backend that hosts the /contracts API. */
  backendUrl: string;
  /** Whether the Knowledge Base panel starts expanded. */
  kbExpanded: boolean;
  /** The last contract analyzed, so a page refresh doesn't lose it. */
  lastContractId: string | null;
}

export const DEFAULT_CONTRACTS_SETTINGS: ContractsSettings = {
  // In production (Vercel), set NEXT_PUBLIC_BACKEND_URL to the deployed
  // backend's public URL (e.g. Render). Falls back to localhost for local dev.
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  kbExpanded: true,
  lastContractId: null,
};

function loadSettings(): ContractsSettings {
  if (typeof window === "undefined") return DEFAULT_CONTRACTS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CONTRACTS_SETTINGS;
    return { ...DEFAULT_CONTRACTS_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONTRACTS_SETTINGS;
  }
}

export function useContractsSettings() {
  const [settings, setSettings] = useState<ContractsSettings>(DEFAULT_CONTRACTS_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  const updateSettings = useCallback((patch: Partial<ContractsSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore persistence errors for settings */
      }
      return next;
    });
  }, []);

  return { settings, updateSettings, ready };
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
