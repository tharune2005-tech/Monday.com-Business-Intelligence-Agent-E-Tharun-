import { buildBriefing } from "@/lib/analytics/briefing";
import { loadBoards } from "@/lib/monday/client";
import { classifyBoards } from "@/lib/monday/normalize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { boards, mode, syncedAt } = await loadBoards();
    const { deals, workOrders } = classifyBoards(boards);
    const briefing = buildBriefing(deals, workOrders);
    return Response.json({ ...briefing, mode, syncedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
