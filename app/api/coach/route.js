import { checkRateLimit } from "../../../lib/rateLimit";

export const runtime = "nodejs";
// Plan generation can take a while. If your Vercel plan caps function time lower, lower this.
export const maxDuration = 300;

// Google's Gemini API (free tier available through Google AI Studio).
// Model names change over time: check https://ai.google.dev/pricing and override with env vars.
const API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MODELS = {
  default: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  quick: process.env.GEMINI_MODEL_QUICK || "gemini-3.5-flash-lite",
};

const MAX_CHARS = 80_000; // total characters accepted per request
const MAX_MESSAGES = 14;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Pull a JSON object out of a model reply, tolerating ```json fences or a short preamble.
function extractJSON(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no json");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Gemini wants roles "user" and "model", and is happiest when they alternate.
function toContents(msgs) {
  const out = [];
  for (const m of msgs) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + m.content;
    else out.push({ role, parts: [{ text: m.content }] });
  }
  return out;
}

const textOf = (data) =>
  (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");

// Turn upstream failures into short codes the page knows how to show.
// The details go to the server log only, never to the browser, and the key is never logged.
async function upstreamError(res) {
  let detail = "";
  try { detail = (await res.text()).slice(0, 400); } catch {}
  console.error("Gemini API error", res.status, detail);
  const status = res.status;
  if (status === 429) return ["rate_limited", 429];
  if (status === 413) return ["prompt_too_large", 413];
  if (status === 401 || status === 403 || status === 404) return ["server_misconfigured", 500];
  if (status === 400 && /api key|API_KEY/i.test(detail)) return ["server_misconfigured", 500];
  if (status >= 500) return ["unavailable", 503];
  return ["unknown", 500];
}

function buildBody({ system, msgs, config }) {
  return {
    contents: toContents(msgs),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: config,
  };
}

function callGemini(model, method, body) {
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:${method}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280_000),
  });
}

export async function POST(req) {
  if (!process.env.GEMINI_API_KEY) return json({ error: "server_misconfigured" }, 500);

  // 1. Rate limit by caller IP.
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const rl = checkRateLimit(ip);
  if (!rl.ok) return json({ error: "rate_limited" }, 429);

  // 2. Validate the request. Never trust the browser.
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const { mode, prompt, system, messages, tier } = body || {};
  if (mode !== "json" && mode !== "chat") return json({ error: "bad_request" }, 400);

  let msgs;
  if (mode === "json") {
    if (typeof prompt !== "string" || !prompt.trim()) return json({ error: "bad_request" }, 400);
    msgs = [{ role: "user", content: prompt }];
  } else {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return json({ error: "bad_request" }, 400);
    msgs = messages
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift(); // the conversation must start with the user
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "bad_request" }, 400);
  }
  if (system !== undefined && typeof system !== "string") return json({ error: "bad_request" }, 400);

  const size = (system || "").length + msgs.reduce((n, m) => n + m.content.length, 0);
  if (size > MAX_CHARS) return json({ error: "prompt_too_large" }, 413);

  const model = tier === "quick" ? MODELS.quick : MODELS.default;

  // 3a. JSON mode: plan, weekly plan, check-in, patterns, meals, food review.
  if (mode === "json") {
    try {
      const res = await callGemini(
        model,
        "generateContent",
        buildBody({
          msgs,
          config: {
            // Ask Gemini for raw JSON. We still parse defensively below.
            responseMimeType: "application/json",
            maxOutputTokens: tier === "quick" ? 4000 : 32000,
            temperature: 0.7,
          },
        })
      );
      if (!res.ok) {
        const [code, status] = await upstreamError(res);
        return json({ error: code }, status);
      }
      const data = await res.json();
      const reason = data?.candidates?.[0]?.finishReason;
      if (reason === "MAX_TOKENS") return json({ error: "truncated" }, 502);
      const text = textOf(data);
      if (!text.trim()) return json({ error: "refused" }, 502); // blocked by safety filters, or empty
      try {
        return json({ data: extractJSON(text) });
      } catch {
        return json({ error: "invalid_json" }, 502);
      }
    } catch (err) {
      console.error("Gemini request failed", err?.name, err?.message);
      return json({ error: "unavailable" }, 503);
    }
  }

  // 3b. Chat mode: stream plain text back so the reply appears as it is written.
  let upstream;
  try {
    upstream = await callGemini(
      model,
      "streamGenerateContent?alt=sse",
      buildBody({ system, msgs, config: { maxOutputTokens: 2048, temperature: 0.7 } })
    );
  } catch (err) {
    console.error("Gemini request failed", err?.name, err?.message);
    return json({ error: "unavailable" }, 503);
  }
  if (!upstream.ok) {
    const [code, status] = await upstreamError(upstream);
    return json({ error: code }, status);
  }

  // Gemini streams Server-Sent Events: lines like `data: {...json...}`. Unwrap them into plain text.
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = upstream.body.getReader();
  const out = new ReadableStream({
    async start(controller) {
      let buf = "";
      const handle = (line) => {
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
          const t = textOf(JSON.parse(payload));
          if (t) controller.enqueue(enc.encode(t));
        } catch {}
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.search(/\r?\n/)) !== -1) {
            handle(buf.slice(0, i));
            buf = buf.slice(buf[i] === "\r" ? i + 2 : i + 1);
          }
        }
        if (buf) handle(buf);
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
  return new Response(out, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
