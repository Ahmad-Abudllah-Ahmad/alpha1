"use client";

import { useEffect, useRef, useState } from "react";
import { EstimationSkeleton } from "@/components/ui/skeleton";
import { ViewFade } from "@/components/ui/view-fade";
import { useProjectsStore } from "./lib/store";
import { useLiveRates } from "./lib/liveRates";
import { buildDemoFloors } from "./lib/seed";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectsView } from "./ProjectsView";
import { ProjectDetailView } from "./ProjectDetailView";
import { OpenTakeoffEmbed } from "./OpenTakeoffEmbed";

type View =
  | { kind: "projects" }
  | { kind: "project"; projectId: string }
  | { kind: "floor"; projectId: string; floorId: string };

export default function EstimationWorkspace() {
  const store = useProjectsStore();
  const [view, setView] = useState<View>({ kind: "projects" });
  const seededRef = useRef(false);
  // Live market rates + manual overrides, applied globally so every view's
  // BOQ (list, project, floor) prices consistently.
  const rates = useLiveRates(
    store.settings.backendUrl,
    store.settings.rateOverrides,
    store.settings.customMaterials
  );

  // One-time sample seed so estimation opens with a populated project.
  useEffect(() => {
    if (!store.ready || seededRef.current) return;
    if (store.projects.length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    let cancelled = false;
    void (async () => {
      const floors = await buildDemoFloors();
      if (cancelled || floors.length === 0) return;
      store.createProject({
        name: "Al Barsha Villa G+2",
        client: "ADICC",
        location: "Dubai, UAE",
        floors,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready, store.projects.length]);

  // Skip the Estimation Projects list when any project exists — open that
  // project workspace directly (floors + OpenTakeoff pane).
  useEffect(() => {
    if (!store.ready || view.kind !== "projects" || store.projects.length === 0) return;
    const latest = [...store.projects].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    setView({ kind: "project", projectId: latest.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready, store.projects, view.kind]);

  // If the selected project/floor disappears, fall back gracefully.
  useEffect(() => {
    if (view.kind === "project" && store.ready && !store.getProject(view.projectId)) {
      setView(
        store.projects.length > 0
          ? { kind: "project", projectId: store.projects[0].id }
          : { kind: "projects" }
      );
    }
    if (view.kind === "floor" && store.ready) {
      const floorExists = !!store.getFloor(view.projectId, view.floorId);
      if (!floorExists) {
        setView(
          store.getProject(view.projectId)
            ? { kind: "project", projectId: view.projectId }
            : store.projects.length > 0
              ? { kind: "project", projectId: store.projects[0].id }
              : { kind: "projects" }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, store.projects]);

  if (!store.ready) {
    return <EstimationSkeleton />;
  }

  if (view.kind === "floor") {
    const project = store.getProject(view.projectId);
    const floor = store.getFloor(view.projectId, view.floorId);
    return (
      <ViewFade viewKey={`floor-${view.projectId}-${view.floorId}`} variant="tab">
        <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-2">
          <div className="flex items-center gap-2 surface-card px-3 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              onClick={() => setView({ kind: "project", projectId: view.projectId })}
            >
              <ArrowLeft className="h-4 w-4" /> {project?.name || "Project"}
            </Button>
            <span className="text-muted-foreground/60">/</span>
            <h2 className="font-bold tracking-tight text-foreground">{floor?.name || "Floor"}</h2>
          </div>
          <OpenTakeoffEmbed className="relative min-h-[560px] flex-1 overflow-hidden rounded-xl border bg-neutral-950" />
        </div>
      </ViewFade>
    );
  }

  if (view.kind === "project") {
    return (
      <ViewFade viewKey={`project-${view.projectId}`} variant="tab">
        <ProjectDetailView
          store={store}
          projectId={view.projectId}
          rates={rates}
          onBack={() => {
            // Same destination as the former takeoff "Home" control.
            window.dispatchEvent(new CustomEvent("adicc:opentakeoff-home"));
          }}
          onOpenFloor={(floorId) => setView({ kind: "floor", projectId: view.projectId, floorId })}
        />
      </ViewFade>
    );
  }

  // Only when there are zero projects (create / upload entry point).
  return (
    <ViewFade viewKey="projects" variant="tab">
      <ProjectsView store={store} rates={rates} onOpenProject={(projectId) => setView({ kind: "project", projectId })} />
    </ViewFade>
  );
}
