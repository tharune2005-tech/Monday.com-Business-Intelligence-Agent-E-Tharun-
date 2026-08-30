const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}${INR.format(abs)}`;
}

export function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function inRange(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false;
  return iso >= start && iso <= end;
}

export function quarterOf(iso: string): { start: string; end: string; label: string; q: number; year: number } {
  const [y, m] = iso.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const startM = (q - 1) * 3 + 1;
  const endM = startM + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(y, endM, 0).getDate();
  return {
    q,
    year: y,
    start: `${y}-${pad(startM)}-01`,
    end: `${y}-${pad(endM)}-${lastDay}`,
    label: `Q${q} ${y}`,
  };
}

export function fiscalQuarterOf(iso: string): { start: string; end: string; label: string } {
  // Indian FY: Apr–Mar. FY26 starts 2025-04-01.
  const [y, m] = iso.split("-").map(Number);
  const fyStartYear = m >= 4 ? y : y - 1;
  const fy = fyStartYear + 1; // FY26 = year ending 2026
  const monthIndex = m >= 4 ? m - 4 : m + 8;
  const q = Math.floor(monthIndex / 3) + 1;
  const startMonth = 4 + (q - 1) * 3;
  const startY = startMonth > 12 ? fyStartYear + 1 : fyStartYear;
  const sm = startMonth > 12 ? startMonth - 12 : startMonth;
  const endMonth = sm + 2;
  const endY = sm + 2 > 12 ? startY + 1 : startY;
  const em = sm + 2 > 12 ? sm + 2 - 12 : sm + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(endY, em, 0).getDate();
  return {
    start: `${startY}-${pad(sm)}-01`,
    end: `${endY}-${pad(em)}-${lastDay}`,
    label: `FY${String(fy).slice(2)} Q${q}`,
  };
}

export const PROB_WEIGHT: Record<"High" | "Medium" | "Low", number> = {
  High: 0.7,
  Medium: 0.4,
  Low: 0.15,
};

export function weightedValue(value: number | null, probability: "High" | "Medium" | "Low" | null): number | null {
  if (value === null || !probability) return null;
  return value * PROB_WEIGHT[probability];
}

export function share(part: number, whole: number): number {
  if (!whole) return 0;
  return part / whole;
}
