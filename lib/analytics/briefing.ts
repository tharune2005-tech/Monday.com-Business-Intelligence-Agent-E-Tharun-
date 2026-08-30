import type { Deal, QueryFilters, Topic, WorkOrder } from "../monday/types";
import { inr, pct, todayISO } from "./format";
import { filterDeals, filterWorkOrders, sumField } from "./query";
import { atRiskInsight, billingInsight, pipelineInsight, qualityInsight, receivablesInsight } from "./insights";

export function buildBriefing(deals: Deal[], workOrders: WorkOrder[]) {
  const asOf = todayISO();
  const empty: QueryFilters = {
    sectors: [],
    sectorLabel: null,
    statuses: [],
    owners: [],
    products: [],
    range: null,
    rangeField: "tentative",
  };
  const pipe = pipelineInsight(deals, { ...empty, statuses: ["Open"] }, deals);
  const bill = billingInsight(workOrders, empty);
  const recv = receivablesInsight(workOrders, empty);
  const risk = atRiskInsight(deals, workOrders, empty);
  const quality = qualityInsight(deals, workOrders);

  const open = deals.filter((d) => d.status === "Open");
  const won = deals.filter((d) => d.status === "Won");
  const dead = deals.filter((d) => d.status === "Dead");
  const decided = won.length + dead.length;
  const energyOpen = open.filter((d) => d.sector === "Renewables" || d.sector === "Powerline");
  const completed = workOrders.filter((w) => w.executionStatus === "Completed").length;

  const talkingPoints = [
    `Open book is ${pipe.metrics.find((m) => m.label === "Unweighted")?.value ?? inr(sumField(open, (d) => d.value))} across ${open.length} deals — but close dates cluster in Q1 2026 and many have already slipped. Do not present this as in-quarter coverage.`,
    `Win rate on decided deals is ${pct(won.length, decided)}. Deal Status = Won is polluted (early stages, missing values). Prefer work-order contracted/billed for execution reviews.`,
    `Energy (Renewables + Powerline) still has ${energyOpen.length} open deals; almost none are dated to close this calendar quarter. That is a forecast-hygiene talking point, not proof that energy demand disappeared.`,
    `Operations: ${completed}/${workOrders.length} work orders completed. ${bill.headline} ${recv.headline}`,
    quality.headline,
  ];

  const risks = [
    ...risk.body,
    "Collection status and collection date are unused, so cash ageing cannot be claimed.",
    "Duplicate masked names block a clean deal↔work-order reconciliation.",
  ];

  const asks = [
    "Refresh tentative close dates on all Open deals older than 30 days past target.",
    "Make Deal Status and Deal Stage consistent (Won should not sit in Lead Generated).",
    "Fill closure probability on Open deals so weighted pipeline is usable in a board pack.",
    "Start using collection status/date, or drop those columns.",
    "Give work orders a stable deal id (the SDPLDEAL serial) on the deals board too.",
  ];

  return {
    asOf,
    title: "Leadership update — pipeline & operations",
    subtitle: "Prepared from Monday.com Deal Funnel and Work Order Tracker. Masked values; directional only.",
    talkingPoints,
    metrics: [
      ...pipe.metrics.slice(0, 3),
      { label: "Win rate (decided)", value: pct(won.length, decided) },
      ...bill.metrics.slice(0, 2),
      ...recv.metrics.slice(0, 1),
    ],
    risks,
    asks,
    caveats: [...pipe.caveats, ...quality.caveats].slice(0, 5),
    opsNote: risk.headline,
    qualityScore: quality.metrics[0]?.value ?? "—",
    woInView: filterWorkOrders(workOrders, empty).length,
    dealsInView: deals.length,
  };
}

export type LeadershipBriefing = ReturnType<typeof buildBriefing>;
