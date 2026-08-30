import { classifyBoards } from "@/lib/monday/normalize";
import { loadBoards } from "@/lib/monday/client";
import { answerQuestion } from "@/lib/agent";
import type { ChatMessage } from "@/lib/monday/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages = (body.messages ?? []).filter(
      (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
    if (!messages.length) {
      return Response.json({ error: "Send at least one message." }, { status: 400 });
    }

    const { boards, mode, syncedAt } = await loadBoards();
    const { deals, workOrders } = classifyBoards(boards);
    const sourceLabel =
      mode === "live" ? "Monday.com live boards" : "Monday.com-shaped snapshot (demo)";
    const answer = await answerQuestion(messages, deals, workOrders, sourceLabel);
    return Response.json({
      ...answer,
      mode,
      syncedAt,
      counts: { deals: deals.length, workOrders: workOrders.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      {
        headline: "I could not reach the boards just now.",
        body: [
          "The analytics layer failed before it could answer. This is an integration/data issue, not a missing number.",
          message,
        ],
        metrics: [],
        caveats: ["Retry in a moment. If this persists, check Monday.com credentials or the snapshot file."],
        followUps: ["What is the data quality like?", "Prepare a leadership update"],
      },
      { status: 200 },
    );
  }
}
