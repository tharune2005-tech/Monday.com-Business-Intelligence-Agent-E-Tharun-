import type {
  ChatMessage,
  QueryFilters,
  QueryIntent,
  ReportColumn,
  ReportFlag,
  Topic,
} from "../monday/types";
import { fiscalQuarterOf, quarterOf, todayISO } from "../analytics/format";

const SECTOR_MAP: Record<string, string[]> = {
  mining: ["Mining"],
  mine: ["Mining"],
  mines: ["Mining"],
  powerline: ["Powerline"],
  "power line": ["Powerline"],
  transmission: ["Powerline"],
  renewables: ["Renewables"],
  renewable: ["Renewables"],
  solar: ["Renewables"],
  wind: ["Renewables"],
  energy: ["Renewables", "Powerline"],
  railways: ["Railways"],
  railway: ["Railways"],
  rail: ["Railways"],
  construction: ["Construction"],
  dsp: ["DSP"],
  tender: ["Tender"],
  tenders: ["Tender"],
  manufacturing: ["Manufacturing"],
  aviation: ["Aviation"],
  security: ["Security and Surveillance"],
  surveillance: ["Security and Surveillance"],
  others: ["Others"],
};

const OWNER_RE = /\bowner[_\s-]?0*(\d{1,3})\b/i;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const DEAL_COLUMN_ALIASES: { id: string; label: string; aliases: string[] }[] = [
  { id: "name", label: "Deal Name", aliases: ["deal name", "deal names", "name"] },
  { id: "ownerCode", label: "Owner code", aliases: ["owner code", "owner codes", "owner"] },
  { id: "clientCode", label: "Client code", aliases: ["client code", "client codes", "client", "company code"] },
  { id: "status", label: "Deal Status", aliases: ["deal status", "status"] },
  { id: "stage", label: "Deal Stage", aliases: ["deal stage", "stage"] },
  { id: "probability", label: "Closure Probability", aliases: ["closure probability", "probability"] },
  { id: "value", label: "Masked Deal value", aliases: ["deal value", "masked deal value", "value", "amount"] },
  { id: "sector", label: "Sector/service", aliases: ["sector", "sector/service"] },
  { id: "product", label: "Product deal", aliases: ["product deal", "product"] },
  { id: "closeDate", label: "Close Date (A)", aliases: ["close date", "actual close"] },
  { id: "tentativeClose", label: "Tentative Close Date", aliases: ["tentative close", "tentative close date"] },
  { id: "createdDate", label: "Created Date", aliases: ["created date", "created"] },
];

const WO_COLUMN_ALIASES: { id: string; label: string; aliases: string[] }[] = [
  { id: "name", label: "Deal name masked", aliases: ["deal name", "work order name", "wo name"] },
  { id: "customerCode", label: "Customer Name Code", aliases: ["customer name code", "customer code", "customer"] },
  { id: "serial", label: "Serial #", aliases: ["serial", "serial #", "sdpldeal", "serial number"] },
  { id: "executionStatus", label: "Execution Status", aliases: ["execution status", "execution"] },
  { id: "ownerCode", label: "BD/KAM Personnel code", aliases: ["owner code", "owner", "bd/kam"] },
  { id: "sector", label: "Sector", aliases: ["sector"] },
  { id: "typeOfWork", label: "Type of Work", aliases: ["type of work"] },
  { id: "amountExclGst", label: "Amount excl GST (Masked)", aliases: ["amount", "contracted", "wo value"] },
  { id: "billedExclGst", label: "Billed excl GST (Masked)", aliases: ["billed"] },
  { id: "receivable", label: "Amount Receivable (Masked)", aliases: ["receivable", "ar"] },
  { id: "toBillExclGst", label: "To bill excl GST (Masked)", aliases: ["unbilled", "to bill"] },
  { id: "invoiceStatus", label: "Invoice Status", aliases: ["invoice status"] },
  { id: "billingStatus", label: "Billing Status", aliases: ["billing status"] },
  { id: "probableEnd", label: "Probable End Date", aliases: ["probable end", "end date"] },
  { id: "probableStart", label: "Probable Start Date", aliases: ["probable start", "start date"] },
];

