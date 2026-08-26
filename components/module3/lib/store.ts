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
  // The contracts backend is optional. An empty URL keeps the UI offline
  // without repeatedly probing an assumed localhost service.
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "",
  kbExpanded: true,
  lastContractId: null,
};

function loadSettings(): ContractsSettings {
  if (typeof window === "undefined") return DEFAULT_CONTRACTS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CONTRACTS_SETTINGS;
    const stored = { ...DEFAULT_CONTRACTS_SETTINGS, ...JSON.parse(raw) } as ContractsSettings;
    const legacyLocalBackend = /^http:\/\/(?:localhost|127\.0\.0\.1):8000\/?$/i.test(stored.backendUrl);
    return !process.env.NEXT_PUBLIC_BACKEND_URL && legacyLocalBackend
      ? { ...stored, backendUrl: "" }
      : stored;
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
