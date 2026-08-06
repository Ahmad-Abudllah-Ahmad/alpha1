"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Switch } from "@/components/ui/switch";
import { ViewFade } from "@/components/ui/view-fade";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Bot,
  Cloud,
  FileText,
  FolderLock,
  History,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { MiniDonut, bannerConfig } from "@/components/ModuleBanner";

type Status = "answered" | "pending" | "not_found";
type TabId = "activity" | "search" | "audit";

interface ActivityEntry {
  id: string;
  time: string;
  user: string;
  query: string;
  response: string;
  status: Status;
}

interface FolderAccess {
  id: string;
  folder: string;
  group: string;
  enabled: boolean;
}

const initialActivity: ActivityEntry[] = [
  { id: "1", time: "14:32", user: "Eng. Taha", query: "What are our obligations under Clause 8.4?", response: "Bot cited Sub-Clause 8.4(b), attached PDF from /Contracts/Active", status: "answered" },
  { id: "2", time: "14:18", user: "PM Khalid", query: "Show delay notice templates", response: "Returned 3 document links from SharePoint /Claims/Templates", status: "answered" },
  { id: "3", time: "13:55", user: "QS Omar", query: "Rate for steel reinforcement GCC Q3 2025", response: "AED 4,250/tonne — source: ADICC Cost Database Rev. 12", status: "answered" },
  { id: "4", time: "13:41", user: "Eng. Sara", query: "FIDIC Silver Book force majeure clause", response: "Clause 19.1 summary with DIAC precedent reference attached", status: "answered" },
  { id: "5", time: "13:22", user: "Legal — Ahmed", query: "ADCCAC arbitration filing requirements", response: "Retrieved from /Legal/Arbitration/ADCCAC-Guide-2024.pdf", status: "answered" },
  { id: "6", time: "12:58", user: "PM Khalid", query: "Latest P6 schedule for Marina Tower", response: "Shared /Drawings/Schedules/Marina-Tower-P6-Rev-14.xer summary", status: "answered" },
  { id: "7", time: "12:34", user: "Eng. Taha", query: "Concrete cube test results Block C", response: "Awaiting document indexing — query queued", status: "pending" },
  { id: "8", time: "11:47", user: "HR — Fatima", query: "Employee visa renewal checklist", response: "Access denied — folder /HR/Payroll is restricted for this group", status: "not_found" },
];

const initialFolders: FolderAccess[] = [
  { id: "f1", folder: "/Contracts/Active", group: "Senior Management", enabled: true },
  { id: "f2", folder: "/Contracts/Archived", group: "Legal Team", enabled: true },
  { id: "f3", folder: "/Drawings/Structural", group: "Engineering", enabled: true },
  { id: "f4", folder: "/Drawings/Architectural", group: "Engineering", enabled: true },
  { id: "f5", folder: "/Claims/Quantum", group: "Claims Team", enabled: true },
  { id: "f6", folder: "/Claims/Templates", group: "Claims Team", enabled: true },
  { id: "f7", folder: "/HR/Payroll", group: "HR Only", enabled: false },
  { id: "f8", folder: "/Tenders/Live", group: "Estimation Team", enabled: true },
  { id: "f9", folder: "/Authority/DDA", group: "Project Management", enabled: true },
  { id: "f10", folder: "/Legal/Arbitration", group: "Legal Team", enabled: true },
];

const connectedSources = [
  { name: "SharePoint Online", status: "Connected" as const, docs: 2847, icon: Cloud, tone: "primary" as const },
  { name: "OneDrive Business", status: "Connected" as const, docs: 412, icon: Cloud, tone: "gold" as const },
  { name: "Microsoft Teams", status: "Syncing" as const, docs: 156, icon: Users, tone: "warning" as const },
];

const searchResults = [
  { title: "FIDIC Sub-Clause 8.4 — Extension of Time", source: "/Contracts/Active/Marina-Tower-FIDIC.pdf", page: 47, snippet: "The Contractor shall be entitled to an extension of the Time for Completion if and to the extent that completion is delayed by…" },
  { title: "Delay Notice Template v3", source: "/Claims/Templates/EoT-Notice-v3.docx", page: null, snippet: "Formal notice of claim for extension of time under Clause 20.1 of the Conditions of Contract…" },
  { title: "ADCCAC Arbitration Guide 2024", source: "/Legal/Arbitration/ADCCAC-Guide-2024.pdf", page: 12, snippet: "Filing requirements for construction disputes under UAE Federal Law No. 6 of 2018…" },
];

