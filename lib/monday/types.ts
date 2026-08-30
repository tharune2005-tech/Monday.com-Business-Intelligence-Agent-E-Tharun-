export type MondayColumn = {
  id: string;
  title: string;
  type: string;
};

export type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
  column?: { title?: string | null };
};

export type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
};

export type MondayBoard = {
  id: string;
  name: string;
  columns: MondayColumn[];
  items: MondayItem[];
};

export type MondaySnapshot = {
  syncedAt: string;
  sourceNote?: string;
  boards: MondayBoard[];
};

export type DataSourceMode = "live" | "snapshot";

export type Deal = {
  id: string;
  name: string;
  ownerCode: string | null;
  clientCode: string | null;
  status: string | null;
  stage: string | null;
  stageCode: string | null;
  probability: "High" | "Medium" | "Low" | null;
  value: number | null;
  sector: string | null;
  product: string | null;
  closeDate: string | null;
  tentativeClose: string | null;
  createdDate: string | null;
  issues: string[];
};

export type WorkOrder = {
  id: string;
  name: string;
  customerCode: string | null;
  serial: string | null;
  natureOfWork: string | null;
  executionStatus: string | null;
  sector: string | null;
  typeOfWork: string | null;
  platform: string | null;
  ownerCode: string | null;
  documentType: string | null;
  poDate: string | null;
  probableStart: string | null;
  probableEnd: string | null;
  dataDeliveryDate: string | null;
  lastInvoiceDate: string | null;
  invoiceNo: string | null;
  amountExclGst: number | null;
  amountInclGst: number | null;
  billedExclGst: number | null;
  billedInclGst: number | null;
  collectedInclGst: number | null;
  toBillExclGst: number | null;
  toBillInclGst: number | null;
  receivable: number | null;
  arPriority: boolean;
  qtyPo: string | null;
  qtyOps: string | null;
  qtyBilled: string | null;
  qtyBalance: string | null;
  invoiceStatus: string | null;
  billingStatus: string | null;
  woBilledStatus: string | null;
  actualBillingMonth: string | null;
  issues: string[];
};

export type Metric = {
  label: string;
  value: string;
  hint?: string;
};

export type WorkbookPayload = {
  filename: string;
  base64: string;
  mimeType: string;
  rowCount: number;
  truncatedPreview?: number;
};

export type AgentResponse = {
  headline: string;
  body: string[];
  metrics: Metric[];
  caveats: string[];
  followUps: string[];
  clarification?: string;
  table?: { columns: string[]; rows: string[][] };
  detailTable?: { caption?: string; columns: string[]; rows: string[][] };
  workbook?: WorkbookPayload;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type QueryFilters = {
  sectors: string[];
  sectorLabel: string | null;
  statuses: string[];
  owners: string[];
  products: string[];
  range: { start: string; end: string; label: string } | null;
  rangeField: "tentative" | "close" | "created" | "po" | "end";
};

export type ReportFlag =
  | "overdue"
  | "slipped"
  | "stuck"
  | "missingValue"
  | "notCompleted"
  | "completed"
  | "unbilled"
  | "priority";

export type ReportColumn = {
  id: string;
  label: string;
  board: "deals" | "work-orders";
};

export type QueryIntent = {
  topics: Topic[];
  filters: QueryFilters;
  groupBy: "sector" | "stage" | "owner" | "status" | "product" | "execution" | null;
  compare: boolean;
  wantsBriefing: boolean;
  wantsReport: boolean;
  reportBoard: "deals" | "work-orders" | "both";
  reportColumns: ReportColumn[];
  reportFlags: ReportFlag[];
  raw: string;
  isFollowUp: boolean;
  offTopic: boolean;
};

export type Topic =
  | "pipeline"
  | "revenue"
  | "winrate"
  | "funnel"
  | "sector"
  | "operations"
  | "billing"
  | "receivables"
  | "atrisk"
  | "quality"
  | "cross"
  | "briefing"
  | "search"
  | "report";
