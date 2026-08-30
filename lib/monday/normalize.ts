import type { Deal, MondayBoard, MondayItem, WorkOrder } from "./types";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textOf(item: MondayItem, keys: string[]): string | null {
  const wanted = keys.map(slug);
  for (const cv of item.column_values) {
    const idSlug = slug(cv.id);
    const title = slug(cv.column?.title || "");
    const hit = wanted.some((a) => {
      if (idSlug === a || title === a) return true;
      if (title && a.length >= 8 && (title.includes(a) || a.includes(title))) return true;
      return false;
    });
    if (hit) {
      const t = (cv.text ?? "").trim();
      return t ? t : null;
    }
  }
  return null;
}

export function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^n\/?a$/i.test(s) || s === "-" || s === "--") return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${m}-${d}`;
  }

  const months: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const monthOnly = s.toLowerCase().replace(/\./g, "");
  if (months[monthOnly]) {
    // Month without year — cannot be a full date; keep null and let callers use the raw month.
    return null;
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(excelEpoch.getTime() + serial * 86400000);
    return dt.toISOString().slice(0, 10);
  }

  return null;
}

export function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,₹$]/g, "").replace(/\s/g, "").trim();
  if (!cleaned || cleaned === "-" || /^n\/?a$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

const SECTOR_CANON: Record<string, string> = {
  mining: "Mining",
  mine: "Mining",
  mines: "Mining",
  powerline: "Powerline",
  "power line": "Powerline",
  "power lines": "Powerline",
  transmission: "Powerline",
  renewables: "Renewables",
  renewable: "Renewables",
  solar: "Renewables",
  wind: "Renewables",
  railways: "Railways",
  railway: "Railways",
  rail: "Railways",
  construction: "Construction",
  dsp: "DSP",
  tender: "Tender",
  tenders: "Tender",
  manufacturing: "Manufacturing",
  aviation: "Aviation",
  others: "Others",
  other: "Others",
  "security and surveillance": "Security and Surveillance",
  security: "Security and Surveillance",
  surveillance: "Security and Surveillance",
};

export function canonicalizeSector(raw: string | null): string | null {
  if (!raw) return null;
  const s = slug(raw);
  if (!s || s === "sector service" || s === "sector") return null;
  return SECTOR_CANON[s] ?? raw.replace(/\s+/g, " ").trim();
}

function canonicalizeStatus(raw: string | null): string | null {
  if (!raw) return null;
  const s = slug(raw);
  if (s === "deal status" || s === "status") return null;
  if (s === "on hold" || s === "hold") return "On Hold";
  if (s === "open") return "Open";
  if (s === "won") return "Won";
  if (s === "dead" || s === "lost") return "Dead";
  return raw.trim();
}

function canonicalizeProb(raw: string | null): Deal["probability"] {
  if (!raw) return null;
  const s = slug(raw);
  if (s === "high") return "High";
  if (s === "medium" || s === "med") return "Medium";
  if (s === "low") return "Low";
  return null;
}

function stageCode(stage: string | null): string | null {
  if (!stage) return null;
  const m = stage.trim().match(/^([A-O])\./i);
  if (m) return m[1].toUpperCase();
  const s = slug(stage);
  if (s.includes("project completed")) return "PC";
  return null;
}

const HEADERISH = new Set([
  "deal name",
  "deal status",
  "deal stage",
  "sector/service",
  "product deal",
  "closure probability",
  "close date (a)",
]);

export function toDeal(item: MondayItem): Deal | null {
  if (HEADERISH.has(slug(item.name))) return null;
  const statusRaw = textOf(item, ["deal_status", "deal status"]);
  const stageRaw = textOf(item, ["deal_stage", "deal stage"]);
  if (statusRaw === "Deal Status" || stageRaw === "Deal Stage") return null;

  const issues: string[] = [];
  const value = parseNumber(
    textOf(item, ["deal_value", "masked deal value", "deal value"]),
  );
  const status = canonicalizeStatus(statusRaw);
  const stage = stageRaw && slug(stageRaw) !== "deal stage" ? stageRaw.trim() : null;
  const sector = canonicalizeSector(
    textOf(item, ["sector", "sector/service", "sector service"]),
  );
  const ownerCode = textOf(item, ["owner_code", "owner code"]);
  const probability = canonicalizeProb(
    textOf(item, ["closure_probability", "closure probability"]),
  );
  const closeDate = parseDate(textOf(item, ["close_date", "close date (a)", "close date"]));
  const tentativeClose = parseDate(
    textOf(item, ["tentative_close", "tentative close date", "tentative close"]),
  );
  const createdDate = parseDate(textOf(item, ["created_date", "created date"]));
  const product = textOf(item, ["product", "product deal"]);
  const clientCode = textOf(item, ["client_code", "client code"]);

  if (!value) issues.push("missing_value");
  if (!sector) issues.push("missing_sector");
  if (!ownerCode) issues.push("missing_owner");
  if (!probability) issues.push("missing_probability");
  if (!tentativeClose && !closeDate) issues.push("missing_close_date");
  if (status === "Won" && stage && /^A\./i.test(stage)) issues.push("status_stage_conflict");
  if (value !== null && value < 0) issues.push("negative_value");
  if (value !== null && value >= 1e8) issues.push("outlier_value");

  return {
    id: item.id,
    name: item.name?.trim() || "(unnamed deal)",
    ownerCode,
    clientCode,
    status,
    stage,
    stageCode: stageCode(stage),
    probability,
    value,
    sector,
    product: product && slug(product) !== "product deal" ? product : null,
    closeDate,
    tentativeClose,
    createdDate,
    issues,
  };
}

function canonExec(raw: string | null): string | null {
  if (!raw) return null;
  const s = slug(raw);
  if (s.includes("pause") || s.includes("struck") || s.includes("stuck")) return "Pause / struck";
  if (s.includes("not started")) return "Not Started";
  if (s.includes("partial")) return "Partial Completed";
  if (s.includes("details pending")) return "Details pending from Client";
  if (s.includes("executed until")) return "Executed until current month";
  if (s === "completed") return "Completed";
  if (s === "ongoing") return "Ongoing";
  return raw.trim();
}

export function toWorkOrder(item: MondayItem): WorkOrder | null {
  if (slug(item.name) === "deal name masked") return null;
  const issues: string[] = [];
  const amountExclGst = parseNumber(
    textOf(item, ["amount_excl_gst", "amount in rupees (excl of gst) (masked)"]),
  );
  const billedExclGst = parseNumber(
    textOf(item, ["billed_excl_gst", "billed value in rupees (excl of gst.) (masked)"]),
  );
  const receivable = parseNumber(textOf(item, ["receivable", "amount receivable (masked)"]));
  const toBillExclGst = parseNumber(
    textOf(item, ["to_bill_excl_gst", "amount to be billed in rs. (exl. of gst) (masked)"]),
  );
  const executionStatus = canonExec(textOf(item, ["execution_status", "execution status"]));
  const invoiceStatus = textOf(item, ["invoice_status", "invoice status"]);
  const billingStatus = textOf(item, ["billing_status", "billing status"]);
  const probableEnd = parseDate(textOf(item, ["probable_end", "probable end date"]));

  if (!amountExclGst) issues.push("missing_value");
  if (!executionStatus) issues.push("missing_execution_status");
  if (receivable !== null && receivable < 0) issues.push("negative_receivable");
  if (toBillExclGst !== null && toBillExclGst < 0) issues.push("overbilled");
  if (!invoiceStatus) issues.push("missing_invoice_status");
  if (!probableEnd) issues.push("missing_end_date");

  return {
    id: item.id,
    name: item.name?.trim() || "(unnamed work order)",
    customerCode: textOf(item, ["customer_code", "customer name code"]),
    serial: textOf(item, ["serial", "serial #"]),
    natureOfWork: textOf(item, ["nature_of_work", "nature of work"]),
    executionStatus,
    sector: canonicalizeSector(textOf(item, ["sector"])),
    typeOfWork: textOf(item, ["type_of_work", "type of work"]),
    platform: textOf(item, [
      "platform",
      "is any skylark software platform part of the client deliverables in this deal",
    ]),
    ownerCode: textOf(item, ["owner_code", "bd/kam personnel code"]),
    documentType: textOf(item, ["document_type", "document type"]),
    poDate: parseDate(textOf(item, ["po_date", "date of po/loi"])),
    probableStart: parseDate(textOf(item, ["probable_start", "probable start date"])),
    probableEnd,
    dataDeliveryDate: parseDate(textOf(item, ["data_delivery_date", "data delivery date"])),
    lastInvoiceDate: parseDate(textOf(item, ["last_invoice_date", "last invoice date"])),
    invoiceNo: textOf(item, ["latest_invoice_no", "latest invoice no"]),
    amountExclGst,
    amountInclGst: parseNumber(
      textOf(item, ["amount_incl_gst", "amount in rupees (incl of gst) (masked)"]),
    ),
    billedExclGst,
    billedInclGst: parseNumber(
      textOf(item, ["billed_incl_gst", "billed value in rupees (incl of gst.) (masked)"]),
    ),
    collectedInclGst: parseNumber(
      textOf(item, ["collected_incl_gst", "collected amount in rupees (incl of gst.) (masked)"]),
    ),
    toBillExclGst,
    toBillInclGst: parseNumber(
      textOf(item, ["to_bill_incl_gst", "amount to be billed in rs. (incl. of gst) (masked)"]),
    ),
    receivable,
    arPriority: slug(textOf(item, ["ar_priority", "ar priority account"]) ?? "") === "priority",
    qtyPo: textOf(item, ["qty_po", "quantities as per po"]),
    qtyOps: textOf(item, ["qty_ops", "quantity by ops"]),
    qtyBilled: textOf(item, ["qty_billed", "quantity billed (till date)"]),
    qtyBalance: textOf(item, ["qty_balance", "balance in quantity"]),
    invoiceStatus,
    billingStatus,
    woBilledStatus: textOf(item, ["wo_status_billed", "wo status (billed)"]),
    actualBillingMonth: textOf(item, ["actual_billing_month", "actual billing month"]),
    issues,
  };
}

function withColumnTitles(board: MondayBoard): MondayBoard {
  const titles = new Map(board.columns.map((c) => [c.id, c.title]));
  return {
    ...board,
    items: board.items.map((item) => ({
      ...item,
      column_values: item.column_values.map((cv) => ({
        ...cv,
        column: cv.column?.title ? cv.column : { title: titles.get(cv.id) ?? cv.id },
      })),
    })),
  };
}

export function classifyBoards(boards: MondayBoard[]): {
  deals: Deal[];
  workOrders: WorkOrder[];
} {
  const labeled = boards.map(withColumnTitles);
  const dealsBoard =
    labeled.find((b) => /deal/i.test(b.name)) ??
    labeled.find((b) => b.columns.some((c) => /deal stage/i.test(c.title)));
  const woBoard =
    labeled.find((b) => /work\s*order/i.test(b.name)) ??
    labeled.find((b) => b.columns.some((c) => /execution status/i.test(c.title)));

  const deals = (dealsBoard?.items ?? []).map(toDeal).filter((x): x is Deal => Boolean(x));
  const workOrders = (woBoard?.items ?? [])
    .map(toWorkOrder)
    .filter((x): x is WorkOrder => Boolean(x));
  return { deals, workOrders };
}