const auditLog = [
  { time: "14:32", user: "Eng. Taha", action: "Query", detail: "Clause 8.4 obligations — answered with 2 citations", type: "query" },
  { time: "13:55", user: "QS Omar", action: "Query", detail: "Steel reinforcement rates — cost database match", type: "query" },
  { time: "12:00", user: "System", action: "Sync", detail: "SharePoint index updated — 83 new documents", type: "system" },
  { time: "11:47", user: "HR — Fatima", action: "Denied", detail: "Access denied to /HR/Payroll — RBAC policy", type: "denied" },
  { time: "09:15", user: "Admin", action: "RBAC", detail: "Enabled folder access for /Tenders/Live", type: "admin" },
  { time: "08:30", user: "System", action: "OCR", detail: "Batch OCR completed — 47 scanned drawings indexed", type: "system" },
];

const statusConfig: Record<Status, { label: string; variant: "success" | "warning" | "destructive"; dot: string }> = {
  answered: { label: "Answered", variant: "success", dot: "bg-emerald-500" },
  pending: { label: "Pending", variant: "warning", dot: "bg-amber-500" },
  not_found: { label: "No Document", variant: "destructive", dot: "bg-red-500" },
};

const SOURCE_TONE: Record<"primary" | "gold" | "warning", { stripe: string; chip: string; badge: "success" | "gold" | "warning" }> = {
  primary: { stripe: "bg-primary", chip: "bg-primary/10 text-primary", badge: "success" },
  gold: { stripe: "bg-gold", chip: "bg-gold/15 text-gold-foreground dark:text-gold", badge: "gold" },
  warning: { stripe: "bg-amber-500", chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400", badge: "warning" },
};

export default function TelegramAdminPanel() {
  const [folders, setFolders] = useState(initialFolders);
  const [activeTab, setActiveTab] = useState<TabId>("activity");
  const [searchQuery, setSearchQuery] = useState("");

  const toggleFolder = (id: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const tabs: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
    { id: "activity", label: "Activity Feed", icon: MessageSquare },
    { id: "search", label: "Semantic Search", icon: Search },
    { id: "audit", label: "Audit Log", icon: History },
  ];

  const filteredSearch = searchQuery
    ? searchResults.filter(
        (r) =>
          r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.snippet.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : searchResults;

  const enabledCount = folders.filter((f) => f.enabled).length;

  return (
    <div className="space-y-4">
      {/* Connected Sources */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {connectedSources.map((src) => {
          const Icon = src.icon;
          const tone = SOURCE_TONE[src.tone];
          return (
            <Card key={src.name} className="group relative overflow-hidden hover:border-primary/25">
              <span className={cn("absolute inset-x-0 top-0 h-0.5", tone.stripe)} />
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", tone.chip)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{src.name}</p>
                    <Badge variant={tone.badge} className="text-[9px]">
                      {src.status}
                    </Badge>
                  </div>
                  <p className="tnum mt-0.5 text-xs text-muted-foreground">
                    {src.docs.toLocaleString("en-AE")} docs indexed
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Main panel — activity / search / audit */}
        <div className="xl:col-span-7">
          <Card className="h-full">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5 text-primary" />
                Document Intelligence
              </CardTitle>
              <CardDescription>Semantic search, activity feed, and audit trail</CardDescription>
            </CardHeader>

            <div className="px-4 pt-4">
              <SegmentedTabs
                value={activeTab}
                onChange={setActiveTab}
                ariaLabel="Document intelligence views"
                stretch
                options={tabs.map((tab) => ({
                  value: tab.id,
                  label: tab.label,
                  shortLabel: tab.label.split(" ")[0],
                  icon: tab.icon,
                }))}
              />
            </div>

            <CardContent className="pt-4">
              <ViewFade viewKey={activeTab} variant="tab">
              {activeTab === "activity" && (
                <ScrollArea className="h-[min(420px,55vh)] pr-3 sm:pr-4">
                  <div className="space-y-3">
                    {initialActivity.map((entry) => {
                      const cfg = statusConfig[entry.status];
                      return (
                        <div
                          key={entry.id}
                          className="rounded-xl border bg-background p-3 transition-colors hover:border-primary/20"
                        >
                          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <Bot className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{entry.user}</p>
                                <p className="tnum text-xs text-muted-foreground">{entry.time} today</p>
                              </div>
                            </div>
                            <Badge variant={cfg.variant} className="gap-1 shrink-0">
                              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                              {cfg.label}
                            </Badge>
                          </div>
                          <p className="mb-1 text-sm leading-relaxed">
                            <span className="font-medium text-muted-foreground">Query:</span> &quot;{entry.query}&quot;
                          </p>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Bot:</span> {entry.response}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {activeTab === "search" && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ask anything about your project documents…"
                      className="h-10 border-border/80 pl-10 shadow-xs focus-visible:border-primary"
                    />
                  </div>
                  <div className="space-y-3">
                    {filteredSearch.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-8 text-center">
                        <Search className="mb-2 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm font-medium text-foreground">No matching documents</p>
                        <p className="mt-1 text-xs text-muted-foreground">Try a different search term</p>
                      </div>
                    ) : (
                      filteredSearch.map((result, i) => (
                        <div
                          key={i}
                          className="group rounded-xl border bg-background p-3 transition-colors hover:border-primary/25"
                        >
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary">{result.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-primary">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">{result.source}</span>
                            {result.page ? <span className="text-muted-foreground">· p.{result.page}</span> : null}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{result.snippet}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === "audit" && (
                <ScrollArea className="h-[min(520px,60vh)]">
                  <div className="overflow-x-auto pr-3 sm:pr-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[72px]">Time</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead className="w-[88px]">Action</TableHead>
                          <TableHead>Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLog.map((entry, i) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="tnum font-mono text-xs text-muted-foreground">{entry.time}</TableCell>
                            <TableCell className="text-xs font-medium">{entry.user}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  entry.type === "denied" ? "destructive" : entry.type === "admin" ? "gold" : "secondary"
                                }
                                className="text-[9px]"
                              >
                                {entry.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground sm:max-w-none sm:whitespace-normal">
                              {entry.detail}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              )}
              </ViewFade>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar — analytics + RBAC */}
        <div className="flex flex-col gap-4 xl:col-span-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Document Bot Analytics
              </CardTitle>
              <CardDescription>SharePoint coverage and query volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                <p className="mb-2 text-sm font-bold text-card-foreground">{bannerConfig.docbot.pie.title}</p>
                <MiniDonut slices={bannerConfig.docbot.pie.slices} size={100} />
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-1 flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderLock className="h-5 w-5 text-primary" />
                SharePoint RBAC Control
              </CardTitle>
              <CardDescription>Toggle folder access by user group</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Active Folders</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {enabledCount} of {folders.length} enabled
                  </p>
                </div>
                <Badge variant="gold">SharePoint Online</Badge>
              </div>
              <ScrollArea className="h-[min(380px,50vh)] flex-1">
                <div className="overflow-x-auto pr-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folder</TableHead>
                        <TableHead className="hidden sm:table-cell">Group</TableHead>
                        <TableHead className="text-right">RBAC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {folders.map((folder) => (
                        <TableRow key={folder.id} className="hover:bg-muted/30">
                          <TableCell>
                            <p className="font-mono text-xs text-foreground">{folder.folder}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground sm:hidden">{folder.group}</p>
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{folder.group}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span
                                className={cn(
                                  "tnum text-[10px] font-semibold uppercase tracking-wide",
                                  folder.enabled ? "text-primary" : "text-muted-foreground"
                                )}
                              >
                                {folder.enabled ? "ON" : "OFF"}
                              </span>
                              <Switch
                                checked={folder.enabled}
                                onCheckedChange={() => toggleFolder(folder.id)}
                                aria-label={`Toggle access for ${folder.folder}`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
