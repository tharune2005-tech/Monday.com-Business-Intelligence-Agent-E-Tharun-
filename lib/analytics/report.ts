import type { Deal, ReportColumn, ReportFlag, WorkOrder } from "../monday/types";
import type { QueryFilters } from "../monday/types";
import { todayISO } from "./format";
import { filterDeals, filterWorkOrders } from "./query";

type Getter<T> = { label: string; get: (row: T) => string | number | boolean | null };

export const DEAL_FIELDS: Record<string, Getter<Deal>> = {
  name: { label: "Deal Name", get: (d) => d.name },
  ownerCode: { label: "Owner code", get: (d) => d.ownerCode },
  clientCode: { label: "Client code", get: (d) => d.clientCode },
  status: { label: "Deal Status", get: (d) => d.status },
  stage: { label: "Deal Stage", get: (d) => d.stage },
  probability: { label: "Closure Probability", get: (d) => d.probability },
  value: { label: "Masked Deal value", get: (d) => d.value },
  sector: { label: "Sector/service", get: (d) => d.sector },
  product: { label: "Product deal", get: (d) => d.product },
  closeDate: { label: "Close Date (A)", get: (d) => d.closeDate },
  tentativeClose: { label: "Tentative Close Date", get: (d) => d.tentativeClose },
  createdDate: { label: "Created Date", get: (d) => d.createdDate },
};

export const WO_FIELDS: Record<string, Getter<WorkOrder>> = {
  name: { label: "Deal name masked", get: (w) => w.name },
  customerCode: { label: "Customer Name Code", get: (w) => w.customerCode },
  serial: { label: "Serial #", get: (w) => w.serial },
  natureOfWork: { label: "Nature of Work", get: (w) => w.natureOfWork },
  executionStatus: { label: "Execution Status", get: (w) => w.executionStatus },
  ownerCode: { label: "BD/KAM Personnel code", get: (w) => w.ownerCode },
  sector: { label: "Sector", get: (w) => w.sector },
  typeOfWork: { label: "Type of Work", get: (w) => w.typeOfWork },
  platform: { label: "Platform", get: (w) => w.platform },
  documentType: { label: "Document Type", get: (w) => w.documentType },
  poDate: { label: "Date of PO/LOI", get: (w) => w.poDate },
  probableStart: { label: "Probable Start Date", get: (w) => w.probableStart },
  probableEnd: { label: "Probable End Date", get: (w) => w.probableEnd },
  amountExclGst: { label: "Amount excl GST (Masked)", get: (w) => w.amountExclGst },
  billedExclGst: { label: "Billed excl GST (Masked)", get: (w) => w.billedExclGst },
  collectedInclGst: { label: "Collected incl GST (Masked)", get: (w) => w.collectedInclGst },
  toBillExclGst: { label: "To bill excl GST (Masked)", get: (w) => w.toBillExclGst },
  receivable: { label: "Amount Receivable (Masked)", get: (w) => w.receivable },
  arPriority: { label: "AR Priority", get: (w) => (w.arPriority ? "Priority" : null) },
  invoiceStatus: { label: "Invoice Status", get: (w) => w.invoiceStatus },
  billingStatus: { label: "Billing Status", get: (w) => w.billingStatus },
  woBilledStatus: { label: "WO Status (billed)", get: (w) => w.woBilledStatus },
};

export const DEFAULT_DEAL_COLUMNS: ReportColumn[] = Object.keys(DEAL_FIELDS).map((id) => ({
  id,
  label: DEAL_FIELDS[id].label,
  board: "deals",
}));

export const DEFAULT_WO_COLUMNS: ReportColumn[] = Object.keys(WO_FIELDS).map((id) => ({
  id,
  label: WO_FIELDS[id].label,
  board: "work-orders",
}));

function applyDealFlags(rows: Deal[], flags: ReportFlag[]): Deal[] {
  const today = todayISO();
  return rows.filter((d) => {
    if (flags.includes("missingValue") && d.value !== null) return false;
    if (flags.includes("slipped") && !(d.tentativeClose && d.tentativeClose < today && d.status === "Open")) {
      return false;
    }
    return true;
  });
}

function applyWoFlags(rows: WorkOrder[], flags: ReportFlag[]): WorkOrder[] {
  const today = todayISO();
  return rows.filter((w) => {
    const blob = `${w.executionStatus} ${w.invoiceStatus} ${w.billingStatus}`;
    if (flags.includes("stuck") && !/pause|struck|stuck|pending/i.test(blob)) return false;
    if (flags.includes("overdue") && !(w.probableEnd && w.probableEnd < today && w.executionStatus !== "Completed")) {
      return false;
    }
    if (flags.includes("notCompleted") && w.executionStatus === "Completed") return false;
    if (flags.includes("completed") && w.executionStatus !== "Completed") return false;
    if (
      flags.includes("unbilled") &&
      !(
        /not billed/i.test(w.invoiceStatus || "") ||
        (w.toBillExclGst !== null && w.toBillExclGst > 1000)
      )
    ) {
      return false;
    }
    if (flags.includes("priority") && !w.arPriority) return false;
    if (flags.includes("missingValue") && w.amountExclGst !== null) return false;
    return true;
  });
}

function cell(v: string | number | boolean | null): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "";
  return v;
}

export type SheetSpec = {
  name: string;
  columns: string[];
  rows: (string | number)[][];
};

export function buildReportSheets(
  deals: Deal[],
  workOrders: WorkOrder[],
  filters: QueryFilters,
  board: "deals" | "work-orders" | "both",
  columns: ReportColumn[],
  flags: ReportFlag[],
): SheetSpec[] {
  const sheets: SheetSpec[] = [];
  const dealCols =
    columns.filter((c) => c.board === "deals").length > 0
      ? columns.filter((c) => c.board === "deals")
      : DEFAULT_DEAL_COLUMNS;
  const woCols =
    columns.filter((c) => c.board === "work-orders").length > 0
      ? columns.filter((c) => c.board === "work-orders")
      : DEFAULT_WO_COLUMNS;

  if (board === "deals" || board === "both") {
    const rows = applyDealFlags(filterDeals(deals, filters), flags);
    const ids = dealCols.map((c) => c.id).filter((id) => DEAL_FIELDS[id]);
    const labels = ids.map((id) => DEAL_FIELDS[id].label);
    sheets.push({
      name: "Deals",
      columns: labels,
      rows: rows.map((d) => ids.map((id) => cell(DEAL_FIELDS[id].get(d)))),
    });
  }

  if (board === "work-orders" || board === "both") {
    const rows = applyWoFlags(filterWorkOrders(workOrders, filters), flags);
    const ids = woCols.map((c) => c.id).filter((id) => WO_FIELDS[id]);
    const labels = ids.map((id) => WO_FIELDS[id].label);
    sheets.push({
      name: "Work Orders",
      columns: labels,
      rows: rows.map((w) => ids.map((id) => cell(WO_FIELDS[id].get(w)))),
    });
  }

  return sheets.filter((s) => s.columns.length > 0);
}

export function previewTable(sheets: SheetSpec[], limit = 25): {
  columns: string[];
  rows: string[][];
  hidden: number;
} {
  const sheet = sheets.find((s) => s.rows.length) ?? sheets[0];
  if (!sheet) return { columns: [], rows: [], hidden: 0 };
  const shown = sheet.rows.slice(0, limit).map((r) => r.map((c) => (c === "" ? "—" : String(c))));
  return {
    columns: sheet.columns,
    rows: shown,
    hidden: Math.max(0, sheet.rows.length - shown.length),
  };
}
