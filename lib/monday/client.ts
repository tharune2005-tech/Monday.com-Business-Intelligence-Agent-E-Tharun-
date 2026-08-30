import { readFile } from "fs/promises";
import path from "path";
import type { MondayBoard, MondaySnapshot, DataSourceMode } from "./types";

const LIVE = Boolean(
  process.env.MONDAY_API_TOKEN &&
    process.env.MONDAY_DEALS_BOARD_ID &&
    process.env.MONDAY_WORK_ORDERS_BOARD_ID,
);

let cache: { at: number; boards: MondayBoard[]; mode: DataSourceMode; syncedAt: string } | null =
  null;
const TTL_MS = 45_000;

async function mondayGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is not set");

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(`Monday.com API error: ${msg}`);
  }
  if (!json.data) throw new Error("Monday.com API returned no data");
  return json.data;
}

const ITEMS_QUERY = `
  query ($ids: [ID!]!, $cursor: String) {
    boards(ids: $ids) {
      id
      name
      columns { id title type }
      items_page(limit: 100, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
            column { title }
          }
        }
      }
    }
  }
`;

type LiveResponse = {
  boards: Array<{
    id: string;
    name: string;
    columns: MondayBoard["columns"];
    items_page: { cursor: string | null; items: MondayBoard["items"] };
  }>;
};

async function fetchLiveBoard(boardId: string): Promise<MondayBoard> {
  let cursor: string | null = null;
  let board: MondayBoard | null = null;
  const items: MondayBoard["items"] = [];

  for (let page = 0; page < 50; page++) {
    const data: LiveResponse = await mondayGraphql<LiveResponse>(ITEMS_QUERY, {
      ids: [boardId],
      cursor,
    });
    const b = data.boards[0];
    if (!b) throw new Error(`Monday.com board ${boardId} not found`);
    if (!board) {
      board = { id: b.id, name: b.name, columns: b.columns, items: [] };
    }
    items.push(...(b.items_page.items ?? []));
    cursor = b.items_page.cursor;
    if (!cursor) break;
  }

  if (!board) throw new Error(`Monday.com board ${boardId} not found`);
  board.items = items;
  return board;
}

async function loadSnapshot(): Promise<{ boards: MondayBoard[]; syncedAt: string }> {
  const candidates = [
    path.join(process.cwd(), "data", "monday-snapshot.json"),
    path.join(process.cwd(), "monday-snapshot.json"),
  ];
  for (const file of candidates) {
    try {
      const raw = await readFile(file, "utf8");
      const snap = JSON.parse(raw) as MondaySnapshot;
      return { boards: snap.boards, syncedAt: snap.syncedAt };
    } catch {
      /* try next path or bundled import */
    }
  }
  const bundled = (await import("../../data/monday-snapshot.json")).default as MondaySnapshot;
  return { boards: bundled.boards, syncedAt: bundled.syncedAt };
}

export async function loadBoards(force = false): Promise<{
  boards: MondayBoard[];
  mode: DataSourceMode;
  syncedAt: string;
}> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return { boards: cache.boards, mode: cache.mode, syncedAt: cache.syncedAt };
  }

  if (LIVE) {
    try {
      const [deals, workOrders] = await Promise.all([
        fetchLiveBoard(process.env.MONDAY_DEALS_BOARD_ID!),
        fetchLiveBoard(process.env.MONDAY_WORK_ORDERS_BOARD_ID!),
      ]);
      const payload = {
        boards: [deals, workOrders],
        mode: "live" as const,
        syncedAt: new Date().toISOString(),
        at: Date.now(),
      };
      cache = payload;
      return payload;
    } catch (err) {
      console.error("[monday] live fetch failed, falling back to snapshot", err);
    }
  }

  const snap = await loadSnapshot();
  const payload = {
    boards: snap.boards,
    mode: "snapshot" as const,
    syncedAt: snap.syncedAt,
    at: Date.now(),
  };
  cache = payload;
  return payload;
}

export function isLiveMondayConfigured(): boolean {
  return LIVE;
}
