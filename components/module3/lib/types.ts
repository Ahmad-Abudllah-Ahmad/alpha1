export type DocType = "knowledge_base" | "contract";
export type DocStatus = "processing" | "ready" | "error";

export interface ContractDocument {
  id: string;
  filename: string;
  docType: DocType;
  mime?: string | null;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  status: DocStatus;
  error?: string | null;
  createdAt: number;
}

export type RiskSeverity = "high" | "medium" | "low";

export interface RiskItem {
  id: string;
  severity: RiskSeverity;
  title: string;
  analysis: string;
  fidic: string;
  uaeLaw: string;
  action: string;
  excerpt: string;
  page?: number | null;
}

export interface ClauseRef {
  title: string;
  text: string;
  page?: number | null;
  riskIds: string[];
}

export interface AnalysisResult {
  documentId: string;
  summary: string;
  risks: RiskItem[];
  clauses: ClauseRef[];
  createdAt?: number | null;
}

export interface ChatSource {
  documentId: string;
  filename: string;
  page?: number | null;
  snippet: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  pending?: boolean;
}

export type ChatScope = "contract_and_kb" | "kb_only" | "contract_only";

export type ClaimType = "eot" | "notice" | "mitigation" | "contract";

export interface DraftResult {
  draft: string;
  sources: ChatSource[];
}
