# Monday.com Business Intelligence Agent

**Perch** — founder-level Q&A over Deal Funnel and Work Order Tracker.

| Deliverable | Location |
| --- | --- |
| **Hosted prototype** (no local setup) | [https://tharune2005-tech.github.io/Monday.com-Business-Intelligence-Agent-E-Tharun-/](https://tharune2005-tech.github.io/Monday.com-Business-Intelligence-Agent-E-Tharun-/) |
| **Decision log** (≤ 2 pages) | [`DECISION_LOG.md`](./DECISION_LOG.md) |
| **Source ZIP** | `Monday.com-Business-Intelligence-Agent.zip` (same folder as this README, or the GitHub download) |
| **GitHub** | [tharune2005-tech/Monday.com-Business-Intelligence-Agent-E-Tharun-](https://github.com/tharune2005-tech/Monday.com-Business-Intelligence-Agent-E-Tharun-) |

The live URL runs the same analytics **in the browser** against a Monday.com-shaped board dump, so evaluators can click once and ask questions without a Monday workspace or a Node server. Point the Next.js app at **live boards** with three env vars (below). The agent **never reads the Excel files at runtime**.

Try first: *“How's our pipeline looking for energy sector this quarter?”* then *“Prepare a leadership update.”*

## Architecture

```
Browser (Perch UI)
    │  POST /api/chat    GET /api/briefing    GET /api/status
    ▼
Next.js Route Handlers
    │
    ├─ Monday adapter  →  monday.com GraphQL  (if MONDAY_* env set)
    │                  ↘  data/monday-snapshot.json  (hosted-demo fallback)
    ├─ Normaliser      →  Deal[] / WorkOrder[]  + per-row issue tags
    ├─ Analytics tools →  pipeline, revenue layers, win rate, funnel,
    │                     sector mix, ops, billing, AR, at-risk, cross-board
    └─ Agent           →  parse intent → run tools → grounded narrative
                          optional LLM polish (cannot change numbers)
                          off-topic → “I can't understand” + open pipeline
```

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 15 App Router | One deploy for UI + API; Vercel-friendly. |
| Language | TypeScript | Messy dates/money; typed `Deal` / `WorkOrder` keep analytics honest. |
| Monday.com | Official GraphQL API | MCP is optional in the brief; GraphQL is what Monday documents for tokens. |
| Analytics | Deterministic tools | Founders will check the rupees. Models must not invent GMV. |
| LLM | Optional OpenAI-compatible polish | Narrative only. Works fully without a key. |
| UI | Custom briefing desk | Not a generic chatbot skin. |

## Monday.com configuration

Live mode is optional. Without these variables the hosted/local app uses `data/monday-snapshot.json`.

### 1. Token

Monday.com → avatar → **Developers** → **My Access Tokens** → create a personal API token.

### 2. Create boards from this repo

```bash
cp .env.example .env.local
# paste MONDAY_API_TOKEN into .env.local
npm install
npm run push-monday
```

The script prints:

```
MONDAY_DEALS_BOARD_ID=...
MONDAY_WORK_ORDERS_BOARD_ID=...
```

Add those to `.env.local`. For production, add the same three variables in the host (Vercel → Project → Settings → Environment Variables) and redeploy. The sidebar badge switches from **Monday snapshot** to **Monday.com live**.

### 3. Manual boards (no push script)

Import `data/source/*.xlsx` as two boards. Name them so “deal” / “work order” appears in the title. Keep column titles close to the spreadsheet. Set the two board IDs. The mapper matches **column titles** (and aliases), not hardcoded column IDs.

Importer column types: **text** (status/stage included — messy labels would not fit a fixed Monday status set), **numbers**, **date**.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONDAY_API_TOKEN` | live mode | Personal API token |
| `MONDAY_DEALS_BOARD_ID` | live mode | Deal Funnel board |
| `MONDAY_WORK_ORDERS_BOARD_ID` | live mode | Work Order Tracker board |
| `OPENAI_API_KEY` | no | Optional prose polish |
| `OPENAI_BASE_URL` | no | Groq or any OpenAI-compatible host |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini` |

If the live API fails, Perch falls back to the snapshot so the public link stays testable.

## Local setup (optional)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No Monday token needed for the snapshot path.

Rebuild the snapshot after editing the workbooks:

```bash
npm run seed
```

## How founder questions are answered

- “Energy” = **Renewables + Powerline**. “This quarter” = **calendar quarter of today**. If that slice is empty, Perch shows the still-open energy book (often slipped dates) instead of a misleading zero.
- Pipeline questions default to **Open** deals. Forecast date = **Tentative Close Date**.
- **Deal Status** is the lifecycle field; stage is for funnel mix. Won + *A. Lead Generated* is tagged, not silently averaged into win rate.
- “Revenue” is shown as four layers: booked / contracted / billed / collected.
- Values are **masked** — directional, not audit-grade. Display uses Lakh / Crore.
- Off-topic asks (e.g. “what is the color of blue”) get an explicit **I can't understand**, then the open-pipeline report.
- Asking for named columns / Excel builds an `.xlsx` download link; it does not auto-download.

## Leadership updates

Interpreted as a **5-minute oral pack**, not a PDF: talking points, risks to say out loud, and asks for the team. Copy-as-markdown is on the Leadership update tab. Full reading: `DECISION_LOG.md`.

## Approach to messy data

- Drop repeated header rows (`Deal Status` stored as a value).
- Canonicalise sectors (`renewable` → Renewables).
- Parse dates from ISO, `dd/mm/yyyy`, JS strings, and Excel serials.
- Parse money after stripping currency junk; keep negatives and tag them.
- Weighted pipeline: High 70% / Medium 40% / Low 15%; blanks excluded from the weighted sum.
- Cross-board join is **masked deal name**. Work-order serials (`SDPLDEAL-xxx`) have no counterpart on deals.

## Trade-offs, AI tools, challenges

See also `DECISION_LOG.md`.

- **Accuracy over theatrics.** Numbers come from typed analytics. An LLM, if configured, may only rewrite sentences.
- **Demo snapshot vs live Monday.** The snapshot is a Monday `items` dump so the public URL works without the evaluator’s workspace.
- **No AR ageing.** Collection date/status are unused; inventing 30/60/90 would be dishonest.

**AI tools:** Cursor (Grok 4.6) for scaffolding and implementation. Optional runtime LLM for tone only. No LangChain / no agent framework.

**Challenges:** WO headers on row 2; Won rows that still look like leads; “this quarter” energy pipeline essentially empty (the answer is the slip); duplicate cartoon aliases; one huge Tender row that would dominate a naive sum.

## What I would improve

- Shared Monday workspace for evaluators (no snapshot).
- Write-back: flag slipped dates on the item.
- Owner names instead of `OWNER_00x`.
- Eval set of founder questions with expected metric bands.

## Project layout

```
app/api/{chat,briefing,status}/  route handlers
components/PerchApp.tsx          conversational UI + briefing desk
lib/monday/                      GraphQL client + normaliser
lib/analytics/                   deterministic BI tools + Excel export
lib/agent/                       intent parse, orchestration, optional LLM
scripts/seed-from-xlsx.ts        workbook → Monday-shaped dump
scripts/push-to-monday.ts        dump → live boards
data/source/                     original assignment workbooks
data/monday-snapshot.json        demo dump (hosted path)
DECISION_LOG.md                  assumptions, trade-offs, leadership reading
```

## License

Assignment submission — not for reuse of the underlying Skylark data.
