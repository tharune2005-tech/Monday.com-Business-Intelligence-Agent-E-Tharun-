import type { AgentResponse, ChatMessage, Deal, QueryIntent, WorkOrder } from "../monday/types";
import { buildBriefing } from "../analytics/briefing";
import { sheetsToWorkbook } from "../analytics/excel";
import { todayISO } from "../analytics/format";
import {
  atRiskInsight,
  billingInsight,
  crossInsight,
  funnelInsight,
  opsInsight,
  pipelineInsight,
  qualityInsight,
  receivablesInsight,
  revenueInsight,
  searchRecords,
  sectorInsight,
  winRateInsight,
  type InsightBundle,
} from "../analytics/insights";
import { buildReportSheets, previewTable } from "../analytics/report";
import { looksLikeLookup, parseIntent } from "./parse";
import { polishWithLlm } from "./llm";

function offTopicPipeline(pipeline: AgentResponse): AgentResponse {
  return {
    ...pipeline,
    clarification: "I can't understand that question.",
    body: [
      "I can't understand that question, but here is a real pipeline report.",
      ...pipeline.body,
    ].slice(0, 8),
    caveats: [
      "The question didn't match a deal, work order, metric, or filter, so I defaulted to open pipeline.",
      ...pipeline.caveats,
    ].slice(0, 6),
  };
}

function mergeBundles(bundles: InsightBundle[], intent: QueryIntent): AgentResponse {
  const primary = bundles[0];
  const extraBody = bundles.slice(1).flatMap((b) => [b.headline, ...b.body]);
  const caveats = [...new Set(bundles.flatMap((b) => b.caveats))];
  const followUps = [...new Set(bundles.flatMap((b) => b.followUps))].slice(0, 4);
  const metrics = bundles.flatMap((b) => b.metrics).slice(0, 6);

  const assumptions: string[] = [];
  if (intent.filters.sectorLabel?.startsWith("energy")) {
    assumptions.push(
      "I treated “energy” as Renewables + Powerline (not Mining). Say if you meant something else.",
    );
  }
  if (intent.filters.range?.label.startsWith("Q")) {
    assumptions.push(
      `“This quarter” is calendar ${intent.filters.range.label}. Indian FY quarters are available if you ask for FY.`,
    );
  }

  return {
    headline: primary.headline,
    body: [...primary.body, ...extraBody.filter((x, i, a) => a.indexOf(x) === i)].slice(0, 8),
    metrics,
    caveats: [...assumptions, ...caveats].slice(0, 6),
    followUps,
    table: primary.table ?? bundles.find((b) => b.table)?.table,
  };
}

function runTools(intent: QueryIntent, deals: Deal[], workOrders: WorkOrder[]): InsightBundle[] {
  const lookup = looksLikeLookup(intent.raw);
  if (lookup) return [searchRecords(deals, workOrders, lookup)];

  const out: InsightBundle[] = [];
  const f = intent.filters;

  for (const topic of intent.topics) {
    switch (topic) {
      case "briefing":
        break;
      case "pipeline":
        out.push(pipelineInsight(deals, f, deals));
        break;
      case "revenue":
        out.push(revenueInsight(deals, workOrders, f));
        break;
      case "winrate":
        out.push(winRateInsight(deals, f));
        break;
      case "funnel":
        out.push(funnelInsight(deals, f));
        break;
      case "sector":
        out.push(sectorInsight(deals, workOrders, f));
        break;
      case "operations":
        out.push(opsInsight(workOrders, f));
        break;
      case "billing":
        out.push(billingInsight(workOrders, f));
        break;
      case "receivables":
        out.push(receivablesInsight(workOrders, f));
        break;
      case "atrisk":
        out.push(atRiskInsight(deals, workOrders, f));
        break;
      case "quality":
        out.push(qualityInsight(deals, workOrders));
        break;
      case "cross":
        out.push(crossInsight(deals, workOrders, f));
        break;
      case "search":
        out.push(searchRecords(deals, workOrders, intent.raw));
        break;
      case "report":
        break;
      default:
        break;
    }
  }

  if (intent.groupBy === "sector" && !intent.topics.includes("sector")) {
    out.push(sectorInsight(deals, workOrders, f));
  }
  if (intent.groupBy === "stage" && !intent.topics.includes("funnel")) {
    out.push(funnelInsight(deals, f));
  }
  if (intent.groupBy === "owner") {
    out.push(funnelInsight(deals, f));
  }

  if (!out.length) out.push(pipelineInsight(deals, f, deals));
  return out;
}

