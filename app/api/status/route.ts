import { qualityInsight } from "@/lib/analytics/insights";
import { isLiveMondayConfigured, loadBoards } from "@/lib/monday/client";
import { classifyBoards } from "@/lib/monday/normalize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { boards, mode, syncedAt } = await loadBoards();
    const { deals, workOrders } = classifyBoards(boards);
    const quality = qualityInsight(deals, workOrders);
    return Response.json({
      mode,
      liveConfigured: isLiveMondayConfigured(),
      syncedAt,
      deals: deals.length,
      workOrders: workOrders.length,
      qualityScore: quality.metrics[0]?.value ?? null,
      caveats: quality.caveats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message, liveConfigured: isLiveMondayConfigured() }, { status: 500 });
  }
}
