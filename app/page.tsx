'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModuleBanner } from '@/components/ModuleBanner';
import { TopNav, type ModuleId } from '@/components/TopNav';
import { RoleProvider } from '@/components/RoleProvider';
import { KnowledgeBaseProvider } from '@/components/KnowledgeBaseProvider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { getModuleLoadingComponent } from '@/components/ui/skeleton';
import { ViewFade } from '@/components/ui/view-fade';
import { getSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

const ExecutiveDashboard = dynamic(() => import('@/components/dashboard/ExecutiveDashboard'), { ssr: false, loading: getModuleLoadingComponent('dashboard') });

const EstimationWorkspace = dynamic(() => import('@/components/module1/EstimationWorkspace'), { ssr: false, loading: getModuleLoadingComponent('estimation') });

const ScheduleRiskDashboard = dynamic(() => import('@/components/module2/ScheduleRiskDashboard'), { ssr: false, loading: getModuleLoadingComponent('schedule') });

const ContractReview = dynamic(() => import('@/components/module3/ContractReview'), { ssr: false, loading: getModuleLoadingComponent('contracts') });

const TelegramAdminPanel = dynamic(() => import('@/components/module4/TelegramAdminPanel'), { ssr: false, loading: getModuleLoadingComponent('docbot') });

const moduleTitles: Record<ModuleId, { title: string; description: string }> = {
  dashboard: {
    title: 'Executive Dashboard',
    description: 'Portfolio KPIs, budget health, schedule reliability, and cross-module activity',
  },
  estimation: {
    title: 'Estimation & Quantity Takeoff',
    description: 'Bulk drawing upload (PDF/CAD/image), scaled multi-floor takeoff, and Bill of Quantities export',
  },
  schedule: {
    title: 'Scheduling & Project Controls',
    description: 'Schedule forecast from Primavera P6 — delay risk, reliability, and critical path controls',
  },
  contracts: {
    title: 'Contract & Claims Management',
    description: 'FIDIC clause analysis with UAE law cross-references and claims drafting',
  },
  docbot: {
    title: 'Document Assistant',
    description: 'Semantic document retrieval with SharePoint RBAC and query audit log',
  },
};

const MODULE_PARAM = 'module';
const TAKEOFF_PROJECT_PARAM = 'takeoffProject';
const moduleSlugs: Record<ModuleId, string> = {
  dashboard: 'dashboard',
  estimation: 'takeoff',
  schedule: 'schedule',
  contracts: 'contracts',
  docbot: 'docbot',
};

function moduleFromUrl(): ModuleId {
  if (typeof window === 'undefined') return 'dashboard';
  const slug = new URL(window.location.href).searchParams.get(MODULE_PARAM);
  if (slug === moduleSlugs.estimation) return 'estimation';
  if (slug === moduleSlugs.schedule) return 'schedule';
  return 'dashboard';
}

function writeModuleUrl(module: ModuleId, mode: 'push' | 'replace') {
  const url = new URL(window.location.href);
  url.searchParams.set(MODULE_PARAM, moduleSlugs[module]);
  if (module !== 'estimation') url.searchParams.delete(TAKEOFF_PROJECT_PARAM);
  const method = mode === 'push' ? 'pushState' : 'replaceState';
  window.history[method](window.history.state, '', url);
}

function AppContent() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const meta = moduleTitles[activeModule];

  const navigateModule = useCallback((module: ModuleId) => {
    setActiveModule(module);
    const currentSlug = new URL(window.location.href).searchParams.get(MODULE_PARAM);
    if (currentSlug !== moduleSlugs[module]) writeModuleUrl(module, 'push');
  }, []);

  useEffect(() => {
    const syncFromUrl = () => setActiveModule(moduleFromUrl());
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    const onTakeoffRoute = (event: Event) => {
      // Ignore a late iframe-unmount message after the user has left Takeoff.
      if (moduleFromUrl() !== 'estimation') return;
      const detail = (event as CustomEvent<{ active?: boolean; projectId?: string }>).detail;
      const url = new URL(window.location.href);
      url.searchParams.set(MODULE_PARAM, moduleSlugs.estimation);
      if (detail?.active && detail.projectId) {
        url.searchParams.set(TAKEOFF_PROJECT_PARAM, detail.projectId);
      } else {
        url.searchParams.delete(TAKEOFF_PROJECT_PARAM);
      }
      window.history.replaceState(window.history.state, '', url);
    };
    window.addEventListener('adicc:takeoff-route-state', onTakeoffRoute as EventListener);
    return () => window.removeEventListener('adicc:takeoff-route-state', onTakeoffRoute as EventListener);
  }, []);

  return (
    <div className="min-h-svh w-full bg-sidebar bg-ambient">
      <main className={cn("relative mx-auto flex min-h-svh w-full flex-col", activeModule === "estimation" && "h-svh overflow-hidden")}>
        <TopNav active={activeModule} onChange={navigateModule} />

        <div className={cn("flex min-h-0 flex-1 flex-col", activeModule === "estimation" ? "p-0" : "gap-4 px-4 py-3")}>
          <div className={cn("w-full", activeModule === "estimation" ? "flex min-h-0 flex-1 flex-col" : "space-y-4")}>
            {activeModule !== 'dashboard' && activeModule !== 'estimation' && (
              <ViewFade viewKey={`banner-${activeModule}`} variant="tab">
                <ModuleBanner moduleId={activeModule} title={meta.title} description={meta.description} />
              </ViewFade>
            )}

            <ViewFade viewKey={activeModule} className={activeModule === "estimation" ? "flex h-full min-h-0 flex-1 flex-col" : undefined}>
              {activeModule === 'dashboard' && <ExecutiveDashboard onNavigate={navigateModule} />}
              {activeModule === 'estimation' && <EstimationWorkspace />}
              {activeModule === 'schedule' && <ScheduleRiskDashboard />}
              {activeModule === 'contracts' && <ContractReview />}
              {activeModule === 'docbot' && <TelegramAdminPanel />}
            </ViewFade>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        router.replace('/login');
        return;
      }
      setAllowed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return <div className="min-h-svh w-full bg-sidebar bg-ambient" />;
  }

  return (
    <RoleProvider>
      <NotificationProvider>
        <KnowledgeBaseProvider>
          <AppContent />
        </KnowledgeBaseProvider>
      </NotificationProvider>
    </RoleProvider>
  );
}
