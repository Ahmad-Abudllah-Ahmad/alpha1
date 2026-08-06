'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ModuleBanner } from '@/components/ModuleBanner';
import { TopNav, type ModuleId } from '@/components/TopNav';
import { RoleProvider } from '@/components/RoleProvider';
import { KnowledgeBaseProvider } from '@/components/KnowledgeBaseProvider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { getModuleLoadingComponent } from '@/components/ui/skeleton';
import { ViewFade } from '@/components/ui/view-fade';

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

function AppContent() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const meta = moduleTitles[activeModule];

  return (
    <div className="min-h-svh w-full bg-sidebar bg-ambient">
      <main className="relative mx-auto flex min-h-svh w-full flex-col">
        <TopNav active={activeModule} onChange={setActiveModule} />

        <div className="flex flex-1 flex-col gap-4 px-4 py-3">
          <div className="w-full space-y-4">
            {activeModule !== 'dashboard' && activeModule !== 'estimation' && (
              <ViewFade viewKey={`banner-${activeModule}`} variant="tab">
                <ModuleBanner moduleId={activeModule} title={meta.title} description={meta.description} />
              </ViewFade>
            )}

            <ViewFade viewKey={activeModule}>
              {activeModule === 'dashboard' && <ExecutiveDashboard onNavigate={setActiveModule} />}
              {activeModule === 'estimation' && <EstimationWorkspace />}
              {activeModule === 'schedule' && <ScheduleRiskDashboard />}
              {activeModule === 'contracts' && <ContractReview />}
              {activeModule === 'docbot' && <TelegramAdminPanel />}
            </ViewFade>
          </div>

          <footer className="w-full border-t border-border/50 pt-3">
            <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row">
              <p className="text-xs text-muted-foreground">© 2026 ADICC · All rights reserved</p>
              <p className="text-xs text-muted-foreground">Abu Dhabi · Since 1989</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
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
