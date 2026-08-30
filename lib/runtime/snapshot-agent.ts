import snapshot from "../../data/monday-snapshot.json";
import { answerQuestion } from "../agent";
import { buildBriefing } from "../analytics/briefing";
import { qualityInsight } from "../analytics/insights";
import { classifyBoards } from "../monday/normalize";
import type { AgentResponse, ChatMessage, MondaySnapshot } from "../monday/types";

const snap = snapshot as MondaySnapshot;
const { deals, workOrders } = classifyBoards(snap.boards);
const SOURCE = "Monday.com-shaped snapshot (demo)";

export function snapshotStatus() {
  const quality = qualityInsight(deals, workOrders);
  return {
    mode: "snapshot" as const,
    liveConfigured: false,
    syncedAt: snap.syncedAt,
    deals: deals.length,
    workOrders: workOrders.length,
    qualityScore: quality.metrics[0]?.value ?? null,
    caveats: quality.caveats,
  };
}

export function snapshotBriefing() {
  return { ...buildBriefing(deals, workOrders), mode: "snapshot", syncedAt: snap.syncedAt };
}

export async function snapshotChat(messages: ChatMessage[]): Promise<AgentResponse & { mode: string; syncedAt: string }> {
  const answer = await answerQuestion(messages, deals, workOrders, SOURCE);
  return { ...answer, mode: "snapshot", syncedAt: snap.syncedAt };
}
