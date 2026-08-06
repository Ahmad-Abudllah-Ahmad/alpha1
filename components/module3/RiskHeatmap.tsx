'use client';

import { cn } from '@/lib/utils';
import type { RiskItem, RiskSeverity } from './lib/types';

type Tier = RiskSeverity;

const TIERS: Tier[] = ['low', 'medium', 'high'];
const TIER_LABEL: Record<Tier, string> = { low: 'Low', medium: 'Med', high: 'High' };

/**
 * Deterministic likelihood heuristic: defaults to the same tier as severity
 * so placement is stable and explainable (no fabricated probability scores).
 */
export function riskLikelihood(risk: RiskItem): Tier {
  return risk.severity;
}

function exposureScore(likelihood: Tier, severity: Tier): number {
  const w = { low: 0, medium: 1, high: 2 };
  return w[likelihood] + w[severity];
}

function cellTone(score: number): string {
  if (score >= 4) return 'bg-red-500/25 border-red-500/40 text-red-700 dark:text-red-300';
  if (score === 3) return 'bg-red-500/15 border-red-500/25 text-red-600 dark:text-red-400';
  if (score === 2) return 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400';
  if (score === 1) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400';
  return 'bg-muted/30 border-border/60 text-muted-foreground';
}

interface RiskHeatmapProps {
  risks: RiskItem[];
  className?: string;
}

export function RiskHeatmap({ risks, className }: RiskHeatmapProps) {
  const grid: Record<string, number> = {};
  for (const l of TIERS) {
    for (const s of TIERS) {
      grid[`${l}:${s}`] = 0;
    }
  }
  risks.forEach((r) => {
    const key = `${riskLikelihood(r)}:${r.severity}`;
    grid[key] = (grid[key] ?? 0) + 1;
  });

  const maxCount = Math.max(1, ...Object.values(grid));

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-card-foreground">Risk Exposure Matrix</p>
        <p className="text-[10px] text-muted-foreground">Likelihood × Severity</p>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <div />
        <div className="grid grid-cols-3 gap-1 text-center text-[10px] font-medium text-muted-foreground">
          {TIERS.map((t) => (
            <span key={t}>{TIER_LABEL[t]}</span>
          ))}
        </div>
        {[...TIERS].reverse().map((likelihood) => (
          <div key={likelihood} className="contents">
            <div className="flex items-center justify-end pr-1 text-[10px] font-medium text-muted-foreground">{TIER_LABEL[likelihood]}</div>
            <div className="grid grid-cols-3 gap-1">
              {TIERS.map((severity) => {
                const count = grid[`${likelihood}:${severity}`] ?? 0;
                const score = exposureScore(likelihood, severity);
                const intensity = count / maxCount;
                return (
                  <div
                    key={`${likelihood}-${severity}`}
                    title={`${count} risk${count === 1 ? '' : 's'} · ${TIER_LABEL[likelihood]} likelihood · ${TIER_LABEL[severity]} severity`}
                    className={cn(
                      'flex h-10 flex-col items-center justify-center rounded-md border text-[11px] font-semibold transition-colors',
                      cellTone(score),
                      count > 0 && intensity >= 0.5 && 'ring-1 ring-inset ring-foreground/10',
                    )}
                  >
                    <span className="tabular-nums">{count || '·'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">Likelihood uses a deterministic heuristic (defaults to severity tier). Cell color reflects combined exposure.</p>
    </div>
  );
}
