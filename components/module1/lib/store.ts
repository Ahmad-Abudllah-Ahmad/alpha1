"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomBoqItem, CustomMaterial, Floor, Project, RateOverrides, TakeoffElement } from "./types";

const STORAGE_KEY = "adicc.estimation.projects.v1";
const SETTINGS_KEY = "adicc.estimation.settings.v1";

export type AiEngine = "local" | "api";

export interface AiSettings {
  /** "local" runs detection in-browser; "api" calls the Python backend. */
  engine: AiEngine;
  /** Base URL of the Python takeoff backend (used when engine === "api"). */
  backendUrl: string;
  /** Manual material-rate overrides (actual supplier rates) — win over live/baseline. */
  rateOverrides: RateOverrides;
  /** Extra materials the user registered (with their own unit rate). */
  customMaterials: CustomMaterial[];
}

export const DEFAULT_SETTINGS: AiSettings = {
  // Default to the Python backend for accuracy; runTakeoff falls back to the
  // in-browser engine automatically if the backend is unreachable.
  engine: "api",
  // In production (Vercel), set NEXT_PUBLIC_BACKEND_URL to the deployed
  // backend's public URL (e.g. Render). Falls back to localhost for local dev.
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  rateOverrides: { materials: {} },
  customMaterials: [],
};

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

export interface ProjectsStore {
  projects: Project[];
  ready: boolean;
  /** True if the last write hit the browser storage quota. */
  quotaError: boolean;
  createProject: (data: { name: string; client?: string; location?: string; floors?: Floor[] }) => string;
  deleteProject: (projectId: string) => void;
  renameProject: (projectId: string, patch: Partial<Pick<Project, "name" | "client" | "location">>) => void;
  setProjectApproval: (projectId: string, approved: boolean, approvedBy?: string) => void;
  addFloors: (projectId: string, floors: Floor[]) => void;
  deleteFloor: (projectId: string, floorId: string) => void;
  updateFloor: (projectId: string, floorId: string, patch: Partial<Floor>) => void;
  setElements: (projectId: string, floorId: string, elements: TakeoffElement[]) => void;
  addCustomItem: (projectId: string, item: Omit<CustomBoqItem, "id">) => void;
  updateCustomItem: (projectId: string, itemId: string, patch: Partial<Omit<CustomBoqItem, "id">>) => void;
  removeCustomItem: (projectId: string, itemId: string) => void;
  getProject: (projectId: string) => Project | undefined;
  getFloor: (projectId: string, floorId: string) => Floor | undefined;
  replaceAll: (projects: Project[]) => void;
  settings: AiSettings;
  updateSettings: (patch: Partial<AiSettings>) => void;
}

export function useProjectsStore(): ProjectsStore {
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const skipNextWrite = useRef(true);

  useEffect(() => {
    setProjects(loadProjects());
    setSettings(loadSettings());
    setReady(true);
  }, []);

  // Persist on change (skip the very first render / hydration load).
  useEffect(() => {
    if (!ready) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      setQuotaError(false);
    } catch {
      setQuotaError(true);
    }
  }, [projects, ready]);

  const createProject: ProjectsStore["createProject"] = useCallback((data) => {
    const id = uid("prj");
    const project: Project = {
      id,
      name: data.name || "Untitled Project",
      client: data.client ?? "",
      location: data.location ?? "",
      createdAt: Date.now(),
      floors: data.floors ?? [],
    };
    setProjects((prev) => [project, ...prev]);
    return id;
  }, []);

  const deleteProject: ProjectsStore["deleteProject"] = useCallback((projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  const renameProject: ProjectsStore["renameProject"] = useCallback((projectId, patch) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...patch } : p)));
  }, []);

  const setProjectApproval: ProjectsStore["setProjectApproval"] = useCallback((projectId, approved, approvedBy) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? approved
            ? { ...p, approvedAt: Date.now(), approvedBy: approvedBy ?? "Unknown" }
            : { ...p, approvedAt: undefined, approvedBy: undefined }
          : p
      )
    );
  }, []);

  const addFloors: ProjectsStore["addFloors"] = useCallback((projectId, floors) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, floors: [...p.floors, ...floors] } : p))
    );
  }, []);

  const deleteFloor: ProjectsStore["deleteFloor"] = useCallback((projectId, floorId) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, floors: p.floors.filter((f) => f.id !== floorId) } : p
      )
    );
  }, []);

  const updateFloor: ProjectsStore["updateFloor"] = useCallback((projectId, floorId, patch) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, floors: p.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)) }
          : p
      )
    );
  }, []);

  const setElements: ProjectsStore["setElements"] = useCallback((projectId, floorId, elements) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, floors: p.floors.map((f) => (f.id === floorId ? { ...f, elements } : f)) }
          : p
      )
    );
  }, []);

  const addCustomItem: ProjectsStore["addCustomItem"] = useCallback((projectId, item) => {
    const withId: CustomBoqItem = { ...item, id: uid("ci") };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, customItems: [...(p.customItems ?? []), withId] } : p
      )
    );
  }, []);

  const updateCustomItem: ProjectsStore["updateCustomItem"] = useCallback((projectId, itemId, patch) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, customItems: (p.customItems ?? []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
          : p
      )
    );
  }, []);

  const removeCustomItem: ProjectsStore["removeCustomItem"] = useCallback((projectId, itemId) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, customItems: (p.customItems ?? []).filter((it) => it.id !== itemId) } : p
      )
    );
  }, []);

  const getProject: ProjectsStore["getProject"] = useCallback(
    (projectId) => projects.find((p) => p.id === projectId),
    [projects]
  );

  const getFloor: ProjectsStore["getFloor"] = useCallback(
    (projectId, floorId) => projects.find((p) => p.id === projectId)?.floors.find((f) => f.id === floorId),
    [projects]
  );

  const replaceAll: ProjectsStore["replaceAll"] = useCallback((next) => {
    setProjects(next);
  }, []);

  const updateSettings: ProjectsStore["updateSettings"] = useCallback((patch) => {
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

  return {
    projects,
    ready,
    quotaError,
    settings,
    updateSettings,
    createProject,
    deleteProject,
    renameProject,
    setProjectApproval,
    addFloors,
    deleteFloor,
    updateFloor,
    setElements,
    addCustomItem,
    updateCustomItem,
    removeCustomItem,
    getProject,
    getFloor,
    replaceAll,
  };
}
