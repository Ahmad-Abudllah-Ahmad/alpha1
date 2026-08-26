"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  FileImage,
  FileText,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Ruler,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatAED, cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { UploadDropzone } from "./UploadDropzone";
import { OpenTakeoffEmbed } from "./OpenTakeoffEmbed";
import { sheetsToFloors } from "./lib/floorFactory";
import { computeFloorBoq, computeProjectBoq } from "./lib/boq";
import type { UseLiveRates } from "./lib/liveRates";
import { RateSettings } from "./RateSettings";
import type { ProjectsStore } from "./lib/store";
import type { Floor, SourceType } from "./lib/types";
import { useRole } from "@/components/RoleProvider";

const SOURCE_ICON: Record<SourceType, typeof FileImage> = {
  image: FileImage,
  pdf: FileText,
  dxf: Ruler,
};

interface ProjectDetailViewProps {
  store: ProjectsStore;
  projectId: string;
  rates: UseLiveRates;
  onBack: () => void;
  onOpenFloor: (floorId: string) => void;
}

export function ProjectDetailView({ store, projectId, rates, onBack, onOpenFloor }: ProjectDetailViewProps) {
  const { can, roleLabel } = useRole();
  const project = store.getProject(projectId);
  const [renaming, setRenaming] = useState<Floor | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteFloor, setConfirmDeleteFloor] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showRates, setShowRates] = useState(false);

  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to projects
        </Button>
        <p className="text-sm text-muted-foreground">This project no longer exists.</p>
      </div>
    );
  }

  const boq = computeProjectBoq(project);
  const floors = [...project.floors].sort((a, b) => a.levelIndex - b.levelIndex);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {floors.length === 0 ? (
        <div className="space-y-3 p-4">
          {project.approvedAt && (
            <div className="surface-card px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="success" className="gap-1 text-[9px]">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Approved {new Date(project.approvedAt).toLocaleDateString()}
                  {project.approvedBy ? ` · ${project.approvedBy}` : ""}
                </Badge>
              </div>
            </div>
          )}
          {boq.uncalibratedFloors > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-500">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{boq.uncalibratedFloors} floor{boq.uncalibratedFloors === 1 ? "" : "s"}</strong> with
                takeoff data {boq.uncalibratedFloors === 1 ? "is" : "are"} not scaled yet. Open the floor and set the
                drawing scale — measured areas and lengths are excluded from the estimate until then.
              </span>
            </div>
          )}
          <Card>
            <CardContent>
              <UploadDropzone
                backendUrl={store.settings.backendUrl}
                title="Upload this project's floor plans"
                onImported={(sheets) => store.addFloors(projectId, sheetsToFloors(sheets, 0))}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <OpenTakeoffEmbed className="relative min-h-0 w-full flex-1 overflow-hidden bg-[#dbe3e6] dark:bg-[#1a2332]" />
      )}

      {/* Rate card & custom items editor */}
      <RateSettings
        open={showRates}
        onClose={() => setShowRates(false)}
        store={store}
        projectId={projectId}
        card={rates.card}
      />

      {/* Add floors modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add floors to this project"
        description="Bulk-upload more drawings. Multi-page PDFs and multi-plan DWG/DXF files are split into one floor per plan."
      >
        <UploadDropzone
          backendUrl={store.settings.backendUrl}
          onImported={(sheets) => {
            store.addFloors(projectId, sheetsToFloors(sheets, project.floors.length));
            setShowAdd(false);
          }}
        />
      </Modal>

      {/* Rename floor modal */}
      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename floor"
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming) {
                store.updateFloor(projectId, renaming.id, { name: renameValue.trim() || renaming.name });
                setRenaming(null);
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renaming) {
                  store.updateFloor(projectId, renaming.id, {
                    name: renameValue.trim() || renaming.name,
                  });
                }
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete floor confirm */}
      <Modal
        open={!!confirmDeleteFloor}
        onClose={() => setConfirmDeleteFloor(null)}
        title="Delete floor?"
        description="This removes the drawing and its takeoff data from the project."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDeleteFloor(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirmDeleteFloor) store.deleteFloor(projectId, confirmDeleteFloor);
              setConfirmDeleteFloor(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function HeaderMetric({
  icon,
  label,
  value,
  onClick,
  trailing,
  className,
  title,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      title={title}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-2 text-left",
        onClick && "transition-colors hover:border-primary/30 hover:bg-muted/40 disabled:opacity-70",
        className
      )}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background/90 text-primary shadow-xs">
        {icon}
      </div>
      <div className="min-w-0 leading-none">
        <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 flex max-w-[11rem] items-center gap-1 truncate text-[11px] font-semibold text-foreground sm:max-w-[13rem]">
          {value}
        </p>
      </div>
      {trailing}
    </Wrapper>
  );
}

function RatesStatus({ rates }: { rates: UseLiveRates }) {
  const { card, status, refresh } = rates;
  const loading = status === "loading";

  const updated = card?.fetchedAt ? new Date(card.fetchedAt * 1000) : null;
  const updatedLabel = updated
    ? updated.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) +
      " " +
      updated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";
  const isLive = card?.live;

  const fmtDelta = (ok: boolean, pct: number) => (ok ? `${pct > 0 ? "+" : ""}${pct}%` : "n/a");
  const title = card
    ? `${isLive ? "Live market-anchored" : "Baseline"} rates in ${card.currency}.\n` +
      `Updated ${updatedLabel}. Source: ${card.source}. Click to refresh.` +
      (card.materials?.length
        ? "\n\nMaterials (web search, AED):\n" +
          card.materials
            .map((m) => `${m.label}: ${m.ok && m.price != null ? `${m.price} ${m.unit}` : "n/a"} (${fmtDelta(m.ok, m.changePct)})`)
            .join("\n")
        : "") +
      (card.commodities?.length
        ? "\n\nCommodities (yfinance):\n" +
          card.commodities.map((c) => `${c.label}: ${fmtDelta(c.ok, c.changePct)}`).join("\n")
        : "") +
      (card.warnings?.length ? `\n\n${card.warnings.join("\n")}` : "")
    : "Live material rates: connecting to backend…";

  return (
    <HeaderMetric
      icon={
        loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <TrendingUp className={cn("h-3.5 w-3.5", isLive ? "text-emerald-600" : "text-muted-foreground")} />
        )
      }
      label={isLive ? "Live rates" : "Rates"}
      value={updatedLabel}
      onClick={() => refresh()}
      trailing={<RefreshCw className="h-3 w-3 shrink-0 text-muted-foreground" />}
      className="hidden sm:flex"
      title={title}
      disabled={loading}
    />
  );
}
