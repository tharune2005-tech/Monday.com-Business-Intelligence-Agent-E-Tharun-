/**
 * Create two Monday.com boards from the snapshot and print their IDs.
 *
 * Usage:
 *   MONDAY_API_TOKEN=... npm run push-monday
 *
 * Then set MONDAY_DEALS_BOARD_ID and MONDAY_WORK_ORDERS_BOARD_ID.
 *
 * Status/stage fields are pushed as text so messy source labels survive
 * (Monday status columns require a pre-declared label set).
 */
import { readFileSync } from "fs";
import path from "path";

type Snapshot = {
  boards: Array<{
    id: string;
    name: string;
    columns: { id: string; title: string; type: string }[];
    items: Array<{
      name: string;
      column_values: { id: string; text: string; value: string | null }[];
    }>;
  }>;
};

const token = process.env.MONDAY_API_TOKEN;
if (!token) {
  console.error("MONDAY_API_TOKEN is required");
  process.exit(1);
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: token!,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty Monday.com response");
  return json.data;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mondayType(t: string): "text" | "numbers" | "date" {
  if (t === "numbers") return "numbers";
  if (t === "date") return "date";
  return "text";
}

function columnPayload(
  mondayColId: string,
  type: string,
  text: string,
): Record<string, unknown> | null {
  if (!text) return null;
  if (type === "numbers") {
    const n = Number(text);
    if (!Number.isFinite(n)) return { [mondayColId]: text };
    return { [mondayColId]: String(n) };
  }
  if (type === "date") {
    const d = text.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { [mondayColId]: text };
    return { [mondayColId]: { date: d } };
  }
  return { [mondayColId]: text };
}

async function createBoard(name: string): Promise<string> {
  const data = await gql<{ create_board: { id: string } }>(
    `mutation ($name: String!) { create_board (board_name: $name, board_kind: public) { id } }`,
    { name },
  );
  return data.create_board.id;
}

async function createColumn(boardId: string, title: string, type: string): Promise<string> {
  const data = await gql<{ create_column: { id: string } }>(
    `mutation ($boardId: ID!, $title: String!, $type: ColumnType!) {
      create_column (board_id: $boardId, title: $title, column_type: $type) { id }
    }`,
    { boardId, title, type: mondayType(type) },
  );
  return data.create_column.id;
}

async function createItem(
  boardId: string,
  name: string,
  columnValues: Record<string, unknown>,
) {
  await gql(
    `mutation ($boardId: ID!, $name: String!, $values: JSON!) {
      create_item (board_id: $boardId, item_name: $name, column_values: $values) { id }
    }`,
    { boardId, name: name.slice(0, 120) || "(unnamed)", values: JSON.stringify(columnValues) },
  );
}

async function pushBoard(board: Snapshot["boards"][number]) {
  console.log(`Creating board: ${board.name}`);
  const boardId = await createBoard(`Skylark — ${board.name}`);
  const idMap = new Map<string, { mondayId: string; type: string }>();

  for (const col of board.columns) {
    const mondayId = await createColumn(boardId, col.title, col.type);
    idMap.set(col.id, { mondayId, type: col.type });
    await sleep(120);
  }

  let i = 0;
  for (const item of board.items) {
    const values: Record<string, unknown> = {};
    for (const cv of item.column_values) {
      const meta = idMap.get(cv.id);
      if (!meta) continue;
      const piece = columnPayload(meta.mondayId, meta.type, cv.text);
      if (piece) Object.assign(values, piece);
    }
    await createItem(boardId, item.name, values);
    i += 1;
    if (i % 10 === 0) {
      console.log(`  ${board.name}: ${i}/${board.items.length}`);
      await sleep(400);
    } else {
      await sleep(80);
    }
  }

  console.log(`Board "${board.name}" id=${boardId} items=${board.items.length}`);
  return boardId;
}

async function main() {
  const snap = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "monday-snapshot.json"), "utf8"),
  ) as Snapshot;
  const deals = snap.boards.find((b) => /deal/i.test(b.name));
  const wos = snap.boards.find((b) => /work/i.test(b.name));
  if (!deals || !wos) throw new Error("Snapshot missing expected boards");

  const dealsId = await pushBoard(deals);
  const woId = await pushBoard(wos);

  console.log("\nAdd these to .env.local:");
  console.log(`MONDAY_DEALS_BOARD_ID=${dealsId}`);
  console.log(`MONDAY_WORK_ORDERS_BOARD_ID=${woId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
