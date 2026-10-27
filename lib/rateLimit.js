// Best-effort rate limiting, kept in memory.
//
// Limitation worth knowing (and being able to explain): on serverless hosts like Vercel,
// each function instance has its own memory, so these counters are not shared between
// instances. This stops casual abuse and runaway loops, but it is not a hard guarantee.
// For a hard limit, store the counters in Redis (e.g. Upstash) and keep the same interface.
// The real backstop is the provider quota: on the Gemini free tier, Google stops answering when the free limits run out, so there is no bill to worry about.

const PER_IP_LIMIT = Number(process.env.RATE_LIMIT_PER_IP || 20); // requests...
const PER_IP_WINDOW_MS = 10 * 60 * 1000; // ...per 10 minutes
const GLOBAL_DAILY_CAP = Number(process.env.RATE_LIMIT_DAILY || 400); // requests per day, all users

const hits = new Map(); // ip -> array of timestamps
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

export function checkRateLimit(ip) {
  const now = Date.now();

  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= GLOBAL_DAILY_CAP) return { ok: false, reason: "daily_cap" };

  const recent = (hits.get(ip) || []).filter((t) => now - t < PER_IP_WINDOW_MS);
  if (recent.length >= PER_IP_LIMIT) {
    hits.set(ip, recent);
    return { ok: false, reason: "rate_limited" };
  }
  recent.push(now);
  hits.set(ip, recent);
  dayCount += 1;

  // Keep the map from growing forever.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < PER_IP_WINDOW_MS)) hits.delete(k);
  }
  return { ok: true };
}
