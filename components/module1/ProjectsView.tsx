"use client";

import { useState } from "react";
import {
  Building2,
  CalendarDays,
  Database,
  FileImage,
  Layers,
  MapPin,
  Plus,
  Ruler,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatAED } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { UploadDropzone } from "./UploadDropzone";
import { RateAdminModal } from "./RateAdminModal";
import { sheetsToFloors } from "./lib/floorFactory";
import { computeProjectBoq } from "./lib/boq";
import type { ImportedSheet } from "./lib/importers";
import type { UseLiveRates } from "./lib/liveRates";
import type { ProjectsStore } from "./lib/store";
import { useRole } from "@/components/RoleProvider";

interface ProjectsViewProps {
  store: ProjectsStore;
  rates: UseLiveRates;
  onOpenProject: (projectId: string) => void;
}

export function ProjectsView({ store, rates, onOpenProject }: ProjectsViewProps) {
  const { can } = useRole();
  const [showNew, setShowNew] = useState(false);
  const [showRateAdmin, setShowRateAdmin] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [staged, setStaged] = useState<ImportedSheet[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setClient("");
    setLocation("");
    setStaged([]);
  };

  const handleCreate = () => {
    const floors = sheetsToFloors(staged, 0);
    const id = store.createProject({
      name: name.trim() || "Untitled Project",
      client: client.trim(),
      location: location.trim(),
      floors,
    });
    setShowNew(false);
    resetForm();
    onOpenProject(id);
  };

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">Estimation Projects</h2>
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
              <span className="tnum">{store.projects.length}</span> project{store.projects.length === 1 ? "" : "s"} · upload drawings, take off quantities, export BOQ
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {can("edit_rates") && (
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowRateAdmin(true)}>
              <Database className="h-4 w-4" /> Rate Admin
            </Button>
          )}
          {can("create_project") && (
            <Button className="flex-1 sm:flex-none" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          )}
        </div>
      </div>

      {store.quotaError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-500">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Browser storage is full. Delete an old project or remove large drawings to keep saving your work.
          </span>
        </div>
      )}

      {store.projects.length === 0 ? (
        <Card>
          <CardContent>
            <UploadDropzone
              backendUrl={store.settings.backendUrl}
              title="Start by uploading your drawings"
              hint="Drop PNG, JPG, PDF, DXF, or DWG files. We'll create your first project and split multi-page PDFs into floors."
              onImported={(sheets) => {
                const id = store.createProject({
                  name: "New Project",
                  floors: sheetsToFloors(sheets, 0),
                });
                onOpenProject(id);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {store.projects.map((project) => {
            const boq = computeProjectBoq(project);
            return (
              <Card
                key={project.id}
                role="button"
                tabIndex={0}
                aria-label={`Open project ${project.name}`}
                className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => onOpenProject(project.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenProject(project.id);
                  }
                }}
              >
                <CardContent className="p-0">
                  {project.floors.length === 0 ? (
                    <div className="flex aspect-[16/9] items-center justify-center gap-2 bg-muted/60 text-xs text-muted-foreground">
                      <FileImage className="h-4 w-4" /> No drawings yet
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-px bg-border">
                      {Array.from({ length: 3 }).map((_, i) => {
                        const f = project.floors[i];
                        const extra = project.floors.length - 3;
                        if (!f) {
                          return (
                            <div
                              key={`ph-${i}`}
                              className="flex aspect-[16/10] items-center justify-center bg-muted"
                            >
                              <FileImage className="h-5 w-5 text-muted-foreground/40" />
                            </div>
                          );
                        }
                        return (
                          <div key={f.id} className="relative overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.imageDataUrl}
                              alt={f.name}
                              className="aspect-[16/10] h-full w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                            {i === 2 && extra > 0 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white backdrop-blur-[1px]">
                                +{extra}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-card-foreground">
                          <Building2 className="h-4 w-4 shrink-0 text-primary" />
                          {project.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {project.location || "Location not set"}
                          {project.client ? ` · ${project.client}` : ""}
                        </p>
                      </div>
                      {can("delete_project") && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(project.id);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          aria-label="Delete project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Layers className="h-3 w-3" /> {project.floors.length} floor
                        {project.floors.length === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Ruler className="h-3 w-3" /> {boq.totalElements} items
                      </Badge>
                      {project.approvedAt && (
                        <Badge variant="success" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> Approved
                        </Badge>
                      )}
                      {boq.uncalibratedFloors > 0 && (
                        <Badge variant="warning" className="gap-1">
                          <TriangleAlert className="h-3 w-3" /> {boq.uncalibratedFloors} need scale
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-end justify-between border-t pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Estimated value
                        </p>
                        <p className="tnum text-lg font-bold text-card-foreground">
                          {formatAED(Math.round(boq.total))}
                        </p>
                      </div>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(project.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New project modal */}
      <Modal
        open={showNew}
        onClose={() => {
          setShowNew(false);
          resetForm();
        }}
        title="New estimation project"
        description="Name the project and bulk-upload its floor plans. You can add more drawings later."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-foreground">Project name *</span>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Al Barsha Villa G+1"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-foreground">Client</span>
              <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. ADICC" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-foreground">Location</span>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Dubai, UAE"
              />
            </label>
          </div>

          <UploadDropzone
            compact
            backendUrl={store.settings.backendUrl}
            title="Add floor plans (optional now)"
            onImported={(sheets) => setStaged((prev) => [...prev, ...sheets])}
          />

          {staged.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-2">
              <p className="mb-1.5 text-xs font-medium text-foreground">
                {staged.length} sheet{staged.length === 1 ? "" : "s"} ready
              </p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {staged.map((s, i) => (
                  <div key={i} className="relative overflow-hidden rounded border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.imageDataUrl} alt="" className="aspect-square w-full object-cover" />
                    {s.nativeScale && (
                      <span className="absolute bottom-0 left-0 right-0 bg-primary/90 py-0.5 text-center text-[8px] font-medium text-primary-foreground">
                        CAD scale
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => {
                setShowNew(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Create project
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete project?"
        description="This permanently removes the project, its floors, and all takeoff data."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirmDelete) store.deleteProject(confirmDelete);
              setConfirmDelete(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>

      <RateAdminModal
        open={showRateAdmin}
        onClose={() => setShowRateAdmin(false)}
        store={store}
        card={rates.card}
      />
    </div>
  );
}
