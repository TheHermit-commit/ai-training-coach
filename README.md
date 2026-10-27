# Tempo Coach

An adaptive AI training coach. You describe your sport and goal in plain words, and it builds a periodized plan, then adjusts the coming week from your daily check-ins, logged workouts, sleep and food. It also has a chat tab, a meal planner with a food review, and a pattern finder that looks for fatigue, plateaus and load spikes.

It runs entirely on free services: Google's Gemini API (free tier) for the AI and Vercel's free plan for hosting.

## Run it locally

```bash
npm install
cp .env.example .env.local      # then paste your key into .env.local
npm run dev                     # http://localhost:3000
```

Get a free key at https://aistudio.google.com/apikey (sign in with a Google account).

## Deploy (free, gives you a public link)

1. Push this folder to a GitHub repository. `.env.local` is git-ignored, so your key is not uploaded.
2. Go to vercel.com, import the repository, and before deploying add the environment variable `GEMINI_API_KEY`.
3. Deploy. Put the resulting URL on your resume.

## How it works

```
Browser (public/index.html, app.js)
   │  POST /api/coach   { mode, prompt | messages }
   ▼
Server route (app/api/coach/route.js)
   │  validates input, rate-limits, adds the secret API key
   ▼
Gemini API
```

- **Why a server route:** the API key must never be in code the browser can read. The browser only ever talks to `/api/coach`; the route holds the key.
- **JSON mode** (plan, weekly plan, check-in, patterns, meals, food review): the route asks Gemini for a JSON response (`responseMimeType: application/json`), parses it defensively, and returns `invalid_json` if it can't. The page then validates and normalises every field before saving (see `mkSessions`, `normEx` in `public/app.js`).
- **Chat mode:** Gemini streams Server-Sent Events; the route unwraps them into plain text so the reply appears as it is written.
- **Models:** a stronger flash model for the heavy work and a lite model for the cheap "list the exercises in this session" lookup. Override with `GEMINI_MODEL` / `GEMINI_MODEL_QUICK`.
- **Swapping providers:** only `app/api/coach/route.js` knows about Gemini. The page talks to `/api/coach` and never changes.

## Safety design (worth explaining in a viva)

- The coach's rules (`COACH_RULES` in `public/app.js`) say pain that is sharp, worsening, or causes limping is never trained through, and that it never diagnoses.
- A local regex (`RED_FLAGS`) checks every check-in for injury phrases **before** trusting the model. If it matches and the model said "no injury", the page overrides it and tells the athlete to see a physio. If the server is down, the warning still shows.
- Under-18 athletes get no calorie deficits and no maximal lifting.
- Plan changes are explained in one sentence that cites the athlete's own data, so the athlete can see why.

## Known limitations and trade-offs

- **Free-tier privacy.** Google's pricing page says free-tier content may be used to improve its products (the paid tier does not). Training notes, body measurements and food logs are health-related, so the site shows a notice, and you should not invite real athletes to rely on it. A paid tier or a different provider would remove this.
- **Free-tier limits.** Google sets requests-per-minute and requests-per-day limits per project and shows them in AI Studio. When they run out, users see a "busy or quota used up" message. Free limits and model names change over time; if the coach stops working, check `GEMINI_MODEL` against https://ai.google.dev/pricing.
- **Output quality.** The prompts were first written for Claude. Gemini follows them well in general, but test a plan, a check-in and a meal plan yourself and tighten the prompts in `public/app.js` if the JSON shape or advice drifts.
- **Data lives in each visitor's browser (localStorage).** Clearing site data deletes it, and it does not sync between devices. Data created in the original Claude artifact does not carry over. Next step: Supabase (free tier) for login and a database, replacing `putMany`/`del`/`initStore` in `public/app.js`.
- **Rate limiting is in memory** (`lib/rateLimit.js`), so on serverless hosting each instance counts separately. It stops casual abuse but is not a hard guarantee. Next step: move the counters to Upstash Redis.
- **No accounts**, so anyone with the link shares your free quota. Adding login would fix this properly.
- The front end is vanilla JavaScript in `public/`. Porting it to React components is a good follow-up project.
- The coach is not medical advice. Keep that wording visible.

## Project layout

```
app/api/coach/route.js   server route: validation, rate limit, Gemini call
lib/rateLimit.js         in-memory rate limiter
public/index.html        page shell
public/styles.css        styling
public/app.js            all UI logic, prompts, and localStorage persistence
next.config.mjs          serves public/index.html at "/"
```
