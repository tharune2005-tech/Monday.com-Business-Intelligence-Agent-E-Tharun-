import type { AgentResponse, ChatMessage } from "../monday/types";

export async function polishWithLlm(
  messages: ChatMessage[],
  draft: AgentResponse,
  sourceLabel: string,
): Promise<AgentResponse> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return draft;

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const question = messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";

  const system = `You are Perch, a founder BI analyst for Skylark Drones. You rewrite a grounded analytics draft into a crisp spoken-style answer.
Rules:
- Do NOT invent, round-away, or change any number, date, count, or percentage. Copy figures exactly from the draft.
- Keep the same caveats. You may tighten wording.
- Sound like a sharp chief of staff, not a chatbot. No fluff, no "great question".
- Source of data: ${sourceLabel}.
Return JSON with keys: headline (string), body (string array, 2-5 short paragraphs), followUps (string array, 3).`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: JSON.stringify({ question, draft }),
          },
        ],
      }),
    });
    if (!res.ok) return draft;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return draft;
    const parsed = JSON.parse(content) as {
      headline?: string;
      body?: string[];
      followUps?: string[];
    };
    return {
      ...draft,
      headline: parsed.headline || draft.headline,
      body: Array.isArray(parsed.body) && parsed.body.length ? parsed.body : draft.body,
      followUps:
        Array.isArray(parsed.followUps) && parsed.followUps.length
          ? parsed.followUps
          : draft.followUps,
    };
  } catch {
    return draft;
  }
}
