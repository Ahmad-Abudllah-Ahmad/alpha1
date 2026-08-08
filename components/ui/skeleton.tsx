import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ModuleId } from "@/lib/modules";
import AdiccLoadingLogo from "@/components/AdiccLoadingLogo";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/80", className)}
      aria-hidden
    />
  );
}

function SkelCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("surface-card overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkelCard key={i}>
          <div className="space-y-3 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </SkelCard>
      ))}
    </div>
  );
}

export function SkeletonChart({ className, height = "h-52" }: { className?: string; height?: string }) {
  return (
    <SkelCard className={className}>
      <div className="space-y-3 p-4 sm:p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56 max-w-full" />
        <Skeleton className={cn("w-full rounded-xl", height)} />
      </div>
    </SkelCard>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <SkelCard>
      <div className="border-b px-4 py-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-1.5 h-3 w-24" />
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "max-w-[180px]")} />
            ))}
          </div>
        ))}
      </div>
    </SkelCard>
  );
}

export function SkeletonList({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-xl border bg-background p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 max-w-[200px]" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5 max-w-[280px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonBanner() {
  return (
    <SkelCard>
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 lg:px-5">
        <div className="min-w-0 space-y-2 sm:max-w-[300px]">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-3 h-6 w-14" />
            </div>
          ))}
        </div>
      </div>
    </SkelCard>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="flex w-full min-h-[calc(100svh-7.5rem)] flex-col items-center justify-center"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <AdiccLoadingLogo />
    </div>
  );
}

export function EstimationSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading estimation">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkelCard key={i}>
            <Skeleton className="aspect-[16/10] w-full rounded-none rounded-t-xl" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </SkelCard>
        ))}
      </div>
    </div>
  );
}

export function ScheduleSkeleton() {
  return (
    <div
      className="flex w-full min-h-[calc(100svh-7.5rem)] flex-col items-center justify-center"
      aria-busy="true"
      aria-label="Loading schedule"
    >
      <AdiccLoadingLogo />
    </div>
  );
}

export function ContractsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading contracts">
      <Skeleton className="h-11 w-64 rounded-xl" />
      <div className="grid min-h-[480px] grid-cols-1 gap-0 overflow-hidden rounded-xl border lg:grid-cols-2">
        <div className="space-y-4 border-b p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-9/12" />
        </div>
        <div className="space-y-4 bg-primary/[0.02] p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DocBotSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading document assistant">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkelCard key={i}>
            <div className="flex items-center gap-3 p-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </SkelCard>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <SkelCard>
            <div className="space-y-4 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
              <SkeletonList items={4} />
            </div>
          </SkelCard>
        </div>
        <div className="xl:col-span-5 space-y-4">
          <SkeletonChart height="h-48" />
          <SkelCard>
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              ))}
            </div>
          </SkelCard>
        </div>
      </div>
    </div>
  );
}

export function ContractRepositorySkeleton() {
  return <SkeletonTable rows={6} cols={5} />;
}

export function KnowledgeBaseSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading knowledge base">
      <Skeleton className="h-28 w-full rounded-xl border border-dashed" />
      <SkeletonList items={4} />
    </div>
  );
}

export function ContractAnalysisSkeleton() {
  return (
    <div className="space-y-4 px-6 py-4" aria-busy="true" aria-label="Analyzing contract">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-10/12" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-9/12" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading workspace">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <Skeleton className="min-h-[420px] w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

const MODULE_SKELETONS: Record<ModuleId, ComponentType> = {
  dashboard: DashboardSkeleton,
  estimation: EstimationSkeleton,
  schedule: ScheduleSkeleton,
  contracts: ContractsSkeleton,
  docbot: DocBotSkeleton,
};

export function ModuleSkeleton({ moduleId }: { moduleId: ModuleId }) {
  const Component = MODULE_SKELETONS[moduleId];
  return <Component />;
}

/** @deprecated Use ModuleSkeleton({ moduleId }) — kept for backwards compat */
export function ModuleLoadingSkeleton() {
  return <DashboardSkeleton />;
}

export function getModuleLoadingComponent(moduleId: ModuleId) {
  return function ModuleLoading() {
    return <ModuleSkeleton moduleId={moduleId} />;
  };
}