function reportFilename(intent: QueryIntent): string {
  const bits = ["perch"];
  if (intent.reportBoard === "work-orders") bits.push("work-orders");
  else if (intent.reportBoard === "both") bits.push("boards");
  else bits.push("deals");
  if (intent.filters.statuses.length) bits.push(intent.filters.statuses.join("-").toLowerCase());
  if (intent.filters.sectorLabel) bits.push(intent.filters.sectorLabel.split(" ")[0].toLowerCase());
  if (intent.reportFlags.length) bits.push(intent.reportFlags.join("-"));
  bits.push(todayISO());
  return bits.join("-");
}

function buildExcelResponse(intent: QueryIntent, deals: Deal[], workOrders: WorkOrder[]): AgentResponse {
  const sheets = buildReportSheets(
    deals,
    workOrders,
    intent.filters,
    intent.reportBoard,
    intent.reportColumns,
    intent.reportFlags,
  );
  const workbook = sheetsToWorkbook(sheets, reportFilename(intent));
  const preview = previewTable(sheets, 25);

  const contextIntent: QueryIntent = { ...intent, topics: intent.reportBoard === "work-orders" ? ["operations"] : ["pipeline"] };
  const context = runTools(contextIntent, deals, workOrders)[0];

  const colNote = intent.reportColumns.length
    ? intent.reportColumns.map((c) => c.label).join(", ")
    : "all fields for that board";

  return {
    headline: context?.headline || (workbook.rowCount === 0 ? "No rows matched that report." : `${workbook.rowCount} rows ready to export.`),
    body: [
      ...(context?.body ?? []),
      workbook.rowCount === 0
        ? "No row-level file was built because nothing matched those filters."
        : `A spreadsheet of ${colNote} is attached as a download link below (${workbook.rowCount} rows). It does not start downloading until you click it. Blanks in the file are blanks in the source (including Open deals with no masked value).`,
      preview.hidden > 0
        ? `The detail preview shows the first ${preview.rows.length} rows; the Excel file has all ${workbook.rowCount}.`
        : "",
    ].filter(Boolean),
    metrics: [
      ...(context?.metrics ?? []),
      { label: "Export rows", value: String(workbook.rowCount) },
    ].slice(0, 6),
    caveats: [
      ...(context?.caveats ?? []),
      intent.reportColumns.length === 0
        ? "No specific columns were named, so the file includes the full field set for that board."
        : `Excel columns: ${colNote}.`,
    ].slice(0, 6),
    followUps: context?.followUps?.length
      ? context.followUps
      : [
          "Export all Open deals with every column",
          "Excel of overdue work orders",
          "Give me Deal Name, Owner code, Client code for Won deals",
        ],
    table: context?.table,
    detailTable: preview.rows.length
      ? { caption: "Requested columns (preview)", columns: preview.columns, rows: preview.rows }
      : undefined,
    workbook,
  };
}

export async function answerQuestion(
  messages: ChatMessage[],
  deals: Deal[],
  workOrders: WorkOrder[],
  sourceLabel: string,
): Promise<AgentResponse> {
  const intent = parseIntent(messages);

  if (intent.offTopic) {
    const fallback: QueryIntent = {
      ...intent,
      topics: ["pipeline"],
      wantsReport: false,
      wantsBriefing: false,
    };
    const bundles = runTools(fallback, deals, workOrders);
    const merged = mergeBundles(bundles, fallback);
    merged.followUps = merged.followUps.length
      ? merged.followUps
      : ["How is the open pipeline?", "Energy this quarter", "Prepare a leadership update"];
    return offTopicPipeline(merged);
  }

  if (intent.wantsReport) {
    return buildExcelResponse(intent, deals, workOrders);
  }

  if (intent.wantsBriefing) {
    const b = buildBriefing(deals, workOrders);
    const response: AgentResponse = {
      headline: b.title,
      body: [
        b.subtitle,
        ...b.talkingPoints,
        "Asks for the team:",
        ...b.asks.map((a, i) => `${i + 1}. ${a}`),
      ],
      metrics: b.metrics,
      caveats: b.caveats,
      followUps: [
        "Energy pipeline this quarter",
        "Unbilled completed work",
        "What is wrong with win rate?",
      ],
    };
    return polishWithLlm(messages, response, sourceLabel);
  }

  const bundles = runTools(intent, deals, workOrders);
  const merged = mergeBundles(bundles, intent);
  merged.followUps = merged.followUps.length
    ? merged.followUps
    : ["Prepare a leadership update", "Data quality caveats", "Energy this quarter"];
  return polishWithLlm(messages, merged, sourceLabel);
}