function extractRequestedFields(text: string): string | null {
  const m = text.match(
    /(?:give me|list|show me|export|download|pull|extract)\s+(.+?)(?:\s+for\s+|\s+with\s+|\s+where\s+|\s+that\s+|\s+who\s+|$)/i,
  );
  if (!m) return null;
  const chunk = m[1].trim();
  if (/^(all|the|a|an)\s+(open |won |dead )?(deals?|work orders?|rows?|records?|details?)/i.test(chunk)) {
    return "";
  }
  if (/^all details|^every column|^full /i.test(chunk)) return "";
  return chunk;
}

function detectReportColumns(text: string, board: "deals" | "work-orders" | "both"): ReportColumn[] {
  const fragment = extractRequestedFields(text);
  if (fragment === null || fragment === "") return [];
  const s = slug(fragment);
  const found: ReportColumn[] = [];
  const seen = new Set<string>();

  if (board !== "work-orders") {
    for (const col of DEAL_COLUMN_ALIASES) {
      if (col.aliases.some((a) => a.length >= 4 && s.includes(a))) {
        const key = `deals:${col.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ id: col.id, label: col.label, board: "deals" });
        }
      }
    }
  }
  if (board === "work-orders" || board === "both") {
    for (const col of WO_COLUMN_ALIASES) {
      if (col.aliases.some((a) => a.length >= 4 && s.includes(a))) {
        const key = `wo:${col.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ id: col.id, label: col.label, board: "work-orders" });
        }
      }
    }
  }
  return found;
}

function detectReportFlags(text: string): ReportFlag[] {
  const s = slug(text);
  const flags: ReportFlag[] = [];
  if (/\boverdue|past probable|past end\b/.test(s)) flags.push("overdue");
  if (/\bslipped|past tentative|past close\b/.test(s)) flags.push("slipped");
  if (/\bstuck|pause|struck\b/.test(s)) flags.push("stuck");
  if (/\bmissing value|blank value|no value|without a value\b/.test(s)) flags.push("missingValue");
  if (/\bnot completed|incomplete\b/.test(s)) flags.push("notCompleted");
  if (/\bcompleted\b/.test(s) && !/\bnot completed\b/.test(s)) flags.push("completed");
  if (/\bunbilled|not billed|to bill\b/.test(s)) flags.push("unbilled");
  if (/\bpriority ar|ar priority\b/.test(s)) flags.push("priority");
  return flags;
}

function detectReportBoard(text: string): "deals" | "work-orders" | "both" {
  const s = slug(text);
  const wo = /\bwork order|work-order|\bwo\b|execution|invoice|receivable|unbilled\b/.test(s);
  const deals = /\bdeal|pipeline|funnel|owner code|client code|deal status|deal name\b/.test(s);
  if (wo && deals) return "both";
  if (wo && !deals) return "work-orders";
  return "deals";
}

function wantsDetailedReport(text: string): boolean {
  const s = slug(text);
  if (/\bexcel|spreadsheet|xlsx|csv|download|export|dump\b/.test(s)) return true;
  if (/\bgive me\b|\blist\b|\bextract\b|\bpull\b/.test(s)) return true;
  if (/\bshow me (the |all )?(rows|records|details|list)\b/.test(s)) return true;
  if (/\bdeal name\b/.test(s) && (/\bowner code\b/.test(s) || /\bclient code\b/.test(s))) return true;
  if (/\ball details|full report|detailed report|line items|row level\b/.test(s)) return true;
  return false;
}

