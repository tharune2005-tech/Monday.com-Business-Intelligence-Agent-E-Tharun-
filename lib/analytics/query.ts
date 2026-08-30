import type { Deal, QueryFilters, WorkOrder } from "../monday/types";
import { inRange } from "./format";

export function dealDate(d: Deal, field: QueryFilters["rangeField"]): string | null {
  if (field === "close") return d.closeDate;
  if (field === "created") return d.createdDate;
  return d.tentativeClose;
}

export function filterDeals(deals: Deal[], f: QueryFilters): Deal[] {
  return deals.filter((d) => {
    if (f.sectors.length && (!d.sector || !f.sectors.includes(d.sector))) return false;
    if (f.statuses.length && (!d.status || !f.statuses.includes(d.status))) return false;
    if (f.owners.length && (!d.ownerCode || !f.owners.includes(d.ownerCode))) return false;
    if (f.products.length) {
      const p = (d.product || "").toLowerCase();
      if (!f.products.some((x) => p.includes(x.toLowerCase()))) return false;
    }
    if (f.range) {
      const dt = dealDate(d, f.rangeField === "po" || f.rangeField === "end" ? "tentative" : f.rangeField);
      if (!inRange(dt, f.range.start, f.range.end)) return false;
    }
    return true;
  });
}

export function filterWorkOrders(rows: WorkOrder[], f: QueryFilters): WorkOrder[] {
  return rows.filter((w) => {
    if (f.sectors.length && (!w.sector || !f.sectors.includes(w.sector))) return false;
    if (f.owners.length && (!w.ownerCode || !f.owners.includes(w.ownerCode))) return false;
    if (f.range) {
      const dt =
        f.rangeField === "end"
          ? w.probableEnd
          : f.rangeField === "po"
            ? w.poDate
            : w.probableEnd;
      if (!inRange(dt, f.range.start, f.range.end)) return false;
    }
    return true;
  });
}

export function sum(rows: { value: number | null }[] | number[]): number {
  if (rows.length === 0) return 0;
  if (typeof rows[0] === "number") {
    return (rows as number[]).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  }
  return (rows as { value: number | null }[]).reduce((a, r) => a + (r.value ?? 0), 0);
}

export function sumField<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return rows.reduce((a, r) => a + (pick(r) ?? 0), 0);
}

export function countBy<T>(rows: T[], pick: (r: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r) || "Unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function sumBy<T>(rows: T[], pickKey: (r: T) => string | null, pickVal: (r: T) => number | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pickKey(r) || "Unknown";
    m.set(k, (m.get(k) ?? 0) + (pickVal(r) ?? 0));
  }
  return m;
}

export function topN(map: Map<string, number>, n = 8): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
