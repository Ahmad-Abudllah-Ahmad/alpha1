'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ContractAnalysisSkeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ViewFade } from '@/components/ui/view-fade';
import { cn } from '@/lib/utils';
import { MiniDonut } from '@/components/ModuleBanner';
import { useRole } from '@/components/RoleProvider';
import { AlertTriangle, ChevronDown, Download, FileWarning, FolderOpen, Loader2, MessageSquare, RotateCcw, Scale, Sparkles, Upload } from 'lucide-react';
import * as api from './lib/api';
import { ContractChat } from './ContractChat';
import { ContractRepository } from './ContractRepository';
import { DraftModal } from './DraftModal';
import { RiskHeatmap } from './RiskHeatmap';
import { useKnowledgeBase } from '@/components/KnowledgeBaseProvider';
import { useNotifications } from '@/components/NotificationProvider';
import { useContractsSettings } from './lib/store';
import { downloadDocument } from './lib/export';
import type { AnalysisResult, ContractDocument, RiskSeverity } from './lib/types';

type Phase = 'empty' | 'uploading' | 'analyzing' | 'ready' | 'error';
type RightTab = 'insights' | 'chat';
type ModuleView = 'analyzer' | 'repository';

const SEVERITY_BADGE: Record<RiskSeverity, 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

const SEVERITY_HIGHLIGHT: Record<RiskSeverity, string> = {
  high: 'bg-red-200/50 hover:bg-red-200/80 dark:bg-red-950/45 dark:hover:bg-red-900/50',
  medium: 'bg-amber-200/50 hover:bg-amber-200/80 dark:bg-amber-950/45 dark:hover:bg-amber-900/50',
  low: 'bg-emerald-200/40 hover:bg-emerald-200/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40',
};

const SEVERITY_ACTIVE: Record<RiskSeverity, string> = {
  high: 'bg-red-300/80 dark:bg-red-800/80 text-foreground font-medium ring-1 ring-red-500',
  medium: 'bg-amber-300/80 dark:bg-amber-800/80 text-foreground font-medium ring-1 ring-amber-500',
  low: 'bg-emerald-300/70 dark:bg-emerald-800/70 text-foreground font-medium ring-1 ring-emerald-500',
};

const SEVERITY_SUP: Record<RiskSeverity, string> = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-emerald-600',
};

const SEVERITY_DOT: Record<RiskSeverity, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

