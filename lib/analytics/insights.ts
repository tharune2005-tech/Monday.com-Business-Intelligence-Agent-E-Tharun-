import type { Deal, Metric, QueryFilters, WorkOrder } from "../monday/types";
import { inr, pct, todayISO, weightedValue } from "./format";
import { countBy, filterDeals, filterWorkOrders, sumBy, sumField, topN } from "./query";

export type InsightBundle = {
  headline: string;
  body: string[];
  metrics: Metric[];
  caveats: string[];
  table?: { columns: string[]; rows: string[][] };
  followUps: string[];
};

function missingShare(rows: { issues: string[] }[], issue: string): number {
  if (!rows.length) return 0;
  return rows.filter((r) => r.issues.includes(issue)).length / rows.length;
}

export function pipelineInsight(deals: Deal[], filters: QueryFilters, unscoped: Deal[]): InsightBundle {
  const openAll = unscoped.filter((d) => d.status === "Open");
  const scoped = filterDeals(deals, { ...filters, statuses: filters.statuses.length ? filters.statuses : ["Open"] });
  const open = scoped.filter((d) => d.status === "Open" || filters.statuses.includes(d.status || ""));
  const withValue = open.filter((d) => d.value !== null);
  const unweighted = sumField(open, (d) => d.value);
  const weighted = sumField(open, (d) => weightedValue(d.value, d.probability));
  const missingVal = open.filter((d) => d.value === null).length;
  const missingProb = open.filter((d) => d.probability === null).length;
  const slipped = open.filter((d) => d.tentativeClose && d.tentativeClose < todayISO()).length;

  const where = filters.sectorLabel || "all sectors";
  const when = filters.range?.label;

  let headline: string;
  if (!open.length && filters.range) {
    const withoutTime = filterDeals(openAll, { ...filters, range: null, statuses: ["Open"] });
    headline = `No open ${where} deals are dated to close ${when}.`;
    const body = [
      `That is not the same as having no ${where} pipeline. ${withoutTime.length} open deal${withoutTime.length === 1 ? "" : "s"} (${inr(sumField(withoutTime, (d) => d.value))}) still sit in the book — their tentative close dates fall outside ${when}, and many of those dates are already in the past.`,
      `Read this as a hygiene issue as much as a demand issue: either the quarter is genuinely thin, or close dates have not been refreshed.`,
    ];
    const byMonth = new Map<string, number>();
    for (const d of withoutTime) {
      const key = d.tentativeClose ? d.tentativeClose.slice(0, 7) : "No date";
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    return {
      headline,
      body,
      metrics: [
        { label: `Open · ${where}`, value: String(withoutTime.length), hint: "ignoring the date filter" },
        { label: "Unweighted value", value: inr(sumField(withoutTime, (d) => d.value)) },
        { label: `Dated ${when}`, value: "0" },
      ],
      caveats: [
        `${Math.round(missingShare(withoutTime, "missing_value") * 100)}% of these open deals have no masked value.`,
        "Tentative close date is used as the forecast date because actual close is blank on most open rows.",
      ],
      table: {
        columns: ["Tentative month", "Open deals"],
        rows: topN(byMonth, 10).map(([k, v]) => [k, String(v)]),
      },
      followUps: [
        `Show slipped ${where} deals that are still marked Open`,
        `Break ${where} open pipeline by stage`,
        "How does this compare to mining?",
      ],
    };
  }

  headline = when
    ? `Open ${where} pipeline dated ${when}: ${inr(unweighted)} across ${open.length} deals.`
    : `Open ${where} pipeline: ${inr(unweighted)} across ${open.length} deals.`;

  const stageRows = topN(sumBy(open, (d) => d.stage, (d) => d.value ?? 0), 6);
  const body = [
    `${withValue.length} of ${open.length} rows carry a masked value. Weighted pipeline (High 70% / Medium 40% / Low 15%, blanks excluded) is ${inr(weighted)}.`,
    slipped
      ? `${slipped} of these open deals have a tentative close date already in the past — they are still sitting in Open rather than Won, Dead, or a refreshed date.`
      : `None of the dated open deals are past their tentative close yet.`,
  ];

  return {
    headline,
    body,
    metrics: [
      { label: "Open deals", value: String(open.length) },
      { label: "Unweighted", value: inr(unweighted), hint: `${missingVal} missing value` },
      { label: "Weighted", value: inr(weighted), hint: `${missingProb} missing probability` },
      { label: "Slipped dates", value: String(slipped) },
    ],
    caveats: [
      "Values are masked in the source board — treat them as directional, not audit-grade.",
      `${Math.round(missingShare(open, "missing_probability") * 100)}% of the open set has no closure probability, so weighted pipeline understates coverage.`,
    ],
    table: stageRows.length
      ? {
          columns: ["Stage", "Open value"],
          rows: stageRows.map(([k, v]) => [k, inr(v)]),
        }
      : undefined,
    followUps: [
      "Which of these are High probability?",
      "Break this down by owner",
      "What does the work-order book look like for the same slice?",
    ],
  };
}

export function revenueInsight(deals: Deal[], workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const d = filterDeals(deals, { ...filters, statuses: [] });
  const w = filterWorkOrders(workOrders, filters);
  const won = d.filter((x) => x.status === "Won");
  const wonValue = sumField(won, (x) => x.value);
  const contracted = sumField(w, (x) => x.amountExclGst);
  const billed = sumField(w, (x) => x.billedExclGst);
  const collected = sumField(w, (x) => x.collectedInclGst);
  const toBill = sumField(w, (x) => (x.toBillExclGst && x.toBillExclGst > 0 ? x.toBillExclGst : 0));
  const recv = sumField(w, (x) => (x.receivable && x.receivable > 0 ? x.receivable : 0));
  const where = filters.sectorLabel || "the full book";

  return {
    headline: `Revenue for ${where} depends on which layer you mean — booked, contracted, billed, or collected.`,
    body: [
      `Won deals (Deal Status = Won) sum to ${inr(wonValue)} across ${won.length} rows, but ${won.filter((x) => x.value === null).length} of those won rows have no masked value, and several still sit in early stages such as Lead Generated. Treat booked revenue as noisy.`,
      `Work orders are the cleaner operational picture: ${inr(contracted)} contracted excl. GST, ${inr(billed)} billed, ${inr(toBill)} still to bill, ${inr(recv)} receivable, ${inr(collected)} collected incl. GST.`,
    ],
    metrics: [
      { label: "Won (masked)", value: inr(wonValue), hint: `${won.length} rows` },
      { label: "WO contracted", value: inr(contracted) },
      { label: "Billed excl GST", value: inr(billed) },
      { label: "To bill", value: inr(toBill) },
      { label: "Receivable", value: inr(recv) },
    ],
    caveats: [
      "Deal Status 'Won' is not equivalent to cash or even a work order — it collides with early funnel stages in this board.",
      "Collected is stored incl. GST; contracted and billed figures above are excl. GST where possible.",
    ],
    followUps: [
      "Show unbilled work orders",
      "Priority AR accounts",
      `Won vs dead mix for ${where}`,
    ],
  };
}

export function winRateInsight(deals: Deal[], filters: QueryFilters): InsightBundle {
  const d = filterDeals(deals, { ...filters, statuses: [] });
  const won = d.filter((x) => x.status === "Won").length;
  const dead = d.filter((x) => x.status === "Dead").length;
  const open = d.filter((x) => x.status === "Open").length;
  const hold = d.filter((x) => x.status === "On Hold").length;
  const decided = won + dead;
  const where = filters.sectorLabel;
  return {
    headline: `Win rate on decided${where ? ` ${where}` : ""} deals is ${pct(won, decided)} (${won} won / ${dead} dead).`,
    body: [
      `${open} still Open and ${hold} On Hold are excluded from the rate so we are not pretending live pipeline is a win.`,
      `Value-weighted, won deals are ${inr(sumField(d.filter((x) => x.status === "Won"), (x) => x.value))} vs ${inr(sumField(d.filter((x) => x.status === "Dead"), (x) => x.value))} dead — dead includes large outliers, so do not read rupee mix as sales skill.`,
    ],
    metrics: [
      { label: "Win rate", value: pct(won, decided), hint: "decided deals only" },
      { label: "Won", value: String(won) },
      { label: "Dead", value: String(dead) },
      { label: "Still open", value: String(open) },
    ],
    caveats: [
      "Junk header rows were stripped; remaining labels are still inconsistent (Won + Lead Generated on the same row exists).",
    ],
    table: {
      columns: ["Status", "Deals", "Masked value"],
      rows: ["Won", "Dead", "Open", "On Hold"].map((s) => [
        s,
        String(d.filter((x) => x.status === s).length),
        inr(sumField(d.filter((x) => x.status === s), (x) => x.value)),
      ]),
    },
    followUps: [`Win rate by sector`, `Why are Won deals still in early stages?`],
  };
}

export function funnelInsight(deals: Deal[], filters: QueryFilters): InsightBundle {
  const d = filterDeals(deals, filters);
  const byStage = topN(countBy(d, (x) => x.stage), 16);
  const byValue = sumBy(d, (x) => x.stage, (x) => x.value ?? 0);
  return {
    headline: `Stage mix${filters.sectorLabel ? ` · ${filters.sectorLabel}` : ""}: ${d.length} deals.`,
    body: [
      "Stages are letter-prefixed on the board (A–O plus Project Completed). Late stages (G–K, H, Project Completed) overlap with Deal Status = Won, but not cleanly.",
    ],
    metrics: [
      { label: "Deals in view", value: String(d.length) },
      { label: "Distinct stages", value: String(byStage.length) },
    ],
    caveats: ["Two copied header rows were removed from the deals board before this count."],
    table: {
      columns: ["Stage", "Deals", "Masked value"],
      rows: byStage.map(([k, n]) => [k, String(n), inr(byValue.get(k) ?? 0)]),
    },
    followUps: ["Show only Open deals by stage", "Late-stage deals missing a work order"],
  };
}

export function sectorInsight(deals: Deal[], workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const d = filterDeals(deals, { ...filters, sectors: [] });
  const w = filterWorkOrders(workOrders, { ...filters, sectors: [] });
  const open = d.filter((x) => x.status === "Open");
  const dealVal = topN(sumBy(open, (x) => x.sector, (x) => x.value ?? 0), 10);
  const woVal = sumBy(w, (x) => x.sector, (x) => x.amountExclGst ?? 0);
  const woN = countBy(w, (x) => x.sector);
  return {
    headline: "Sector mix is concentrated in Mining and Renewables on both boards.",
    body: [
      "The deals board also has DSP, Tender, Aviation, Manufacturing, and Security and Surveillance — sparse rows, easy to miss in a founder snapshot.",
      filters.sectorLabel
        ? `${filters.sectorLabel} is highlighted in your question; the table still shows every sector so concentration is visible.`
        : "Energy in everyday speech maps to Renewables + Powerline here — not Mining.",
    ],
    metrics: dealVal.slice(0, 3).map(([k, v]) => ({
      label: `Open · ${k}`,
      value: inr(v),
    })),
    caveats: [
      `${d.filter((x) => !x.sector).length} deals have no sector.`,
      "Work-order sectors are a subset of deal sectors; DSP/Tender barely appear in execution.",
    ],
    table: {
      columns: ["Sector", "Open deal value", "WO count", "WO contracted"],
      rows: dealVal.map(([k, v]) => [k, inr(v), String(woN.get(k) ?? 0), inr(woVal.get(k) ?? 0)]),
    },
    followUps: [
      "How's energy looking this quarter?",
      "Mining work orders that are still unbilled",
    ],
  };
}

export function opsInsight(workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const w = filterWorkOrders(workOrders, filters);
  const byExec = topN(countBy(w, (x) => x.executionStatus), 10);
  const stuck = w.filter((x) =>
    /pause|struck|stuck|pending/i.test(`${x.executionStatus} ${x.invoiceStatus} ${x.billingStatus}`),
  );
  const overdue = w.filter(
    (x) => x.probableEnd && x.probableEnd < todayISO() && x.executionStatus !== "Completed",
  );
  const where = filters.sectorLabel || "all sectors";
  return {
    headline: `${w.length} work orders in ${where}: ${w.filter((x) => x.executionStatus === "Completed").length} completed, ${stuck.length} stuck/paused, ${overdue.length} past probable end and not completed.`,
    body: [
      `${w.filter((x) => x.executionStatus === "Ongoing").length} ongoing, ${w.filter((x) => x.executionStatus === "Not Started").length} not started. Recurring vs one-time: the board is mostly one-time projects.`,
    ],
    metrics: [
      { label: "Work orders", value: String(w.length) },
      { label: "Stuck / paused", value: String(stuck.length) },
      { label: "Overdue vs plan", value: String(overdue.length) },
      { label: "Contracted", value: inr(sumField(w, (x) => x.amountExclGst)) },
    ],
    caveats: ["Probable end dates are plan dates, not customer SLAs."],
    table: overdue.length
      ? {
          columns: ["Work order", "Sector", "Probable end", "Execution"],
          rows: overdue
            .slice(0, 12)
            .map((x) => [x.name, x.sector || "—", x.probableEnd || "—", x.executionStatus || "—"]),
        }
      : {
          columns: ["Execution status", "Count"],
          rows: byExec.map(([k, n]) => [k, String(n)]),
        },
    followUps: ["List the stuck work orders", "Unbilled amount on ongoing jobs"],
  };
}

export function billingInsight(workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const w = filterWorkOrders(workOrders, filters);
  const unbilled = w.filter(
    (x) =>
      /not billed/i.test(x.invoiceStatus || "") ||
      (x.toBillExclGst !== null && x.toBillExclGst > 1000),
  );
  const partial = w.filter((x) => /partial/i.test(x.invoiceStatus || ""));
  const overbilled = w.filter((x) => x.issues.includes("overbilled"));
  const toBill = sumField(w, (x) => (x.toBillExclGst && x.toBillExclGst > 0 ? x.toBillExclGst : 0));
  const billed = sumField(w, (x) => x.billedExclGst);
  const contracted = sumField(w, (x) => x.amountExclGst);
  return {
    headline: `${inr(toBill)} still to bill excl. GST across ${unbilled.length} work orders with a remaining billable balance.`,
    body: [
      `Contracted ${inr(contracted)} vs billed ${inr(billed)} (${pct(billed, contracted)} billed). ${partial.length} marked partially billed. ${overbilled.length} rows have a negative 'amount to be billed' — likely over-billing or a sign error, not cash.`,
      `Invoice status is blank on ${w.filter((x) => !x.invoiceStatus).length} rows; billing status is blank on most of the board. Do not treat blanks as Fully Billed.`,
    ],
    metrics: [
      { label: "To bill", value: inr(toBill) },
      { label: "Billed", value: inr(billed) },
      { label: "Bill coverage", value: pct(billed, contracted) },
      { label: "Overbilled rows", value: String(overbilled.length) },
    ],
    caveats: ["'BIlled' (typo) and 'Fully Billed' both appear — they were not merged into one status."],
    table: {
      columns: ["Invoice status", "Count"],
      rows: topN(countBy(w, (x) => x.invoiceStatus), 8).map(([k, n]) => [k, String(n)]),
    },
    followUps: ["Which unbilled jobs are already completed?", "Receivables and priority AR"],
  };
}

export function receivablesInsight(workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const w = filterWorkOrders(workOrders, filters);
  const recvRows = w.filter((x) => (x.receivable ?? 0) > 0);
  const priority = w.filter((x) => x.arPriority);
  const recv = sumField(recvRows, (x) => x.receivable);
  const collected = sumField(w, (x) => x.collectedInclGst);
  const top = [...recvRows].sort((a, b) => (b.receivable ?? 0) - (a.receivable ?? 0)).slice(0, 8);
  return {
    headline: `${inr(recv)} receivable across ${recvRows.length} work orders. ${priority.length} flagged as AR priority.`,
    body: [
      `Collected-to-date (incl. GST, where filled) is ${inr(collected)}. Collection status and collection date columns are effectively empty on this board — ageing buckets cannot be computed honestly.`,
    ],
    metrics: [
      { label: "Receivable", value: inr(recv) },
      { label: "AR priority rows", value: String(priority.length) },
      { label: "Collected incl GST", value: inr(collected) },
    ],
    caveats: [
      `${w.filter((x) => x.issues.includes("negative_receivable")).length} rows have negative receivable.`,
      "Collection status / date are unused (100% blank in the sample).",
    ],
    table: {
      columns: ["Work order", "Sector", "Receivable", "Priority"],
      rows: top.map((x) => [x.name, x.sector || "—", inr(x.receivable), x.arPriority ? "Yes" : ""]),
    },
    followUps: ["Stuck billing plus open AR", "Completed but still receivable"],
  };
}

export function atRiskInsight(deals: Deal[], workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const open = filterDeals(deals, { ...filters, statuses: ["Open"] });
  const slipped = open.filter((d) => d.tentativeClose && d.tentativeClose < todayISO());
  const w = filterWorkOrders(workOrders, filters);
  const stuck = w.filter((x) =>
    /pause|struck|stuck|pending/i.test(`${x.executionStatus} ${x.invoiceStatus} ${x.billingStatus}`),
  );
  const overdue = w.filter(
    (x) => x.probableEnd && x.probableEnd < todayISO() && x.executionStatus !== "Completed",
  );
  const noValueOpen = open.filter((d) => d.value === null);
  return {
    headline: `${slipped.length} open deals are past tentative close, ${stuck.length} work orders look stuck, ${overdue.length} are past probable end and not completed.`,
    body: [
      `${noValueOpen.length} open deals have no value, so risk is understated in rupee terms. Large open outliers (Tender / Powerline) can dominate any 'at risk value' number — inspect names, do not just sum.`,
    ],
    metrics: [
      { label: "Slipped open deals", value: String(slipped.length) },
      { label: "Stuck WOs", value: String(stuck.length) },
      { label: "Overdue WOs", value: String(overdue.length) },
    ],
    caveats: ["'Pause / struck' is the source spelling."],
    table: {
      columns: ["Type", "Name", "Sector", "Signal"],
      rows: [
        ...slipped.slice(0, 5).map((d) => ["Deal", d.name, d.sector || "—", `Close ${d.tentativeClose}`]),
        ...stuck.slice(0, 4).map((x) => ["WO", x.name, x.sector || "—", x.executionStatus || "stuck"]),
        ...overdue.slice(0, 4).map((x) => ["WO", x.name, x.sector || "—", `End ${x.probableEnd}`]),
      ].slice(0, 10),
    },
    followUps: ["Open energy deals that have slipped", "Priority AR on stuck jobs"],
  };
}

export function qualityInsight(deals: Deal[], workOrders: WorkOrder[]): InsightBundle {
  const dMissVal = deals.filter((d) => d.issues.includes("missing_value")).length;
  const dMissProb = deals.filter((d) => d.issues.includes("missing_probability")).length;
  const dConflict = deals.filter((d) => d.issues.includes("status_stage_conflict")).length;
  const wMissInv = workOrders.filter((w) => w.issues.includes("missing_invoice_status")).length;
  const wNeg = workOrders.filter((w) => w.issues.includes("negative_receivable")).length;
  const score = Math.max(
    0,
    100 -
      Math.round(
        ((dMissVal / Math.max(deals.length, 1)) * 25 +
          (dMissProb / Math.max(deals.length, 1)) * 20 +
          (wMissInv / Math.max(workOrders.length, 1)) * 20 +
          (dConflict / Math.max(deals.length, 1)) * 15) *
          1,
      ),
  );
  return {
    headline: `Data fitness score ${score}/100 — usable for directional founder questions, not for audited reporting.`,
    body: [
      `Deals: ${dMissVal}/${deals.length} missing value, ${dMissProb} missing probability, ${dConflict} Won rows still in Lead Generated. Close Date (A) is blank on the vast majority of the funnel.`,
      `Work orders: ${wMissInv}/${workOrders.length} missing invoice status, ${wNeg} negative receivable, collection fields unused. Header rows were repeated inside the deals sheet and stripped.`,
    ],
    metrics: [
      { label: "Fitness", value: `${score}/100` },
      { label: "Deals", value: String(deals.length) },
      { label: "Work orders", value: String(workOrders.length) },
    ],
    caveats: [
      "Masked values and alias names mean this board cannot be joined to a customer CRM without a mapping table.",
    ],
    table: {
      columns: ["Issue", "Approx count"],
      rows: [
        ["Deal missing value", String(dMissVal)],
        ["Deal missing probability", String(dMissProb)],
        ["Won vs stage conflict", String(dConflict)],
        ["WO missing invoice status", String(wMissInv)],
        ["WO negative receivable", String(wNeg)],
      ],
    },
    followUps: ["What can we still trust in a leadership update?"],
  };
}

export function crossInsight(deals: Deal[], workOrders: WorkOrder[], filters: QueryFilters): InsightBundle {
  const d = filterDeals(deals, filters);
  const w = filterWorkOrders(workOrders, filters);
  const woNames = new Set(w.map((x) => x.name.toLowerCase()));
  const late = d.filter((x) =>
    ["G", "H", "I", "J", "K", "PC"].includes(x.stageCode || ""),
  );
  const lateMissingWo = late.filter((x) => !woNames.has(x.name.toLowerCase()));
  const woWithoutDeal = w.filter(
    (x) => !d.some((dd) => dd.name.toLowerCase() === x.name.toLowerCase()),
  );
  return {
    headline: `${late.length} deals are in late/won-ish stages; ${lateMissingWo.length} of those names do not appear on the work-order board.`,
    body: [
      `Join key is the masked deal name — it collides (Sakura, Timon, Alias_160…). ${woWithoutDeal.length} work orders have a name that is not in the current deal slice. Serial numbers (SDPLDEAL-xxx) exist only on work orders.`,
      "Use this as a coverage check, not a 1:1 reconciliation.",
    ],
    metrics: [
      { label: "Late-stage deals", value: String(late.length) },
      { label: "Late with no WO name match", value: String(lateMissingWo.length) },
      { label: "WOs unmatched in slice", value: String(woWithoutDeal.length) },
    ],
    caveats: ["Duplicate masked names make this join lossy by design of the sample."],
    table: {
      columns: ["Late deal without WO", "Stage", "Status", "Sector"],
      rows: lateMissingWo.slice(0, 8).map((x) => [x.name, x.stage || "—", x.status || "—", x.sector || "—"]),
    },
    followUps: ["Work orders completed with no matching Won deal"],
  };
}

export function searchRecords(
  deals: Deal[],
  workOrders: WorkOrder[],
  q: string,
): InsightBundle {
  const n = q.toLowerCase();
  const dhit = deals.filter(
    (d) =>
      d.name.toLowerCase().includes(n) ||
      (d.clientCode || "").toLowerCase().includes(n) ||
      (d.ownerCode || "").toLowerCase().includes(n),
  );
  const whit = workOrders.filter(
    (w) =>
      w.name.toLowerCase().includes(n) ||
      (w.serial || "").toLowerCase().includes(n) ||
      (w.customerCode || "").toLowerCase().includes(n),
  );
  return {
    headline: `Search “${q}”: ${dhit.length} deals, ${whit.length} work orders.`,
    body: dhit.length + whit.length ? ["Showing the first matches from both boards."] : ["No name/code match. Try a sector, owner code, or SDPLDEAL serial."],
    metrics: [
      { label: "Deals", value: String(dhit.length) },
      { label: "Work orders", value: String(whit.length) },
    ],
    caveats: [],
    table: {
      columns: ["Board", "Name", "Status / execution", "Value"],
      rows: [
        ...dhit.slice(0, 6).map((d) => ["Deal", d.name, d.status || d.stage || "—", inr(d.value)]),
        ...whit.slice(0, 6).map((w) => ["WO", w.name, w.executionStatus || "—", inr(w.amountExclGst)]),
      ],
    },
    followUps: [],
  };
}
