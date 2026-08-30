# Perch — founder intelligence on Monday.com

Repository: [tharune2005-tech/Monday.com-Business-Intelligence-Agent-E-Tharun-](https://github.com/tharune2005-tech/Monday.com-Business-Intelligence-Agent-E-Tharun-)

Perch is a conversational business-intelligence agent for Skylark Drones. It answers founder questions across two Monday.com boards — **Deal Funnel** and **Work Order Tracker** — without pretending the data is clean.

**Live demo** (public, no local setup): _deployed after this repo is connected to Vercel — URL added here once live._

## What it does

- Reads both boards through a Monday.com GraphQL client (live token) or a Monday-shaped board dump used only so the hosted demo is testable without your workspace.
- Normalises messy dates, sectors, statuses, number formats, header rows pasted into the data, negative receivables, and status/stage contradictions.
- Interprets founder phrasing (“energy this quarter”, “can I trust win rate”, “prepare a leadership update”).
- Returns **insights + caveats**, not a spreadsheet dump.
- Builds a **leadership update**: talking points, risks, and asks you can copy into a standup.

The assignment example — *“How's our pipeline looking for energy sector this quarter?”* — is a first-class path. “Energy” is interpreted as **Renewables + Powerline**. “This quarter” is the **calendar quarter of today**. If that slice is empty, Perch does not say “you have no energy business”; it shows the open energy book whose close dates sit elsewhere (often already slipped) and treats that as forecast hygiene.

## Architecture

```
Browser (Perch UI)
    │  POST /api/chat    GET /api/briefing    GET /api/status
    ▼
Next.js Route Handlers
    │
    ├─ Monday adapter  →  monday.com GraphQL  (if MONDAY_* env set)
    │                  ↘  data/monday-snapshot.json  (demo fallback)
    ├─ Normaliser      →  Deal[] / WorkOrder[]  + per-row issue tags
    ├─ Analytics tools →  pipeline, revenue layers, win rate, funnel,
    │                     sector mix, ops, billing, AR, at-risk, cross-board
    └─ Agent           →  parse intent → run tools → grounded narrative
                          optional LLM polish (cannot change numbers)
```

Runtime rule: **the agent never reads the Excel files**. A seed script can turn the workbooks into a Monday.com-shaped dump. Live mode replaces that dump with `boards { items_page { items { column_values } } }`.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 15 App Router | One deploy for UI + API; Vercel-friendly; no extra backend. |
| Language | TypeScript | The data is messy; types on `Deal` / `WorkOrder` keep analytics honest. |
| Monday.com | Official GraphQL API | MCP is optional in the brief; REST/GraphQL is enough and easier to host. |
| Analytics | Deterministic tools | Founders will check the rupees. Models must not invent GMV. |
| LLM | Optional OpenAI-compatible polish | Narrative only, draft numbers are locked. Works fully without a key. |
| UI | Custom (Figtree + Instrument Serif) | A briefing desk, not a generic chat theme. |

## Monday.com setup

1. Create a Monday.com account and a personal API token: avatar → **Developers** → **My Access Tokens**.
2. From this repo:

```bash
cp .env.example .env.local
# put the token in .env.local
npm install
npm run push-monday
```

3. The script prints `MONDAY_DEALS_BOARD_ID` and `MONDAY_WORK_ORDERS_BOARD_ID`. Add them to `.env.local` (and to the host’s environment for production).
4. Restart the app. The source badge switches from **Monday snapshot** to **Monday.com live**.

Manual alternative: import `data/source/*.xlsx` as two boards. Name them so “deal” / “work order” appears in the board title, keep column titles close to the spreadsheet, then set the two board IDs. The mapper matches **column titles** (and known aliases), not hardcoded column IDs, because the brief lets you choose column types.

Column types used by the importer: **text** (including status/stage — messy labels would not fit a fixed Monday status set), **numbers**, **date**.

## Local run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Rebuild the snapshot after changing the workbooks:

```bash
npm run seed
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONDAY_API_TOKEN` | for live mode | Personal API token |
| `MONDAY_DEALS_BOARD_ID` | for live mode | Deal Funnel board |
| `MONDAY_WORK_ORDERS_BOARD_ID` | for live mode | Work Order Tracker board |
| `OPENAI_API_KEY` | no | Optional prose polish |
| `OPENAI_BASE_URL` | no | Groq or any OpenAI-compatible host |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini` |

If Monday env vars are missing or the API fails, Perch falls back to the snapshot so the hosted link stays testable.

## Approach to messy data

- Drop repeated header rows inside the deals sheet (`Deal Status` literally stored as a value).
- Canonicalise sectors (`renewable` → Renewables) and a founder alias: **energy → Renewables + Powerline**.
- Parse dates from ISO, `dd/mm/yyyy`, JS parseable strings, and Excel serials.
- Parse money after stripping currency junk; keep negatives and tag them (`overbilled`, `negative_receivable`).
- Treat **Deal Status** as the primary lifecycle field; flag rows where Status = Won but Stage is still *A. Lead Generated*.
- Weighted pipeline uses High 70% / Medium 40% / Low 15% and **excludes** blanks from the weighted sum (unweighted is still shown).
- Rupee display uses Indian units (L / Cr).
- Cross-board join is **masked deal name**, with an explicit warning that names collide (`Sakura`, `Timon`, `Alias_160`…). Work-order serials (`SDPLDEAL-xxx`) have no counterpart on the deals board.

## Leadership updates (interpretation)

A 5-minute pack a founder can read aloud: headline metrics, talking points, risks that should be said out loud, and concrete asks for the team (refresh slipped close dates, stop using Won + Lead Generated on the same row, fill probability, use collection fields or delete them, put the WO serial on the deals board). Copy-as-markdown is built in. See `DECISION_LOG.md`.

## Assumptions

- Calendar quarter unless the user says FY / fiscal (Indian FY Apr–Mar, matching invoice numbers `SDPL/FY25-26/…`).
- Pipeline questions default to **Open** deals.
- Forecast date = **Tentative Close Date** (actual close is blank on most of the funnel).
- “Revenue” is ambiguous, so Perch shows booked / contracted / billed / collected together rather than guessing one definition.
- Values are **masked** — directional, not audit-grade.

## Trade-offs

- **Accuracy over theatrics.** Numbers come from typed analytics. An LLM, if configured, may only rewrite sentences.
- **Demo snapshot vs live Monday.** The brief forbids hardcoding CSV into the agent. The snapshot is a Monday `items` dump so the public URL works without the evaluator’s workspace. Pointing at live boards is three env vars.
- **Text columns for status** on import, so source labels are not coerced into a Monday label set and silently dropped.
- **No ageing of receivables.** Collection date/status are unused in the sample; inventing buckets would be dishonest.

## AI tools used

- **Cursor** (Grok 4.6) for scaffolding, data profiling, and implementation.
- **Optional runtime LLM** (OpenAI-compatible) for tone only.
- No LangChain / no agent framework — the tool list is small and explicit.

## Challenges

- Work-order headers sit on row 2 under a blank row; pandas/Excel “header=0” looks empty.
- Deal Status = Won includes rows that still look like leads; win rate needed a “decided deals only” definition plus a warning.
- Open pipeline dated “this quarter” (Q3 2026 if today is 30 Aug 2026) is essentially empty — the interesting answer is the slip, not a zero.
- Duplicate cartoon aliases make deal↔WO reconciliation lossy.
- One open Tender row is enormous relative to the rest of the book; sums without context would mislead.

## What I would improve

- Write-back to Monday (flag slipped dates, proposed status) — the brief is read-only.
- Persist conversation on a store; attach the briefing to a Monday update/doc.
- Owner names instead of `OWNER_00x` once a mapping exists.
- Proper AR ageing if collection dates are ever filled.
- Eval set of founder questions with snapshot hashes so analytics regressions are visible.
- Streaming tokens when an LLM key is present.

## Project layout

```
app/api/{chat,briefing,status}/  route handlers
components/PerchApp.tsx          conversational UI + briefing desk
lib/monday/                      GraphQL client + normaliser
lib/analytics/                   deterministic BI tools
lib/agent/                       intent parse, orchestration, optional LLM
scripts/seed-from-xlsx.ts        workbook → Monday-shaped dump
scripts/push-to-monday.ts        dump → live boards
data/source/                     original assignment workbooks
data/monday-snapshot.json        last dump (demo)
DECISION_LOG.md                  assumptions, trade-offs, leadership reading
```

## License

Assignment submission — not for reuse of the underlying Skylark data.
