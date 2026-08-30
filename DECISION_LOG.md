# Decision log

Cap: two pages. Written as of 30 Aug 2026.

## Assumptions I made and proceeded with

1. **The evaluator must be able to click a URL.** The brief says query Monday.com dynamically and not hardcode CSV. I still shipped a Monday-shaped snapshot so the hosted demo works without a shared workspace. Live GraphQL is the same client, switched on with `MONDAY_API_TOKEN` + two board IDs. The agent never opens the xlsx at runtime.

2. **“Energy” = Renewables + Powerline**, not Mining. Mining is a Skylark vertical, not “energy” in founder speech. The answer states the mapping so it can be corrected in one follow-up.

3. **“This quarter” = calendar quarter** (on 30 Aug 2026 that is Q3: 1 Jul–30 Sep). Invoice numbers (`SDPL/FY25-26`) imply Indian FY (Apr–Mar). FY Q2 coincides with calendar Q3, so the default rarely fights the fiscal calendar in this season. Users can say “FY”.

4. **Deal Status beats Deal Stage** when they disagree. Status is the field a founder means by open/won/dead. Stage is used for funnel mix. Conflicts are tagged (`status_stage_conflict`) and called out in win-rate answers.

5. **Forecast date = Tentative Close Date.** Close Date (A) is blank on ~90%+ of deals. Using it would make every time-window look empty for the wrong reason.

6. **Probability weights:** High 0.70, Medium 0.40, Low 0.15. Blanks are excluded from weighted pipeline and counted in a caveat. I did not invent a default 50%.

7. **Masked rupees are directional.** Display in Lakh/Crore. Outliers stay in the sum but get an issue tag so a 30 Cr+ tender cannot hide inside a bland total.

8. **Join key = masked deal name.** It is the only shared identifier. Serials exist only on work orders. Duplicate aliases (`Sakura`, `Timon`) make reconciliation a coverage check, not a ledger.

9. **When a filtered slice is empty, zoom out.** “No energy deals closing this quarter” plus the still-open energy book and slipped dates is the honest founder answer. Returning “0” would be technically true and operationally wrong.

10. **Ambiguous “revenue” is answered as four layers** (won / WO contracted / billed / collected) instead of a clarifying question that delays the meeting.

## Trade-offs

| Choice | Rejected | Why |
| --- | --- | --- |
| Deterministic analytics + optional LLM polish | LLM tool-calling as source of numbers | Take-home data is messy; a model will hallucinate crores. |
| GraphQL API | Monday MCP as the hosted path | MCP is awkward on a public serverless URL; API is what Monday documents for tokens. |
| Text columns for status/stage on import | Native Monday status | Source labels are inconsistent (“BIlled”, “Pause / struck”). A fixed label set would drop rows. |
| Snapshot fallback | Live-only prototype | Live-only fails the “testable without local setup” deliverable unless we share a workspace. |
| In-memory 45s cache | Always hit Monday | Keep the chat snappy; boards are not tick-level. |
| No AR ageing | Invent 30/60/90 buckets | Collection date and collection status are unused. |

## Leadership updates — how I read the optional requirement

Not a PDF renderer and not “export CSV”. A **5-minute oral pack**: what to say, what not to over-claim, and what to ask the team to fix this week.

The pack always includes:

- Open pipeline (unweighted + weighted) and the slip of tentative closes.
- Win rate **on decided deals only**, with the Won/Lead-Generated contamination.
- Energy as a special vertical because that is the brief’s own example question.
- Billing remaining and receivable, with the GST incl/excl mismatch stated.
- Data fitness score so a founder knows how hard they can lean on the numbers.
- Asks: refresh dates, align status/stage, fill probability, use or delete collection columns, copy `SDPLDEAL` onto the deals board.

Copy-as-markdown exists so this can be pasted into Notion/email/Monday updates without another tool.

## What I would do with more time

- A shared Monday workspace pre-loaded for evaluators, no snapshot path.
- Write-back (read-only today): suggested “date slipped” status or an update on the item.
- Golden-question evals with expected metric bands.
- Owner directory so `OWNER_003` becomes a person.
- Streaming + voice-note length summaries for WhatsApp-style founder use.
- If collection dates appear, real AR ageing and a cash waterfall.

## Tech stack justification (short)

Next.js on Vercel is one URL, TLS, and cron-free serverless — appropriate for a 6-hour prototype. TypeScript keeps the normaliser from silently turning `"5360 HA"` into `NaN` and treating it as zero. Skipping an agent framework is deliberate: six tools and a parser are inspectable in review.
