import type { AgentResponse, ChatMessage, Deal, QueryIntent, WorkOrder } from "../monday/types";
import { buildBriefing } from "../analytics/briefing";
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
import { looksLikeLookup, parseIntent } from "./parse";
import { polishWithLlm } from "./llm";

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

export async function answerQuestion(
  messages: ChatMessage[],
  deals: Deal[],
  workOrders: WorkOrder[],
  sourceLabel: string,
): Promise<AgentResponse> {
  const intent = parseIntent(messages);

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