function detectSectors(text: string): { sectors: string[]; label: string | null } {
  const s = slug(text);
  const found = new Map<string, string>();
  for (const [k, vals] of Object.entries(SECTOR_MAP)) {
    if (new RegExp(`\\b${k}\\b`).test(s)) {
      for (const v of vals) found.set(v, v);
    }
  }
  const sectors = [...found.keys()];
  if (!sectors.length) return { sectors: [], label: null };
  if (/\benergy\b/.test(s)) return { sectors, label: "energy (Renewables + Powerline)" };
  return { sectors, label: sectors.join(" + ") };
}

function detectRange(text: string): QueryFilters["range"] {
  const s = slug(text);
  const today = todayISO();
  if (/\bfiscal\b|\bfy\b|\bfinancial year\b/.test(s) && /\bthis quarter\b|\bcurrent quarter\b/.test(s)) {
    return fiscalQuarterOf(today);
  }
  if (/\bthis quarter\b|\bcurrent quarter\b|\bthis q\b/.test(s)) return quarterOf(today);
  if (/\blast quarter\b|\bprevious quarter\b/.test(s)) {
    const [y, m] = today.split("-").map(Number);
    const prev = new Date(y, m - 4, 1);
    return quarterOf(prev.toISOString().slice(0, 10));
  }
  if (/\bthis month\b|\bcurrent month\b/.test(s)) {
    const [y, m] = today.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${last}`, label: `${y}-${pad(m)}` };
  }
  if (/\bthis year\b|\bytd\b|\byear to date\b/.test(s)) {
    const y = Number(today.slice(0, 4));
    return { start: `${y}-01-01`, end: today, label: `${y} YTD` };
  }
  const q = s.match(/\bq([1-4])\s*(20\d{2})?\b/);
  if (q) {
    const year = q[2] ? Number(q[2]) : Number(today.slice(0, 4));
    const startM = (Number(q[1]) - 1) * 3 + 1;
    const dummy = `${year}-${String(startM).padStart(2, "0")}-01`;
    return quarterOf(dummy);
  }
  const fy = s.match(/\bfy\s*(20)?(\d{2})\b/);
  if (fy) {
    const yy = Number(fy[2]);
    const endYear = yy < 100 ? 2000 + yy : yy;
    const startYear = endYear - 1;
    return { start: `${startYear}-04-01`, end: `${endYear}-03-31`, label: `FY${String(endYear).slice(2)}` };
  }
  return null;
}

function detectStatuses(text: string): string[] {
  const s = slug(text);
  const out: string[] = [];
  if (/\bon hold\b|\bhold\b/.test(s)) out.push("On Hold");
  if (/\bwon\b|\bbooked\b/.test(s)) out.push("Won");
  if (/\bdead\b|\blost\b/.test(s)) out.push("Dead");
  if (/\bopen\b|\blive\b|\bactive\b/.test(s)) out.push("Open");
  return out;
}

function detectOwners(text: string): string[] {
  const m = text.match(OWNER_RE);
  if (!m) return [];
  return [`OWNER_${m[1].padStart(3, "0")}`];
}

function detectProducts(text: string): string[] {
  const s = slug(text);
  const out: string[] = [];
  if (/\bspectra\b/.test(s)) out.push("Spectra");
  if (/\bdmo\b/.test(s)) out.push("DMO");
  if (/\bdock\b/.test(s)) out.push("Dock");
  if (/\bhardware\b/.test(s)) out.push("Hardware");
  if (/\bpure service\b|\bservice only\b/.test(s)) out.push("Pure Service");
  return out;
}

function detectTopics(text: string): Topic[] {
  const s = slug(text);
  if (wantsDetailedReport(text)) return ["report"];
  const topics = new Set<Topic>();
  if (/\bbrief|leadership|board pack|update for|standup|weekly update|prepare data\b/.test(s) || /\bleadership update\b/.test(s)) {
    topics.add("briefing");
  }
  if (/\bpipeline|book of business|coverage\b/.test(s)) topics.add("pipeline");
  if (/\bhow.?s (our |the )?(pipeline|funnel|book)\b/.test(s)) topics.add("pipeline");
  if (/\bfunnel|stage mix|by stage\b/.test(s)) topics.add("funnel");
  if (/\brevenue|gmv|booked|top line|how much (did|have) we (make|bill|collect)\b/.test(s)) topics.add("revenue");
  if (/\bwin rate|win-rate|conversion|won vs\b/.test(s)) topics.add("winrate");
  if (/\b(by sector|sector mix|which sectors|vertical mix|verticals)\b/.test(s)) topics.add("sector");
  if (/\bwork order|operations|\bops\b|execution|delivery|overdue\b/.test(s)) topics.add("operations");
  if (/\bbill|unbilled|invoice\b/.test(s)) topics.add("billing");
  if (/\breceivable|\bar\b|collect|cash outstanding\b/.test(s)) topics.add("receivables");
  if (/\bat risk|slipped|pause|struck\b/.test(s)) topics.add("atrisk");
  if (/\bstuck\b/.test(s) && !/\bbill/.test(s)) topics.add("atrisk");
  if (/\bdata quality|missing data|caveats?\b|\bcompleteness\b|messy data\b/.test(s)) topics.add("quality");
  if (/\bcross|both boards|reconcil|without a work order|join\b/.test(s)) topics.add("cross");
  if (/\bsearch|look up|find deal|find wo|sdpldeal\b/.test(s)) topics.add("search");

  // Named sectors often imply pipeline unless another topic is explicit
  const { sectors } = detectSectors(text);
  if (sectors.length && topics.size === 0) topics.add("pipeline");

  return [...topics];
}

const BOARD_SIGNAL =
  /\b(deal|deals|pipeline|funnel|revenue|win.?rate|work.?orders?|\bwos?\b|billing|billed|unbilled|invoice|receivable|\bar\b|sector|verticals?|owner|client|stage|overdue|slipped|operations?|\bops\b|monday|boards?|briefing|leadership|export|excel|spreadsheet|xlsx|csv|won|dead|\bopen\b|on hold|mining|energy|renewables?|powerline|railways?|\brail\b|construction|\bdsp\b|tenders?|aviation|surveillance|spectra|\bdmo\b|dock|hardware|forecast|coverage|booked|gmv|collect(?:ion|ed)?|pause|struck|stuck|quality|caveats?|sdpldeal|perch|gst|lakh|crore|rupees?|\binr\b|probability|product|execution|delivery|customer|serial|kpi|metrics?|snapshot|standup|founder|top line|masked|company code|client code|owner code|tentative|po date|type of work|close date|data quality|completeness)\b/;

const IMPLIED_BUSINESS =
  /\bhow(?:'?s| is) (?:it|that|this) (?:doing|looking|going)\b|\bhow(?:'?s| is) the (?:business|company|book|numbers?|pipeline|funnel)(?: (?:doing|looking|going))?\b|\bhow are we doing\b|\bthe numbers\b|\bgive me (?:a )?status\b/;

function hasBoardSignal(text: string): boolean {
  if (looksLikeLookup(text)) return true;
  if (detectSectors(text).sectors.length) return true;
  if (detectStatuses(text).length) return true;
  if (detectOwners(text).length) return true;
  if (detectProducts(text).length) return true;
  if (detectRange(text)) return true;
  const s = slug(text);
  if (IMPLIED_BUSINESS.test(s)) return true;
  if (BOARD_SIGNAL.test(s)) return true;
  return false;
}

function isFollowUp(text: string): boolean {
  const s = slug(text);
  if (s.length > 120) return false;
  if (/^(what about|how about|and |also |same for|vs |versus |now )/.test(s)) return true;
  if (/\bcompar(e|ed|ing|ison)?\b/.test(s)) return true;
  if (/^(break (it|that) down|by owner|by stage|by sector)/.test(s)) return true;
  return Object.keys(SECTOR_MAP).some((k) => s === k || s === `the ${k}`);
}

function emptyFilters(): QueryFilters {
  return {
    sectors: [],
    sectorLabel: null,
    statuses: [],
    owners: [],
    products: [],
    range: null,
    rangeField: "tentative",
  };
}

export function parseIntent(messages: ChatMessage[]): QueryIntent {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  const raw = userTexts[userTexts.length - 1] || "";
  const follow = isFollowUp(raw);

  let base = emptyFilters();
  let topics: Topic[] = [];

  const history = follow ? userTexts : [raw];
  for (const t of history) {
    const next = parseOne(t, base, topics);
    base = next.filters;
    topics = next.topics.length ? next.topics : topics;
  }

  // Last message overlays
  const last = parseOne(raw, follow ? base : emptyFilters(), follow ? topics : []);
  const filters = follow
    ? {
        ...base,
        sectors: last.filters.sectors.length ? last.filters.sectors : base.sectors,
        sectorLabel: last.filters.sectors.length ? last.filters.sectorLabel : base.sectorLabel,
        statuses: last.filters.statuses.length ? last.filters.statuses : base.statuses,
        owners: last.filters.owners.length ? last.filters.owners : base.owners,
        products: last.filters.products.length ? last.filters.products : base.products,
        range: last.filters.range ?? base.range,
      }
    : last.filters;

  let finalTopics = last.topics.length ? last.topics : topics.length ? topics : (["pipeline"] as Topic[]);
  if (last.topics.includes("briefing")) finalTopics = ["briefing"];

  const offTopic = !follow && !hasBoardSignal(raw);
  if (offTopic) finalTopics = ["pipeline"];

  const report = !offTopic && (wantsDetailedReport(raw) || (follow && wantsDetailedReport(raw)));
  if (report) finalTopics = ["report"];

  const reportBoard = detectReportBoard(raw);
  const reportColumns = detectReportColumns(raw, reportBoard);
  const reportFlags = detectReportFlags(raw);

  let groupBy: QueryIntent["groupBy"] = null;
  const s = slug(raw);
  if (/\bby sector\b/.test(s)) groupBy = "sector";
  if (/\bby stage\b/.test(s)) groupBy = "stage";
  if (/\bby owner\b/.test(s)) groupBy = "owner";
  if (/\bby status\b/.test(s)) groupBy = "status";

  return {
    topics: finalTopics,
    filters,
    groupBy,
    compare: /\bvs\b|\bversus\b|\bcompar/.test(s),
    wantsBriefing: finalTopics.includes("briefing"),
    wantsReport: report,
    reportBoard,
    reportColumns,
    reportFlags,
    raw,
    isFollowUp: follow,
    offTopic,
  };
}

function parseOne(text: string, prior: QueryFilters, priorTopics: Topic[]): { filters: QueryFilters; topics: Topic[] } {
  const sec = detectSectors(text);
  const range = detectRange(text);
  const statuses = detectStatuses(text);
  const owners = detectOwners(text);
  const products = detectProducts(text);
  return {
    topics: detectTopics(text).length ? detectTopics(text) : priorTopics,
    filters: {
      sectors: sec.sectors.length ? sec.sectors : prior.sectors,
      sectorLabel: sec.label ?? prior.sectorLabel,
      statuses: statuses.length ? statuses : prior.statuses,
      owners: owners.length ? owners : prior.owners,
      products: products.length ? products : prior.products,
      range: range ?? prior.range,
      rangeField: /\bpo date|purchase order\b/i.test(text)
        ? "po"
        : /\bcreated\b/i.test(text)
          ? "created"
          : /\bactual close|closed on\b/i.test(text)
            ? "close"
            : "tentative",
    },
  };
}

export function looksLikeLookup(text: string): string | null {
  const serial = text.match(/\bSDPLDEAL-\d+\b/i);
  if (serial) return serial[0];
  const owner = text.match(OWNER_RE);
  if (owner && /find|search|look/i.test(text)) return `OWNER_${owner[1].padStart(3, "0")}`;
  if (/^["'].+["']$/.test(text.trim())) return text.trim().replace(/^["']|["']$/g, "");
  return null;
}
