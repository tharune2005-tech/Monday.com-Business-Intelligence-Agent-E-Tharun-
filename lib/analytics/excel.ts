import * as XLSX from "xlsx";
import type { SheetSpec } from "./report";

export function sheetsToWorkbook(
  sheets: SheetSpec[],
  filenameBase: string,
): { filename: string; base64: string; mimeType: string; rowCount: number } {
  const wb = XLSX.utils.book_new();
  let rowCount = 0;
  for (const sheet of sheets) {
    const aoa = [sheet.columns, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const widths = sheet.columns.map((col, i) => {
      const longest = Math.max(
        col.length,
        ...sheet.rows.slice(0, 80).map((r) => String(r[i] ?? "").length),
      );
      return { wch: Math.min(42, Math.max(12, longest + 2)) };
    });
    ws["!cols"] = widths;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || "Sheet");
    rowCount += sheet.rows.length;
  }
  const safe = filenameBase.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  return {
    filename: `${safe || "perch-report"}.xlsx`,
    base64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    rowCount,
  };
}
