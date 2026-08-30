/**
 * Rebuild data/monday-snapshot.json from the assignment workbooks.
 * The agent never reads xlsx at runtime — only the Monday-shaped dump
 * (or a live Monday.com GraphQL response with the same shape).
 */
import { writeFileSync } from "fs";
import path from "path";
import * as XLSX from "xlsx";

type Column = { id: string; title: string; type: string };
type Item = {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string | null }[];
};

function cell(v: unknown): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return s;
}

function cv(id: string, v: string | number | null) {
  if (v === null) return { id, text: "", value: null };
  if (typeof v === "number") {
    const text = Number.isInteger(v) ? String(v) : String(v);
    return { id, text, value: JSON.stringify(v) };
  }
  return { id, text: v, value: JSON.stringify(v) };
}

const root = process.cwd();
const sourceDir = path.join(root, "data", "source");

const dealCols: Column[] = [
  { id: "owner_code", title: "Owner code", type: "text" },
  { id: "client_code", title: "Client Code", type: "text" },
  { id: "deal_status", title: "Deal Status", type: "status" },
  { id: "close_date", title: "Close Date (A)", type: "date" },
  { id: "closure_probability", title: "Closure Probability", type: "status" },
  { id: "deal_value", title: "Masked Deal value", type: "numbers" },
  { id: "tentative_close", title: "Tentative Close Date", type: "date" },
  { id: "deal_stage", title: "Deal Stage", type: "status" },
  { id: "product", title: "Product deal", type: "text" },
  { id: "sector", title: "Sector/service", type: "text" },
  { id: "created_date", title: "Created Date", type: "date" },
];

const dealFieldMap: [string, string][] = dealCols.map((c) => [c.id, c.title]);

const woCols: Column[] = [
  { id: "customer_code", title: "Customer Name Code", type: "text" },
  { id: "serial", title: "Serial #", type: "text" },
  { id: "nature_of_work", title: "Nature of Work", type: "text" },
  { id: "last_executed_month", title: "Last executed month of recurring project", type: "text" },
  { id: "execution_status", title: "Execution Status", type: "status" },
  { id: "data_delivery_date", title: "Data Delivery Date", type: "date" },
  { id: "po_date", title: "Date of PO/LOI", type: "date" },
  { id: "document_type", title: "Document Type", type: "text" },
  { id: "probable_start", title: "Probable Start Date", type: "date" },
  { id: "probable_end", title: "Probable End Date", type: "date" },
  { id: "owner_code", title: "BD/KAM Personnel code", type: "text" },
  { id: "sector", title: "Sector", type: "text" },
  { id: "type_of_work", title: "Type of Work", type: "text" },
  {
    id: "platform",
    title: "Is any Skylark software platform part of the client deliverables in this deal?",
    type: "text",
  },
  { id: "last_invoice_date", title: "Last invoice date", type: "date" },
  { id: "latest_invoice_no", title: "latest invoice no.", type: "text" },
  { id: "amount_excl_gst", title: "Amount in Rupees (Excl of GST) (Masked)", type: "numbers" },
  { id: "amount_incl_gst", title: "Amount in Rupees (Incl of GST) (Masked)", type: "numbers" },
  { id: "billed_excl_gst", title: "Billed Value in Rupees (Excl of GST.) (Masked)", type: "numbers" },
  { id: "billed_incl_gst", title: "Billed Value in Rupees (Incl of GST.) (Masked)", type: "numbers" },
  { id: "collected_incl_gst", title: "Collected Amount in Rupees (Incl of GST.) (Masked)", type: "numbers" },
  { id: "to_bill_excl_gst", title: "Amount to be billed in Rs. (Exl. of GST) (Masked)", type: "numbers" },
  { id: "to_bill_incl_gst", title: "Amount to be billed in Rs. (Incl. of GST) (Masked)", type: "numbers" },
  { id: "receivable", title: "Amount Receivable (Masked)", type: "numbers" },
  { id: "ar_priority", title: "AR Priority account", type: "text" },
  { id: "qty_ops", title: "Quantity by Ops", type: "text" },
  { id: "qty_po", title: "Quantities as per PO", type: "text" },
  { id: "qty_billed", title: "Quantity billed (till date)", type: "text" },
  { id: "qty_balance", title: "Balance in quantity", type: "text" },
  { id: "invoice_status", title: "Invoice Status", type: "status" },
  { id: "expected_billing_month", title: "Expected Billing Month", type: "text" },
  { id: "actual_billing_month", title: "Actual Billing Month", type: "text" },
  { id: "actual_collection_month", title: "Actual Collection Month", type: "text" },
  { id: "wo_status_billed", title: "WO Status (billed)", type: "status" },
  { id: "collection_status", title: "Collection status", type: "status" },
  { id: "collection_date", title: "Collection Date", type: "date" },
  { id: "billing_status", title: "Billing Status", type: "status" },
];

function numish(v: string | number | null): string | number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return v;
}

const dealWb = XLSX.readFile(path.join(sourceDir, "Deal funnel Data.xlsx"));
const dealRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(dealWb.Sheets[dealWb.SheetNames[0]], {
  defval: null,
  raw: false,
});
const dealItems: Item[] = [];
let skipped = 0;
dealRows.forEach((row, i) => {
  const status = cell(row["Deal Status"]);
  const stage = cell(row["Deal Stage"]);
  if (status === "Deal Status" || stage === "Deal Stage") {
    skipped += 1;
    return;
  }
  const name = cell(row["Deal Name"]);
  dealItems.push({
    id: `deal-${i + 1}`,
    name: typeof name === "string" ? name : "(unnamed deal)",
    column_values: dealFieldMap.map(([id, title]) => {
      const col = dealCols.find((c) => c.id === id);
      const raw = cell(row[title]);
      const v = col?.type === "numbers" ? numish(raw) : raw;
      return cv(id, v);
    }),
  });
});

const woWb = XLSX.readFile(path.join(sourceDir, "Work_Order_Tracker Data.xlsx"));
const woSheet = woWb.Sheets[woWb.SheetNames[0]];
const woRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(woSheet, {
  range: 1,
  defval: null,
  raw: false,
});
const woItems: Item[] = [];
woRows.forEach((row, i) => {
  const name = cell(row["Deal name masked"]);
  const serial = cell(row["Serial #"]);
  const customer = cell(row["Customer Name Code"]);
  if (name === null && serial === null && customer === null) return;
  woItems.push({
    id: `wo-${i + 1}`,
    name: typeof name === "string" ? name : "(unnamed work order)",
    column_values: woCols.map((c) => {
      const raw = cell(row[c.title]);
      const v = c.type === "numbers" ? numish(raw) : raw;
      return cv(c.id, v);
    }),
  });
});

const snapshot = {
  syncedAt: new Date().toISOString(),
  sourceNote:
    "Monday.com board dump shape. Live mode replaces this by querying monday.com GraphQL.",
  boards: [
    { id: "deals", name: "Deal Funnel", columns: dealCols, items: dealItems },
    { id: "work-orders", name: "Work Order Tracker", columns: woCols, items: woItems },
  ],
};

const out = path.join(root, "data", "monday-snapshot.json");
writeFileSync(out, JSON.stringify(snapshot));
console.log(`Wrote ${out}`);
console.log(`deals=${dealItems.length} skipped_header_rows=${skipped} work_orders=${woItems.length}`);