function buildReportText(doc: ContractDocument, analysis: AnalysisResult): string {
  const lines: string[] = [];
  lines.push('ADICC — Contract & Claims Risk Report');
  lines.push(`Contract: ${doc.filename}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push(analysis.summary || '(no summary)');
  lines.push('');
  lines.push(`RISKS (${analysis.risks.length})`);
  lines.push('='.repeat(60));
  analysis.risks.forEach((r) => {
    lines.push('');
    lines.push(`[${r.severity.toUpperCase()}] ${r.id} — ${r.title}`);
    lines.push(`FIDIC:        ${r.fidic}`);
    lines.push(`UAE Law:      ${r.uaeLaw}`);
    lines.push(`Analysis:     ${r.analysis}`);
    lines.push(`Action:       ${r.action}`);
    if (r.excerpt) lines.push(`Excerpt:      "${r.excerpt}"${r.page ? ` (p.${r.page})` : ''}`);
  });
  return lines.join('\n');
}

/** Renders a risk's verbatim excerpt as a highlighted, clickable quoted span. */
function RiskExcerpt({ risk, active, onSelect }: { risk: AnalysisResult['risks'][number]; active: boolean; onSelect: () => void }) {
  if (!risk.excerpt) return null;
  return (
    <p className="text-foreground/90">
      <span className={cn('cursor-pointer rounded px-1 py-0.5 transition-colors', active ? SEVERITY_ACTIVE[risk.severity] : SEVERITY_HIGHLIGHT[risk.severity])} onClick={onSelect}>
        &ldquo;{risk.excerpt}&rdquo;
        <sup className={cn('ml-0.5 font-bold', SEVERITY_SUP[risk.severity])}>{risk.id}</sup>
      </span>
    </p>
  );
}

export default function ContractReview() {
  const { settings, updateSettings, ready: settingsReady } = useContractsSettings();
  const { can } = useRole();
  const { online: kbOnline, backendUrl } = useKnowledgeBase();
  const { push: pushNotification } = useNotifications();

  const [moduleView, setModuleView] = useState<ModuleView>('analyzer');

  const [phase, setPhase] = useState<Phase>('empty');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contractDoc, setContractDoc] = useState<ContractDocument | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeRiskId, setActiveRiskId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('insights');
  const [draftOpen, setDraftOpen] = useState(false);
  const [showAllClauses, setShowAllClauses] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'word' | 'txt' | null>(null);
  const restoreAttempted = useRef(false);

  const runAnalysis = useCallback(
    async (doc: ContractDocument) => {
      setPhase('analyzing');
      try {
        const result = await api.analyzeContract(backendUrl, doc.id);
        setAnalysis(result);
        setActiveRiskId(result.risks[0]?.id ?? null);
        setPhase('ready');

        const highCount = result.risks.filter((r) => r.severity === 'high').length;
        pushNotification({
          title: highCount > 0 ? 'High risk alert' : 'Contract analysis complete',
          detail:
            highCount > 0
              ? `${highCount} high-severity clause${highCount === 1 ? '' : 's'} flagged in ${doc.filename}.`
              : `${result.risks.length} item${result.risks.length === 1 ? '' : 's'} reviewed in ${doc.filename}.`,
          variant: highCount > 0 ? 'destructive' : 'default',
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Analysis failed.');
        setPhase('error');
      }
    },
    [backendUrl, pushNotification],
  );

  const openContractFromRepo = useCallback(
    async (doc: ContractDocument) => {
      setModuleView('analyzer');
      setContractDoc(doc);
      updateSettings({ lastContractId: doc.id });
      setErrorMsg(null);
      setActiveRiskId(null);
      setAnalysis(null);

      if (doc.status === 'error') {
        setErrorMsg(doc.error || 'Could not extract text from this file.');
        setPhase('error');
        return;
      }

      try {
        const existing = await api.getAnalysis(backendUrl, doc.id);
        if (existing) {
          setAnalysis(existing);
          setActiveRiskId(existing.risks[0]?.id ?? null);
          setPhase('ready');
        } else if (doc.status === 'ready') {
          await runAnalysis(doc);
        } else {
          setPhase('empty');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not open contract.');
        setPhase('error');
      }
    },
    [backendUrl, runAnalysis, updateSettings],
  );

  // Restore the last analyzed contract on load so a refresh doesn't lose work.
  useEffect(() => {
    if (!settingsReady || restoreAttempted.current || !settings.lastContractId) return;
    restoreAttempted.current = true;
    (async () => {
      try {
        const doc = await api.getDocument(backendUrl, settings.lastContractId!);
        setContractDoc(doc);
        const existing = await api.getAnalysis(backendUrl, doc.id);
        if (existing) {
          setAnalysis(existing);
          setActiveRiskId(existing.risks[0]?.id ?? null);
          setPhase('ready');
        } else if (doc.status === 'ready') {
          await runAnalysis(doc);
        }
      } catch {
        updateSettings({ lastContractId: null });
      }
    })();
  }, [settingsReady, settings.lastContractId, backendUrl, runAnalysis, updateSettings]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhase('uploading');
    setUploadProgress(0);
    setErrorMsg(null);
    setAnalysis(null);
    setContractDoc(null);
    setActiveRiskId(null);

    try {
      const doc = await api.uploadDocument(backendUrl, file, 'contract', setUploadProgress);
      setContractDoc(doc);
      updateSettings({ lastContractId: doc.id });
      if (doc.status === 'error') {
        setErrorMsg(doc.error || 'Could not extract text from this file.');
        setPhase('error');
        return;
      }
      await runAnalysis(doc);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('error');
    }
  };

  const handleReset = () => {
    setPhase('empty');
    setContractDoc(null);
    setAnalysis(null);
    setActiveRiskId(null);
    setErrorMsg(null);
    updateSettings({ lastContractId: null });
  };

  const handleExport = async (format: 'pdf' | 'word' | 'txt') => {
    if (!contractDoc || !analysis) return;
    setExporting(format);
    setExportOpen(false);
    const base = `${contractDoc.filename.replace(/\.[^.]+$/, '')}-risk-report`;
    const title = 'ADICC — Contract & Claims Risk Report';
    try {
      await downloadDocument(format, base, title, buildReportText(contractDoc, analysis));
    } finally {
      setExporting(null);
    }
  };

  const severityCounts = { high: 0, medium: 0, low: 0 };
  analysis?.risks.forEach((r) => severityCounts[r.severity]++);
  const pieSlices = (['high', 'medium', 'low'] as RiskSeverity[])
    .filter((s) => severityCounts[s] > 0)
    .map((s) => ({ name: s[0].toUpperCase() + s.slice(1), value: severityCounts[s], color: SEVERITY_DOT[s] }));

  const visibleClauses = analysis ? (showAllClauses ? analysis.clauses : analysis.clauses.slice(0, 4)) : [];

  return (
    <div className="space-y-4">
      <input type="file" id="contract-upload" className="hidden" accept=".pdf,.docx,.txt,.md" onChange={handleFileChange} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-soft sm:px-4">
        <SegmentedTabs
          value={moduleView}
          onChange={setModuleView}
          ariaLabel="Contract view"
          options={[
            { value: 'analyzer', label: 'Analyzer', icon: Scale },
            { value: 'repository', label: 'Repository', icon: FolderOpen },
          ]}
        />
        {moduleView === 'repository' && <p className="hidden text-xs text-muted-foreground sm:block">Click a row to open in Analyzer</p>}
      </div>

      <ViewFade viewKey={moduleView} variant="tab">
        {moduleView === 'repository' ? (
          <ContractRepository backendUrl={backendUrl} backendOnline={kbOnline} onOpen={openContractFromRepo} />
        ) : (
          <div className="grid min-h-[480px] grid-cols-1 gap-0 overflow-hidden rounded-xl border bg-background lg:grid-cols-2">
            {/* Left Column: Contract Clause Viewer */}
            <div className="flex flex-col border-b lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b px-4 py-3 gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold truncate">{contractDoc ? 'Contract Analysis' : 'Contract Clause Viewer'}</h2>
                  <p className="text-xs text-muted-foreground truncate font-mono">{contractDoc?.filename ?? 'No contract loaded yet'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {phase === 'ready' || phase === 'error' ? (
                    <Button variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground hover:text-foreground flex items-center gap-1.5" onClick={handleReset}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>New contract</span>
                    </Button>
                  ) : phase === 'empty' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 border-primary text-primary hover:bg-primary/5 flex items-center gap-1.5"
                      onClick={() => document.getElementById('contract-upload')?.click()}
                      disabled={kbOnline === false || !can('upload_contract')}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Contract</span>
                    </Button>
                  ) : null}
                  {phase === 'ready' && <Badge variant="success">Analysis complete</Badge>}
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 py-3">
                {phase === 'empty' && (
                  <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Scale className="h-7 w-7" />
                    </div>
                    <div className="max-w-sm space-y-1.5">
                      <h3 className="text-sm font-semibold text-foreground">Upload a contract to begin</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Any FIDIC draft, commercial agreement, or subcontract (PDF, DOCX, or TXT). ADICC extracts clauses, flags risks against your knowledge base, and cites every finding.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => document.getElementById('contract-upload')?.click()} disabled={kbOnline === false || !can('upload_contract')} className="gap-1.5">
                      <Upload className="h-3.5 w-3.5" /> Upload Contract
                    </Button>
                    {kbOnline === false && (
                      <p className="max-w-xs rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                        Analysis service is temporarily unavailable. Open Knowledge Base from the header when the service is back online.
                      </p>
                    )}
                  </div>
                )}

                {(phase === 'uploading' || phase === 'analyzing') && (
                  <div className="flex h-full min-h-[360px] flex-col">
                    <div className="border-b px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground">Contract Analysis</p>
                          <p className="truncate text-xs text-muted-foreground font-mono">
                            {phase === 'uploading' ? 'Uploading' : 'Analyzing'} {contractDoc?.filename}
                          </p>
                        </div>
                        {phase === 'uploading' && <span className="tnum shrink-0 text-xs font-medium text-primary">{uploadProgress}%</span>}
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full bg-primary transition-all duration-300 ease-out', phase === 'analyzing' && 'w-full animate-pulse')}
                          style={phase === 'uploading' ? { width: `${uploadProgress}%` } : undefined}
                        />
                      </div>
                    </div>
                    <ContractAnalysisSkeleton />
                  </div>
                )}

                {phase === 'error' && (
                  <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-7 w-7" />
                    </div>
                    <div className="max-w-sm space-y-1.5">
                      <h3 className="text-sm font-semibold text-foreground">Couldn&apos;t analyze this contract</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{errorMsg}</p>
                    </div>
                    {contractDoc && (
                      <Button size="sm" variant="outline" onClick={() => runAnalysis(contractDoc)} className="gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" /> Retry analysis
                      </Button>
                    )}
                  </div>
                )}

                {phase === 'ready' && analysis && (
                  <div className="space-y-4 text-sm leading-relaxed">
                    <section className="rounded-lg border border-primary/15 bg-primary/[0.03] p-3.5">
                      <p className="text-xs font-semibold text-primary mb-1">AI Summary</p>
                      <p className="text-xs text-foreground/90 leading-relaxed">{analysis.summary}</p>
                    </section>

                    <Separator />

                    {analysis.risks.map((risk, i) => (
                      <div key={risk.id}>
                        <section className="animate-in slide-in-from-bottom-2 duration-300">
                          <h3 className="mb-2 font-semibold text-foreground flex items-center gap-2">
                            {risk.title}
                            {risk.page ? <span className="text-[10px] font-normal text-muted-foreground">p.{risk.page}</span> : null}
                          </h3>
                          <RiskExcerpt
                            risk={risk}
                            active={activeRiskId === risk.id}
                            onSelect={() => {
                              setActiveRiskId(risk.id);
                              setRightTab('insights');
                            }}
                          />
                        </section>
                        {i < analysis.risks.length - 1 && <Separator className="mt-4" />}
                      </div>
                    ))}

                    {analysis.clauses.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <button type="button" onClick={() => setShowAllClauses((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAllClauses && 'rotate-180')} />
                            {showAllClauses ? 'Hide' : 'Show'} {analysis.clauses.length} extracted clause
                            {analysis.clauses.length === 1 ? '' : 's'}
                          </button>
                          {showAllClauses && (
                            <div className="mt-3 space-y-3">
                              {visibleClauses.map((c, i) => (
                                <div key={i} className="rounded-lg border bg-muted/20 p-3">
                                  {c.title && <p className="text-xs font-semibold text-foreground mb-1">{c.title}</p>}
                                  <p className="text-xs text-muted-foreground leading-relaxed">{c.text}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Right Column: Insights + Assistant */}
            <div className="flex flex-col bg-primary/[0.015]">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Scale className="h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold">Legal Insights</h2>
                  <p className="text-xs text-muted-foreground">{analysis ? `${analysis.risks.length} items flagged against your knowledge base` : 'Upload a contract or search the knowledge base'}</p>
                </div>
              </div>

              <div className="border-b px-4 py-2">
                <SegmentedTabs
                  value={rightTab}
                  onChange={setRightTab}
                  ariaLabel="Contract insights"
                  options={[
                    { value: 'insights', label: 'Insights', icon: FileWarning },
                    { value: 'chat', label: 'Assistant', icon: MessageSquare },
                  ]}
                />
              </div>

              <ViewFade viewKey={rightTab} variant="tab" className="flex min-h-0 flex-1 flex-col">
                {rightTab === 'insights' ? (
                  <>
                    {analysis && pieSlices.length > 0 && (
                      <div className="border-b px-4 py-3 bg-muted/20">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <div className="flex flex-col gap-2.5 rounded-lg border border-border/50 bg-background p-4">
                            <p className="text-sm font-bold text-card-foreground mb-0.5">Risk Severity</p>
                            <div className="flex items-center w-full mt-1.5">
                              <MiniDonut slices={pieSlices} size={88} />
                            </div>
                          </div>
                          <div className="rounded-lg border border-border/50 bg-background p-4">
                            <RiskHeatmap risks={analysis.risks} />
                          </div>
                        </div>
                      </div>
                    )}

                    <ScrollArea className="flex-1 px-4 py-3">
                      {!analysis ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                          <Sparkles className="h-8 w-8 text-primary/40" />
                          <p className="text-sm font-medium text-foreground">No analysis yet</p>
                          <p className="max-w-xs text-xs">Upload a contract on the left, or switch to Assistant to query your knowledge base.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {analysis.risks.map((risk) => (
                            <div
                              key={risk.id}
                              className={cn(
                                'surface-inset cursor-pointer transition-colors hover:border-primary/40',
                                activeRiskId === risk.id ? 'ring-2 ring-primary border-primary bg-primary/[0.02]' : '',
                              )}
                              onClick={() => setActiveRiskId(risk.id)}
                            >
                              <div className="flex items-start justify-between gap-2 pb-2">
                                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                  <FileWarning className="h-4 w-4 text-primary shrink-0" />
                                  <span className="truncate">{risk.title}</span>
                                </p>
                                <Badge variant={SEVERITY_BADGE[risk.severity]} className="text-[10px] uppercase rounded-sm px-1.5 shrink-0">
                                  {risk.id}
                                </Badge>
                              </div>
                              <div className="space-y-2.5 text-xs leading-normal">
                                <p className="text-muted-foreground font-normal">{risk.analysis}</p>
                                <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-normal border border-border/50">
                                  <p>
                                    <span className="font-semibold text-foreground">FIDIC:</span> <span className="text-muted-foreground">{risk.fidic}</span>
                                  </p>
                                  <p>
                                    <span className="font-semibold text-foreground">UAE Law:</span> <span className="text-primary">{risk.uaeLaw}</span>
                                  </p>
                                </div>
                                {risk.action && (
                                  <p className="text-xs bg-primary/5 text-primary/95 p-2 rounded-md border border-primary/10">
                                    <span className="font-semibold">Recommended Action:</span> {risk.action}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    <div className="flex flex-wrap gap-3 border-t p-4 bg-background">
                      <Button size="sm" className="flex-1 text-xs" disabled={phase !== 'ready'} onClick={() => setDraftOpen(true)}>
                        Draft Contract / Notice
                      </Button>
                      <div className="relative flex-1">
                        <Button size="sm" variant="outline" className="w-full text-xs" disabled={phase !== 'ready' || !!exporting} onClick={() => setExportOpen((v) => !v)}>
                          {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                          Export Claims Risk Report
                        </Button>
                        {exportOpen && phase === 'ready' && (
                          <div className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-lg border bg-popover shadow-elevated">
                            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/60" onClick={() => handleExport('pdf')}>
                              <Download className="h-3.5 w-3.5 text-primary" />
                              Download as PDF
                            </button>
                            <button type="button" className="flex w-full items-center gap-2 border-t px-3 py-2 text-xs hover:bg-muted/60" onClick={() => handleExport('word')}>
                              <Download className="h-3.5 w-3.5 text-primary" />
                              Download as Word
                            </button>
                            <button type="button" className="flex w-full items-center gap-2 border-t px-3 py-2 text-xs hover:bg-muted/60" onClick={() => handleExport('txt')}>
                              <Download className="h-3.5 w-3.5 text-primary" />
                              Download as TXT
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <ContractChat backendUrl={backendUrl} contractId={contractDoc?.id ?? null} contractFilename={contractDoc?.filename} backendOnline={kbOnline} />
                )}
              </ViewFade>
            </div>
          </div>
        )}
      </ViewFade>

      {contractDoc && moduleView === 'analyzer' && (
        <DraftModal open={draftOpen} onClose={() => setDraftOpen(false)} backendUrl={backendUrl} contractId={contractDoc.id} contractFilename={contractDoc.filename} analysis={analysis} />
      )}
    </div>
  );
}
