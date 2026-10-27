(() => {
"use strict";

/* ---------- utilities ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => new Date(s + "T12:00:00");
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = s => { const d = parse(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const num = (v, d = 0) => { const n = Number(v); return v !== "" && v != null && Number.isFinite(n) ? n : d; };
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const effort = r => !r ? "" : r <= 2 ? "very easy" : r <= 4 ? "easy" : r <= 6 ? "moderate" : r <= 8 ? "hard" : "very hard";
const cmToFtIn = cm => { const t = cm / 2.54; let ft = Math.floor(t / 12), inch = Math.round(t - ft * 12); if (inch === 12) { ft++; inch = 0; } return [ft, inch]; };

const TYPES = ["run", "swim", "bike", "sport", "skills", "strength", "power", "speed", "intervals", "long", "conditioning", "cross", "mobility", "test", "rest"];

/* Phrases that can signal injury; checked on this device before Claude answers. */
const RED_FLAGS = /(sharp|stabbing|shooting|searing) pain|swell|swollen|can'?t (bear|put|walk)|unable to (bear|walk)|limp|numb|tingl|pins and needles|popp?ed|gave way|giving way|chest (pain|tight)|dizz|faint|blacked out|short(ness)? of breath|palpitation|getting worse|worse every|night pain|wakes? me|bruis|locking|unstable/i;

/* ---------- sports and goal examples ---------- */
const SPORTS = ["Running", "Swimming", "Cycling", "Triathlon", "Strength training", "CrossFit / HIIT", "Football", "Cricket", "Basketball", "Badminton", "Tennis", "Hockey", "Rugby", "Volleyball", "Martial arts / boxing", "Climbing", "Rowing", "Yoga & mobility"];
const SPORT_LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"];
const EXAMPLES = {
  Running: ["Run my first half marathon", "Run more without getting shin splints"],
  Swimming: ["Swim 1 km front crawl without stopping"],
  Cycling: ["Keep up with the Sunday group ride"],
  Triathlon: ["Finish my first sprint triathlon"],
  "Strength training": ["Do my first pull-up", "Squat my bodyweight"],
  "CrossFit / HIIT": ["Get through workouts without gassing out"],
  Football: ["Last the full 90 minutes at the same intensity", "Get a quicker first step past defenders"],
  Cricket: ["Bowl faster without back pain", "Stay sharp through a full day in the field"],
  Basketball: ["Jump higher for rebounds", "Stop fading in the fourth quarter"],
  Badminton: ["Reach the shuttle faster in long rallies"],
  Tennis: ["Move better side to side", "Play three sets without fading"],
  Hockey: ["Repeat sprints all game without dropping off"],
  Rugby: ["Get stronger in the tackle"],
  Volleyball: ["Add height to my block jump"],
  "Martial arts / boxing": ["Last five rounds with power left"],
  Climbing: ["Climb one grade harder"],
  Rowing: ["Break 7:30 on the 2K erg"],
  "Yoga & mobility": ["Touch my toes and loosen tight hips"],
};
function goalExamples(sports) {
  const out = sports.flatMap(s => EXAMPLES[s] || []).slice(0, 5);
  return out.length ? out : ["Make the team this season", "Feel fitter for my sport"];
}

/* ---------- state ---------- */
const S = {
  tab: lsGet("tc.tab") || "today",
  docs: {}, demoDocs: null, demo: true,
  setup: 0, editing: false, preview: false,
  storeMode: "local", ready: false,
  busy: {}, errors: {}, chat: [],
  draft: { units: "Metric", sports: [], goals: {}, level: "Intermediate", daysPerWeek: 4, sessionMinutes: 60, dietType: "No restrictions", dietAim: "Fuel my training", ...(lsGet("tc.draft2") || {}) },
  sport: lsGet("tc.sport") || "All",
};
if (!S.draft.goals || typeof S.draft.goals !== "object") S.draft.goals = {};
if (!["today", "plan", "food", "progress", "coach"].includes(S.tab)) S.tab = "today";
const D = () => (S.demo ? S.demoDocs : S.docs);
const profile = () => D()?.profile || null;
const plan = () => D()?.plan || null;
const entries = kind => Object.values(D() || {}).filter(e => e && e.kind === kind).sort((a, b) => (a.date + (a.at || "")).localeCompare(b.date + (b.at || "")));
const sportsOf = () => profile()?.sports || [];
const multi = () => sportsOf().length > 1;
const curSport = () => (S.sport !== "All" && sportsOf().includes(S.sport) ? S.sport : "All");
/* A session serves a sport when it's tagged for it, or for all-round work ("All"). */
const serves = (s, sport = curSport()) => sport === "All" || !s.for?.length || s.for.includes("All") || s.for.includes(sport);
const normFor = (f, sports) => { const a = (Array.isArray(f) ? f : [f]).filter(x => x === "All" || sports.includes(x)); return a.length ? a : ["All"]; };
function goalsOf(p) {
  if (p?.goals) return p.goals;
  const t = [p?.goal, p?.goalType, p?.goalDetail].filter(Boolean).join(": ");
  return t && p?.sports?.length ? { [p.mainSport || p.sports[0]]: t } : {};
}
const goalText = p => Object.entries(goalsOf(p)).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
const sportGoal = sport => (plan()?.sportGoals || []).find(g => g.sport === sport) || null;
function goalTitle(p) {
  const sp = curSport();
  if (sp !== "All") return sportGoal(sp)?.title || (goalsOf(p)[sp] ? sp + ": " + goalsOf(p)[sp] : sp + " · no goal yet");
  return p?.goalTitle || plan()?.goalTitle || goalText(p);
}

/* ---------- storage: this browser (localStorage) ---------- */
/* Each visitor's training data stays in their own browser. Moving it to a server database is the next step (see README). */
const LS_KEY = "tc.docs";
function initStore() { S.docs = lsGet(LS_KEY) || {}; S.ready = true; settle(); }
async function putMany(obj) {
  if (S.demo) { Object.assign(S.demoDocs, obj); render(); return; }
  S.docs = { ...S.docs, ...obj }; render();
  lsSet(LS_KEY, S.docs);
}
const put = (id, data) => putMany({ [id]: data });
async function del(id) {
  if (S.demo) { delete S.demoDocs[id]; render(); return; }
  const n = { ...S.docs }; delete n[id]; S.docs = n; render();
  lsSet(LS_KEY, S.docs);
}
function settle() {
  S.demo = !S.docs.profile;
  if (!S.demo && !S.editing) S.setup = 0;
  if (S.demo && !S.preview && !S.setup) S.setup = 1;
  render();
}
function settle() {
  S.demo = !S.docs.profile;
  if (!S.demo && !S.editing) S.setup = 0;
  if (S.demo && !S.preview && !S.setup) S.setup = 1;
  render();
}

/* ---------- Claude (through our own server route; the API key never reaches the browser) ---------- */
const ERR = {
  rate_limited: "The Coach is busy, or today's free quota is used up. Wait a few minutes and try again, or come back tomorrow.",
  refused: "The Coach couldn't answer that. Rephrase and try again.",
  prompt_too_large: "Too much history to send at once.",
  invalid_json: "The Coach's answer came back in an unexpected shape. Try again.",
  truncated: "The Coach's answer was cut off. Try again.",
  server_misconfigured: "The Coach isn't set up on this server yet. The site owner needs to add an API key.",
  unavailable: "The Coach is temporarily unavailable. Try again in a moment.",
  bad_request: "That request couldn't be sent. Reload the page and try again.",
};
async function callCoach(payload) {
  let res;
  try { res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
  catch { throw { code: "network" }; }
  if (!res.ok) { let code = "unknown"; try { code = (await res.json()).error || code; } catch {} throw { code }; }
  return res;
}
async function askJSON(key, prompt, opts = {}) {
  S.busy[key] = true; S.errors[key] = null; render();
  try {
    const res = await callCoach({ mode: "json", prompt, tier: opts.modelTier === "quick" ? "quick" : "default" });
    return (await res.json()).data;
  }
  catch (e) { S.errors[key] = ERR[e?.code] || "Couldn't reach the Coach. Try again."; return null; }
  finally { S.busy[key] = false; render(); }
}

const COACH_RULES = `You are an experienced, evidence-based coach for any sport, covering conditioning, strength, speed, mobility and sport-specific preparation. Principles:
- Progressive overload with roughly <=10% weekly volume increase; a lighter week every 3-4 weeks; taper before an event.
- Session RPE (1-10): 1-4 easy, 5-6 moderate, 7-8 hard, 9-10 max. Most training is easy; hard days are not back to back.
- Acute:chronic workload ratio (7-day load vs 28-day weekly average, load = minutes x RPE) above 1.5 is a spike risk; 0.8-1.3 is the target.
- Poor sleep (<6h), low energy, high soreness or illness: cut intensity first, then volume.
- Scale to the athlete: under 18, no maximal lifting and growth-safe loading; over 50, more recovery between hard days. Use body size only for loading and fuelling context; never comment on appearance.
- For team and skill sports, count practices and matches as sessions (type "sport"), keep hard conditioning off the day before a match, and give concrete drills for skills (you cannot watch them, so prescribe drills rather than detailed technique fixes).
- Pain that is sharp, localized, worsening, causes limping, swelling, numbness, or changes how they move is NOT trained through: stop that movement and see a physiotherapist or doctor. Chest pain, fainting or breathlessness at rest: stop and get medical care urgently.
- You are not a doctor and never diagnose.
- Explain every change in one plain, specific sentence that refers to the athlete's own data.
- Every session you write lists "exercises": the specific exercises, drills or techniques it names that someone might want to see demonstrated, each with a short YouTube search phrase (e.g. {"name":"Copenhagen plank","search":"copenhagen plank how to"}). Use [] when there is nothing to demonstrate.`;

function profileText(p) {
  const body = [p.age ? `age ${p.age}` : "", p.sex && p.sex !== "Prefer not to say" ? p.sex.toLowerCase() : "", p.heightCm ? `${p.heightCm} cm` : "", p.weightKg ? `${p.weightKg} kg` : ""].filter(Boolean).join(", ");
  const notes = [p.notes, p.limits, (p.equipment || []).length ? "equipment: " + p.equipment.join(", ") : "", p.baseline ? "current level: " + p.baseline : ""].filter(Boolean).join("; ");
  return `Athlete${p.name ? " " + p.name : ""}: ${body || "no body data"}. Sports: ${(p.sports || []).join(", ") || "not given"} (main: ${p.mainSport || p.sports?.[0] || "n/a"}); experience: ${p.level || "not given"}. Goals by sport, in their own words: ${(p.sports || []).map(sp => `${sp}: ${goalsOf(p)[sp] ? `"${goalsOf(p)[sp]}"` : "no specific goal, stay fit and ready to play"}`).join("; ")}. Target date: ${p.eventDate || "none"}. Available ${p.daysPerWeek} days/week, about ${p.sessionMinutes} min per session. Other notes: ${notes || "none"}. Prefers ${p.units === "Imperial" ? "imperial" : "metric"} units.`;
}
function sessionLine(s) { return `[${s.id}] ${s.date} ${s.type} for ${(s.for || ["All"]).join("/")} "${s.title}" ${s.minutes}min RPE${s.rpe}${s.status !== "planned" ? " (" + s.status + ")" : ""}${s.details ? " - " + s.details.slice(0, 140) : ""}`; }
function contextText(days = 14) {
  const p = profile(), pl = plan(), t = today(), m = metrics();
  const since = addDays(t, -days);
  const logs = entries("log").filter(l => l.date >= since).map(l => `${l.date} ${l.type} "${l.title}" ${l.minutes}min RPE${l.rpe}${l.notes ? " notes: " + l.notes : ""}`);
  const cks = entries("checkin").filter(c => c.date >= since).map(c => `${c.date}: "${c.text}"${c.energy ? ` (energy ${c.energy}/5)` : ""}${c.sleep ? ` (sleep ${c.sleep}h)` : ""}`);
  const upcoming = allSessions().filter(s => s.date >= t && s.date <= addDays(t, 7)).map(sessionLine);
  const wk = currentWeek();
  return `${profileText(p)}
Plan interpretation: ${(pl?.sportGoals || []).map(g => `${g.sport}: ${g.interpretation}`).join(" ") || pl?.interpretation || "n/a"}
Today: ${t} (${fmtDay(t)}). Plan week ${wk?.n ?? "?"} of ${pl?.totalWeeks ?? "?"}, phase: ${wk?.phase ?? "?"}, focus: ${wk?.focus ?? "?"}.
Metrics: 7-day load ${m.acute}, 28-day weekly average ${m.chronic}, ACWR ${m.acwr ?? "n/a"}, ${m.compliance}% of planned sessions done, average sleep ${m.sleep7 ?? "n/a"}h.
Completed workouts (last ${days} days):\n${logs.join("\n") || "none"}
Check-ins (last ${days} days):\n${cks.join("\n") || "none"}
Upcoming sessions (next 7 days):\n${upcoming.join("\n") || "none"}
${dietText(p)} Food intake vs target, last 3 days: ${nutritionText(3)}.`;
}

/* ---------- plan helpers ---------- */
function allSessions() { return (plan()?.weeks || []).flatMap(w => w.sessions || []); }
function weekOf(date) { const pl = plan(); if (!pl) return null; const n = Math.floor(diffDays(pl.startDate, date) / 7) + 1; return pl.weeks.find(w => w.n === n) || null; }
function currentWeek() { return weekOf(today()); }
function mkSessions(startDate, n, list, sports = sportsOf()) {
  const start = addDays(startDate, (n - 1) * 7);
  return (list || []).map(s => {
    const type = TYPES.includes(s.type) ? s.type : "conditioning";
    return { id: uid("s"), date: addDays(start, Math.min(6, Math.max(0, num(s.day)))), type, title: s.title || type, minutes: Math.max(0, Math.round(num(s.minutes))), rpe: Math.min(10, Math.max(0, Math.round(num(s.rpe)))), details: s.details || "", status: "planned", for: normFor(s.for, sports), ...(s.exercises ? { exercises: normEx(s.exercises) } : {}) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
function metrics() {
  const t = today(), logs = entries("log");
  const load = (from, to) => logs.filter(l => l.date > from && l.date <= to).reduce((a, l) => a + l.minutes * l.rpe, 0);
  const acute = load(addDays(t, -7), t), chronic = Math.round(load(addDays(t, -28), t) / 4);
  const pl = plan(); const daysIn = pl ? diffDays(pl.startDate, t) : 0;
  const acwr = chronic > 0 && daysIn >= 14 ? +(acute / chronic).toFixed(2) : null;
  const past = allSessions().filter(s => s.date < t && s.type !== "rest");
  const done = past.filter(s => s.status === "done").length;
  const compliance = past.length ? Math.round((done / past.length) * 100) : 100;
  const ck = entries("checkin").filter(c => c.date > addDays(t, -7) && num(c.sleep) > 0);
  const sleep7 = ck.length ? +(ck.reduce((a, c) => a + num(c.sleep), 0) / ck.length).toFixed(1) : null;
  return { acute, chronic, acwr, compliance, done, planned: past.length, sleep7 };
}
function loadStatus(a) {
  if (a == null) return ["", "Building a baseline", "Needs two weeks of logged workouts"];
  const d = `This week is ${a}× your usual load`;
  if (a > 1.5) return ["bad", "Too much, too fast", d];
  if (a > 1.3) return ["warn", "Climbing quickly", d];
  if (a < 0.8) return ["warn", "Lighter than usual", d];
  return ["good", "On track", d];
}

/* ---------- example athlete ---------- */
function makeDemo() {
  const t = today(), start = addDays(t, -15);
  const docs = {
    profile: { name: "Sam", age: 29, sex: "Prefer not to say", units: "Metric", heightCm: 172, weightKg: 68, sports: ["Running", "Strength training"], mainSport: "Running", level: "Intermediate",
      goals: { Running: "Run a 10K in under 50 minutes", "Strength training": "Get strong enough that my Achilles stops complaining" }, goalTitle: "Sub-50 10K, Achilles-proof", eventDate: addDays(start, 8 * 7 - 1), daysPerWeek: 4, sessionMinutes: 45, notes: "Left Achilles gets tight on hills. Dumbbells at home. Fridays are busy.", example: true },
  };
  const P = { startDate: start, totalWeeks: 8, goalTitle: "Sub-50 10K, Achilles-proof",
    sportGoals: [
      { sport: "Running", title: "Sub-50 10K", interpretation: "A sub-50 10K means holding 5:00/km. That takes a bigger aerobic base and comfort at threshold pace.", benchmarks: [{ name: "5K time trial", how: "Flat route, warm up 10 min, run 5K hard. Target: under 24:00 by week 7.", when: "Weeks 1, 4 and 7" }] },
      { sport: "Strength training", title: "Achilles-proof lower legs", interpretation: "Strong calves and hips take load off the Achilles on hills. Slow, heavy calf work twice a week builds tendon tolerance.", benchmarks: [{ name: "Single-leg calf raises", how: "Slow, to failure on each leg. Target: 25 a side.", when: "Every 2 weeks" }] }],
    interpretation: "A sub-50 10K means holding 5:00/km. That takes a bigger aerobic base, comfort at threshold pace, and calves strong enough to keep the Achilles quiet.",
    assumptions: ["Current 10K is around 54 minutes", "Running 3 times a week, about 15 km total", "Race is on flat roads"],
    benchmarks: [{ name: "5K time trial", how: "Flat route, warm up 10 min, run 5K hard. Target: under 24:00 by week 7.", when: "Weeks 1, 4 and 7" }, { name: "Single-leg calf raises", how: "Slow, to failure on each leg. Target: 25 a side.", when: "Every 2 weeks" }],
    rationale: "Weeks 1–3 build easy volume, week 4 is lighter so the Achilles can catch up, weeks 5–7 add 10K-pace intervals, and week 8 tapers so you arrive fresh.",
    phases: [{ name: "Base", from: 1, to: 3 }, { name: "Deload", from: 4, to: 4 }, { name: "Build", from: 5, to: 7 }, { name: "Taper", from: 8, to: 8 }], weeks: [] };
  [["Base", "Easy volume, strides", 170], ["Base", "Add a steady tempo", 185], ["Base", "Longest base week", 200], ["Deload", "Cut volume 30%", 140], ["Build", "Intervals at 10K pace", 205], ["Build", "Longer intervals", 215], ["Build", "Race simulation", 200], ["Taper", "Stay sharp, rest up", 120]]
    .forEach(([phase, focus, targetMinutes], i) => P.weeks.push({ n: i + 1, phase, focus, targetMinutes, sessions: [] }));
  docs.plan = P;
  const wk = [
    [{ day: 0, type: "test", title: "5K time trial", minutes: 40, rpe: 8, details: "10 min easy warm-up, then 5K hard on a flat route. Note your time." }, { day: 2, type: "strength", title: "Runner strength", minutes: 30, rpe: 5, details: "Calf raises 3×15 (slow lowering), split squats 3×8, glute bridge 3×12, plank 3×40 s." }, { day: 3, type: "run", title: "Easy run", minutes: 40, rpe: 3, details: "Conversational pace on a flat route." }, { day: 5, type: "long", title: "Long run 8 km", minutes: 55, rpe: 4, details: "Easy the whole way. Walk breaks are fine." }],
    [{ day: 0, type: "run", title: "Easy run + strides", minutes: 35, rpe: 3, details: "6×20 s strides at the end." }, { day: 1, type: "intervals", title: "Tempo 3×8 min", minutes: 45, rpe: 7, details: "10 min warm-up, 3×8 min comfortably hard (about 5:15/km), 2 min jog between." }, { day: 3, type: "strength", title: "Runner strength", minutes: 30, rpe: 5, details: "As week 1, plus single-leg calf raises 3×10." }, { day: 5, type: "long", title: "Long run 9 km", minutes: 60, rpe: 4, details: "Easy." }],
    [{ day: 0, type: "run", title: "Easy run", minutes: 40, rpe: 3, details: "Easy, flat." }, { day: 1, type: "intervals", title: "Tempo 2×12 min", minutes: 50, rpe: 7, details: "Warm up 10 min, 2×12 min at about 5:10/km, 3 min jog." }, { day: 3, type: "strength", title: "Runner strength", minutes: 30, rpe: 5, details: "Calf raises 3×15, step-ups 3×10, Copenhagen plank 3×20 s." }, { day: 5, type: "long", title: "Long run 10 km", minutes: 65, rpe: 4, details: "Easy, last 2 km steady if feeling good." }]];
  wk.forEach((list, i) => { P.weeks[i].sessions = mkSessions(start, i + 1, list.map(s => ({ ...s, for: [s.type === "strength" ? "Strength training" : "Running"] })), docs.profile.sports); P.weeks[i].detailed = true; });
  P.weeks[0].why = "Starts near your current 15 km a week and opens with a 5K test to set paces.";
  P.weeks[1].why = "Volume up about 8%, with one quality session added.";
  P.weeks[2].why = "Volume up again before next week's lighter week.";
  const actual = [[42, 8], [32, 6], [40, 3], [58, 5], [35, 3], [44, 7], null, [62, 5]];
  let k = 0;
  P.weeks.slice(0, 2).forEach(w => w.sessions.forEach(s => {
    const a = actual[k++]; if (s.date >= t) return;
    if (!a) { s.status = "skipped"; return; }
    s.status = "done"; const id = uid("e");
    docs[id] = { kind: "log", id, date: s.date, at: "1", sessionId: s.id, for: s.for, type: s.type, title: s.title, minutes: a[0], rpe: a[1], notes: s.type === "test" ? "25:40" : s.type === "long" ? "Achilles a little tight after" : "" };
  }));
  [[-6, 7.5, 4, "Felt good after the long run, slept well."], [-3, 6, 3, "Busy week at work, skipped Thursday's strength. Slept about 6 hours."], [-1, 5, 2, "Legs heavy, slept 5 hours, Achilles stiff in the morning but loosens up."]]
    .forEach(([d, sleep, energy, text]) => { const id = uid("e"); docs[id] = { kind: "checkin", id, date: addDays(t, d), at: "2", sleep, energy, text }; });
  const last = Object.values(docs).find(e => e.kind === "checkin" && e.date === addDays(t, -1));
  const tempo = P.weeks[2].sessions.find(s => s.type === "intervals");
  if (last && tempo && tempo.date >= t) {
    const from = { title: tempo.title, minutes: tempo.minutes, rpe: tempo.rpe };
    const why = "Five hours of sleep, heavy legs and a stiff Achilles: a tempo today raises injury risk for little gain. The tempo moves to next week.";
    Object.assign(tempo, { title: "Easy run", type: "run", minutes: 30, rpe: 3, details: "Flat route, very easy. Skip strides. Afterwards, 3×15 slow calf raises.", exercises: [{ name: "Easy running form", search: "easy running form technique" }, { name: "Slow (eccentric) calf raises", search: "eccentric calf raises achilles how to" }], adjusted: { why, from, date: last.date } });
    last.result = { readiness: "amber", summary: "Under-recovered: short sleep, heavy legs and a stiff Achilles that loosens up.", injury: { level: "monitor", reason: "Morning Achilles stiffness that eases with movement is worth watching. If it hurts during runs, is sore to squeeze, or swells, see a physio before running again." }, changes: [{ sessionId: tempo.id, from, to: { title: "Easy run", minutes: 30, rpe: 3 }, why }], coachNote: "Swap the tempo for an easy 30 minutes and add 3×15 slow calf raises tonight. If you sleep 7+ hours and the Achilles is quiet by Saturday, the long run stays." };
  }
  docs.profile.diet = { type: "Vegetarian", aim: "Fuel my training", cuisine: "Indian home food", avoid: "" };
  const y = addDays(t, -1);
  docs["food-" + y] = { kind: "food", date: y, at: "3", target: 2450,
    meals: { breakfast: "2 toast with peanut butter, chai", lunch: "Rajma chawal, a bowl of each, salad", dinner: "2 rotis, paneer bhurji, dal", snacks: "Banana, 3 biscuits with tea" },
    result: { meals: [{ meal: "Breakfast", kcal: 420, protein: 14, carbs: 50, fat: 18, note: "Assumed 1 tbsp peanut butter per slice" }, { meal: "Lunch", kcal: 620, protein: 22, carbs: 100, fat: 12, note: "About 1 cup rice, 1 cup rajma" }, { meal: "Dinner", kcal: 650, protein: 32, carbs: 60, fat: 30, note: "About 100 g paneer" }, { meal: "Snacks & drinks", kcal: 300, protein: 5, carbs: 55, fat: 8, note: "" }],
      summary: "About 80% of what a training day needs, and protein was well short, which fits the heavy legs you mentioned.", wentWell: ["Rajma and rice is a good carb-plus-protein base", "Paneer at dinner helps overnight recovery"],
      tomorrow: ["Add a cup of curd or a glass of milk to breakfast (+10 g protein)", "Have a banana and a handful of peanuts an hour before the long run", "Add a third roti or a second bowl of dal at dinner"] } };
  [[-2, .92], [-3, 1.0], [-5, .76], [-6, .97], [-7, 1.03], [-9, .86], [-10, .68], [-11, .99], [-13, .94], [-14, 1.05], [-16, .82], [-17, 1.0], [-19, .71]].forEach(([o, pct]) => {
    const dt = addDays(t, o), kcal = Math.round(2300 * pct);
    docs["food-" + dt] = { kind: "food", date: dt, at: "3", targets: { kcal: 2300, protein: 109, carbs: 300, fat: 69 }, meals: { breakfast: "(example day)" },
      result: { meals: [{ meal: "Whole day", kcal, protein: Math.round(100 * pct), carbs: Math.round(290 * pct), fat: Math.round(66 * pct), note: "" }], summary: "Example day.", wentWell: [], tomorrow: [] } };
  });
  docs["meals-" + t] = { kind: "meals", date: t, at: "4", note: "A lighter day for the easy run, with protein in every meal to catch up from yesterday.",
    meals: [{ meal: "Breakfast", time: "7:30", items: ["2 besan chillas (120 g batter)", "1 cup curd (200 g)", "Chai with milk"], kcal: 520, protein: 28, carbs: 55, fat: 18, why: "Protein early to make up for yesterday" },
      { meal: "Lunch", time: "13:00", items: ["1.5 cups rice", "1 bowl chana masala", "Cucumber raita"], kcal: 720, protein: 26, carbs: 115, fat: 16, why: "Carbs to refill after this morning's run" },
      { meal: "Snacks", time: "17:00", items: ["Banana", "Roasted peanuts (30 g)", "Glass of milk"], kcal: 430, protein: 18, carbs: 45, fat: 20, why: "" },
      { meal: "Dinner", time: "20:30", items: ["3 rotis", "Palak paneer (100 g paneer)", "Moong dal"], kcal: 760, protein: 38, carbs: 80, fat: 30, why: "Protein for overnight recovery" }] };
  return docs;
}

/* ---------- actions ---------- */
async function buildPlan(p) {
  const t = today();
  const weeksToEvent = p.eventDate ? Math.ceil((diffDays(t, p.eventDate) + 1) / 7) : null;
  const weeksRule = weeksToEvent ? `The plan has exactly ${Math.max(2, Math.min(24, weeksToEvent))} weeks${weeksToEvent <= 24 ? " and the target date falls in the last week" : ""}.` : "There is no target date: choose a sensible block of 6 to 16 weeks for this goal.";
  const prompt = `${COACH_RULES}

The athlete plays ${p.sports.length > 1 ? `${p.sports.length} sports (${p.sports.join(", ")}), main focus right now: ${p.mainSport}` : p.sports[0]} and described goals in their own words. Goals may be vague or abstract ("feel faster", "last the whole match", "bowl quicker"). Your job:
1. For EACH sport, interpret its goal: name the physical qualities and skills that decide it in that sport (e.g. repeated-sprint ability, aerobic base, rotational power, reactive agility, grip endurance) and give it a short title. A sport with no goal gets "stay match-ready" style maintenance.
2. For each sport, pick 1-3 benchmarks they can test without a lab, each with a target and when to test. Schedule first tests in weeks 1-2.
3. State the assumptions you made where things were unclear.
4. Build ONE combined periodized schedule that serves every sport. It is one body with shared fatigue, so manage total load across sports, weight time toward the main focus, and use all-round sessions (strength, mobility, aerobic base) that help several sports at once. Every session lists which sport(s) it is "for", or ["All"] for all-round work.

${profileText(p)}
Today is ${t}. Week 1 starts today (day 0 = ${fmtDay(t)}, day 1 = ${fmtDay(addDays(t, 1))}, ...). ${weeksRule}
Give a week-by-week outline for every week, and fully detailed sessions for weeks 1 and 2 only. Use about ${p.daysPerWeek} sessions per week (fewer in lighter weeks), counting any team practices or matches they mentioned. Session "type" is one of: ${TYPES.join(", ")}. "details" gives concrete work (sets, reps, distances, rest, drills, effort cues) in under 200 characters. Don't list rest days.

Reply with only JSON:
{"goalTitle":"max 6 words covering all their sports","sportGoals":[{"sport":"${p.sports[0]}","title":"max 6 words","interpretation":"2 sentences: what this goal takes physically and how the plan builds it","benchmarks":[{"name":"short","how":"how to test + target","when":"e.g. Weeks 1, 5 and 9"}]}],"assumptions":["short"],"rationale":"2-3 sentences on how the plan balances the sports and is structured","phases":[{"name":"Base","from":1,"to":4}],"weeks":[{"n":1,"phase":"Base","focus":"short","targetMinutes":180}],"detail":[{"n":1,"why":"one sentence","sessions":[{"day":0,"type":"conditioning","for":["All"],"title":"","minutes":45,"rpe":4,"details":"","exercises":[{"name":"Split squat","search":"split squat form"}]}]}]}
sportGoals has exactly one entry per sport, in this order: ${p.sports.join(", ")}. "for" values must be exact sport names from that list, or "All".`;
  const r = await askJSON("setup", prompt);
  if (!r) return;
  if (!Array.isArray(r.weeks) || !r.weeks.length) { S.errors.setup = "The plan came back incomplete. Try again."; render(); return; }
  const pl = { startDate: t, totalWeeks: r.weeks.length, generatedAt: t, goalTitle: String(r.goalTitle || "").slice(0, 60), interpretation: r.interpretation || "", rationale: r.rationale || "",
    assumptions: Array.isArray(r.assumptions) ? r.assumptions.map(String) : [],
    sportGoals: p.sports.map(sp => { const g = (r.sportGoals || []).find(x => x.sport === sp) || {}; return { sport: sp, title: String(g.title || sp), interpretation: g.interpretation || "", benchmarks: Array.isArray(g.benchmarks) ? g.benchmarks : [] }; }),
    phases: (r.phases || []).map(x => ({ name: x.name, from: num(x.from, 1), to: num(x.to, 1) })),
    weeks: r.weeks.map((w, i) => ({ n: i + 1, phase: w.phase || "", focus: w.focus || "", targetMinutes: num(w.targetMinutes), sessions: [] })) };
  (r.detail || []).forEach(d => { const w = pl.weeks.find(x => x.n === num(d.n)); if (w) { w.why = d.why || ""; w.sessions = mkSessions(t, w.n, d.sessions, p.sports); w.detailed = true; } });
  p.goalTitle = pl.goalTitle;
  S.demo = false; S.editing = false; S.preview = false; S.setup = 0; S.tab = "plan";
  await putMany({ plan: pl, profile: p });
  window.scrollTo(0, 0);
}

async function planWeek(n) {
  const pl = plan(); const w = pl.weeks.find(x => x.n === n); if (!w) return;
  const start = addDays(pl.startDate, (n - 1) * 7);
  const prompt = `${COACH_RULES}

Plan the detailed sessions for week ${n} of ${pl.totalWeeks}. Outline: phase ${w.phase}, focus "${w.focus}", about ${w.targetMinutes} minutes. Next week's outline: ${JSON.stringify(pl.weeks.find(x => x.n === n + 1) || "none (final week)")}.
Goals and benchmarks by sport: ${JSON.stringify((pl.sportGoals || []).map(g => ({ sport: g.sport, title: g.title, benchmarks: g.benchmarks })))} (schedule a test session this week if one is due).
This is one combined schedule for all their sports; manage total load across them and weight toward the main focus (${profile().mainSport || sportsOf()[0]}).
Week ${n} day 0 = ${fmtDay(start)}, day 6 = ${fmtDay(addDays(start, 6))}.
Adapt to how training actually went: missed sessions, harder-than-planned efforts, fatigue, sleep, pain. If load is spiking or recovery is poor, hold or reduce; if things are going well, progress as outlined.
${contextText(21)}
Session "type" is one of: ${TYPES.join(", ")}. "for" lists the sport(s) a session serves (exact names: ${sportsOf().join(", ")}) or ["All"]. Keep "details" under 200 characters. Don't list rest days.

Reply with only JSON: {"focus":"short","why":"2 sentences: what you changed from the outline (if anything) and why, citing their data","sessions":[{"day":0,"type":"run","for":["All"],"title":"","minutes":35,"rpe":3,"details":"","exercises":[{"name":"Split squat","search":"split squat form"}]}]}`;
  const r = await askJSON("week" + n, prompt);
  if (!r) return;
  if (!Array.isArray(r.sessions)) { S.errors["week" + n] = "The week came back incomplete. Try again."; render(); return; }
  const np = clone(pl); const nw = np.weeks.find(x => x.n === n);
  Object.assign(nw, { sessions: mkSessions(np.startDate, n, r.sessions), why: r.why || "", focus: r.focus || nw.focus, detailed: true });
  await put("plan", np);
}

async function checkIn() {
  const ta = $("#ck-text"), text = (ta?.value || "").trim();
  if (!text) { S.errors.checkin = "Write a line about how you feel first."; render(); return; }
  const entry = { kind: "checkin", id: uid("e"), date: today(), at: new Date().toISOString(), text };
  const localFlag = RED_FLAGS.test(text);
  const prompt = `${COACH_RULES}

The athlete just checked in, in plain words. Read it, pull out any numbers they mention, and decide how to adjust the next 7 days.
Check-in: "${text}"
${contextText(14)}

Only change sessions listed under "Upcoming sessions", by the id in square brackets, and only those that should change. "action" is "modify" (give the new session) or "rest" (cancel it). If nothing should change, return an empty list and say why in coachNote.
If injury.level is "see_physio" or "urgent", replace sessions that load the painful area with rest or pain-free alternatives.
injury.level: "none"; "monitor" (minor, watch it); "see_physio" (needs assessment before more training on it); "urgent" (stop and get medical care now).

Reply with only JSON: {"parsed":{"sleepHours":null,"energy":null},"readiness":"green|amber|red","summary":"one sentence","injury":{"level":"none","reason":""},"changes":[{"sessionId":"s...","action":"modify","session":{"type":"run","title":"","minutes":30,"rpe":3,"details":"","exercises":[{"name":"Split squat","search":"split squat form"}]},"why":"one sentence citing their data"}],"coachNote":"2-4 sentences: what to do today"}
parsed.energy is 1 (drained) to 5 (great), inferred from their words; use null for anything they didn't indicate.`;
  const r = await askJSON("checkin", prompt);
  if (!r) {
    if (localFlag) entry.result = { injury: { level: "see_physio", reason: "You described something that can signal an injury. Don't train through it; get it checked by a physio." } };
    await put(entry.id, entry); if (ta) ta.value = ""; return;
  }
  if (localFlag && (!r.injury || ["none", "monitor"].includes(r.injury.level))) r.injury = { level: "see_physio", reason: (r.injury?.reason ? r.injury.reason + " " : "") + "Some of what you described can signal an injury, so get it assessed before training through it." };
  entry.sleep = num(r.parsed?.sleepHours) || null;
  entry.energy = Math.min(5, Math.max(1, num(r.parsed?.energy))) || null;
  if (!num(r.parsed?.energy)) entry.energy = null;
  const np = clone(plan()); const applied = [];
  for (const c of r.changes || []) {
    const s = np.weeks.flatMap(w => w.sessions || []).find(x => x.id === c.sessionId);
    if (!s || s.status !== "planned") continue;
    const from = { title: s.title, minutes: s.minutes, rpe: s.rpe };
    if (c.action === "rest") Object.assign(s, { type: "rest", title: "Rest day", minutes: 0, rpe: 0, details: c.session?.details || "Full rest or a gentle walk." });
    else if (c.session) Object.assign(s, { type: TYPES.includes(c.session.type) ? c.session.type : s.type, title: c.session.title || s.title, for: c.session.for ? normFor(c.session.for, sportsOf()) : s.for, minutes: Math.round(num(c.session.minutes, s.minutes)), rpe: Math.round(num(c.session.rpe, s.rpe)), details: c.session.details || s.details, exercises: normEx(c.session.exercises) });
    else continue;
    s.adjusted = { why: c.why || "", from, date: entry.date };
    applied.push({ sessionId: s.id, from, to: { title: s.title, minutes: s.minutes, rpe: s.rpe }, why: c.why || "" });
  }
  entry.result = { readiness: r.readiness, summary: r.summary, injury: r.injury, changes: applied, coachNote: r.coachNote };
  await putMany(applied.length ? { plan: np, [entry.id]: entry } : { [entry.id]: entry });
  if (ta) ta.value = "";
}

async function findPatterns() {
  const weekly = weeklyRows().map(w => `W${w.n}: planned load ${w.planned}, done load ${w.done}, sessions ${w.doneCount}/${w.count}`).join("\n");
  const prompt = `${COACH_RULES}

Look through this athlete's training for patterns: rising fatigue, plateaus, load jumping too fast, which sessions get skipped, efforts feeling harder at the same work, sleep trends, recurring niggles, benchmark progress, and genuine positives.
${contextText(42)}
Weekly summary:\n${weekly}

Reply with only JSON: {"headline":"one sentence","insights":[{"kind":"fatigue|plateau|load|consistency|recovery|niggle|positive","title":"short","detail":"1-2 sentences","evidence":"the specific numbers or entries"}],"nextStep":"one concrete recommendation for the coming week"}. 3-5 insights. Don't invent data; if there's too little, say so.`;
  const r = await askJSON("patterns", prompt);
  if (r) await put("insights", { kind: "insight", date: today(), at: new Date().toISOString(), result: r });
}

async function sendChat(text) {
  text = text.trim(); if (!text) return;
  S.chat.push({ role: "user", content: text });
  const rules = `${COACH_RULES}\n\nYou're chatting with the athlete as their coach. Be concise (under 150 words unless asked), plain and specific to their data. If they want the plan changed, describe the change and tell them to send it as a check-in on the Today tab so the plan updates.\n\nTheir situation:\n${contextText(14)}`;
  const reply = { role: "assistant", content: "" }; S.chat.push(reply); S.busy.chat = true; render();
  try {
    const history = S.chat.slice(0, -1).slice(-12).filter(m => m.content);
    const res = await callCoach({ mode: "chat", system: rules, messages: history });
    /* The server streams plain text; show it as it arrives. */
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      reply.content += dec.decode(value, { stream: true });
      const el = $("#chat-last"); if (el) el.textContent = reply.content;
    }
    if (!reply.content.trim()) reply.content = "I didn't get an answer back. Try again.";
  } catch (e) { reply.content = ERR[e?.code] || "Couldn't reach the Coach. Try again."; }
  finally { S.busy.chat = false; render(); $("#chatlog")?.lastElementChild?.scrollIntoView({ block: "nearest" }); }
}

async function logSession(sessionId, status, minutes, rpe) {
  const np = clone(plan()); const s = np.weeks.flatMap(w => w.sessions || []).find(x => x.id === sessionId); if (!s) return;
  s.status = status;
  const upd = { plan: np };
  if (status === "done") { const id = uid("e"); upd[id] = { kind: "log", id, date: s.date, at: new Date().toISOString(), sessionId, for: s.for, type: s.type, title: s.title, minutes: num(minutes, s.minutes), rpe: num(rpe, s.rpe), notes: "" }; }
  S.openLog = null;
  await putMany(upd);
}

let toastT;
function toast(msg) { let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "pill"; t.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:20;padding:8px 14px;font-size:13px;white-space:normal;max-width:calc(100% - 32px);text-align:center"; document.body.append(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3500); }

/* ---------- exercise videos ---------- */
/* Links open a YouTube search rather than one specific video, so they never point at a dead or made-up URL. */
const ytLink = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
function normEx(list) {
  if (!Array.isArray(list)) return undefined;
  return list.slice(0, 10).map(e => typeof e === "string" ? { name: e, search: e + " how to" } : { name: String(e?.name || "").slice(0, 80), search: String(e?.search || e?.name || "").slice(0, 100) }).filter(e => e.name);
}
async function loadExercises(id) {
  const s = allSessions().find(x => x.id === id); if (!s) return;
  const prompt = `List the specific exercises, drills or techniques in this training session that the athlete might want to watch a demonstration of. Skip generic items like "warm-up" or "cool-down" unless a specific routine is named. For a plain run, ride or swim, include one entry for good technique in that activity.
Session: "${s.title}" (${s.type}${s.for?.length && !s.for.includes("All") ? ", for " + s.for.join(", ") : ""}). Details: ${s.details || "none"}
Sports they play: ${sportsOf().join(", ")}.
Reply with only JSON: {"exercises":[{"name":"Split squat","search":"split squat proper form"}]}. At most 8. "search" is a short YouTube search phrase.`;
  const r = await askJSON("ex-" + id, prompt, { modelTier: "quick" });
  if (!r) return;
  const np = clone(plan()), t = np.weeks.flatMap(w => w.sessions || []).find(x => x.id === id);
  if (t) { t.exercises = normEx(r.exercises) || []; await put("plan", np); }
}
function videoBox(s) {
  const k = "ex-" + s.id, ex = s.exercises;
  let body;
  if (S.busy[k]) body = `<span class="thinking">Finding the exercises in this session…</span>`;
  else if (S.errors[k]) body = `<p class="err">${esc(S.errors[k])}</p><div><button class="btn small" data-act="load-ex" data-id="${s.id}">Try again</button></div>`;
  else if (!ex) body = "";
  else if (!ex.length) body = `<p class="small muted">Nothing in this session needs a demo.</p>`;
  else body = ex.map(e => `<a class="vlink" href="${esc(ytLink(e.search))}" target="_blank" rel="noopener noreferrer"><span>${esc(e.name)}</span><span class="small">Watch ↗</span></a>`).join("") + `<p class="small muted">Each link opens a YouTube search, so you can pick a video from a coach you trust.</p>`;
  return `<details class="videos" data-vid="${s.id}" ${S.vidOpen === s.id ? "open" : ""}><summary><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.3 5.8v6.4L12.2 9Z" fill="currentColor"/></svg>How to do it: exercise videos${ex?.length ? ` (${ex.length})` : ""}</summary><div class="vbody">${body}</div></details>`;
}

/* ---------- views ---------- */
const TABS = [["today", "Today"], ["food", "Food"], ["plan", "Plan"], ["progress", "Progress"], ["coach", "Coach"]];

function render() {
  if (S.ready && S.demo && !S.demoDocs) S.demoDocs = makeDemo();
  const keep = {}; document.querySelectorAll("[data-keep]").forEach(el => keep[el.id] = el.value);
  const act = document.activeElement, focusId = act?.id;
  let sel = null; try { sel = act && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null; } catch {}
  $("#tabs").innerHTML = S.ready && !S.setup ? TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join("") : "";
  $("#goalline").innerHTML = goalLine();
  $("#sportbar").innerHTML = S.ready && !S.setup && multi() && ["today", "plan", "progress"].includes(S.tab) ? ["All", ...sportsOf()].map(sp => `<button data-sport="${esc(sp)}" aria-pressed="${curSport() === sp}">${sp === "All" ? "All sports" : esc(sp)}</button>`).join("") : "";
  if (!S.ready) return;
  let html = "";
  if (S.setup) html = viewSetup();
  else {
    if (S.demo) html += `<div class="banner demo"><div class="grow"><strong>This is an example athlete</strong><span class="small">Made-up plan and logs, so you can see how it works. Nothing is saved.</span></div><button class="btn primary" data-act="start-setup">Start my plan</button></div>`;
    html += ({ today: viewToday, plan: viewPlan, food: viewFood, progress: viewProgress, coach: viewCoach }[S.tab] || viewToday)();
  }
  $("#app").innerHTML = html;
  for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el) el.value = v; }
  if (focusId) { const el = document.getElementById(focusId); el?.focus?.({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch {} }
  flagCheck();
  if (S.tab === "progress" && !S.setup) wireCharts();
}

function goalLine() {
  const p = profile(); if (!p || S.setup) return "";
  const w = currentWeek(), pl = plan();
  const days = p.eventDate ? diffDays(today(), p.eventDate) : null;
  return `<b>${esc(goalTitle(p))}</b><br>${w ? `Week ${w.n} of ${pl.totalWeeks}` : "Plan finished"}${days != null && days >= 0 ? ` · ${days} days to go` : ""}`;
}
const sessMeta = s => s.minutes ? `${s.minutes} min · ${effort(s.rpe)} (${s.rpe}/10)` : "";
const adjNote = s => s.adjusted ? `<div class="adj">Changed from <s>${esc(s.adjusted.from.title)}, ${s.adjusted.from.minutes} min</s><div class="why">${esc(s.adjusted.why)}</div></div>` : "";

const sportTag = s => multi() && s.for?.length && s.type !== "rest" ? `<span class="ptag">${s.for.includes("All") ? "All-round" : s.for.map(esc).join(" + ")}</span>` : "";
function sessionRow(s, withDetails) {
  const d = parse(s.date), t = today();
  return `<div class="session ${s.date === t ? "today" : ""} ${s.status}">
    <div class="day">${DOW[d.getDay()]}<b>${d.getDate()}</b></div>
    <div class="body">
      <div class="title">${esc(s.title)}${sportTag(s)}</div>
      <div class="meta">${sessMeta(s)}${s.status === "skipped" ? " · skipped" : ""}</div>
      ${withDetails && s.details ? `<p class="small muted">${esc(s.details)}</p>` : ""}
      ${adjNote(s)}
      ${withDetails && s.status === "planned" && s.type !== "rest" && s.date < t ? `<div class="row"><button class="btn small" data-act="done" data-id="${s.id}">Done</button><button class="btn ghost small" data-act="skip" data-id="${s.id}">Skipped</button></div>` : ""}
    </div></div>`;
}

function injuryBanner(res) {
  const lvl = res?.injury?.level; if (!lvl || lvl === "none") return "";
  if (lvl === "monitor") return `<div class="banner warn"><div class="grow"><strong>Keep an eye on this</strong><span class="small">${esc(res.injury.reason)}</span></div></div>`;
  const urgent = lvl === "urgent";
  return `<div class="banner bad" role="alert"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 2 21 19H1Z" fill="none" stroke="var(--bad)" stroke-width="2" stroke-linejoin="round"/><path d="M11 8v5M11 15.5v.5" stroke="var(--bad)" stroke-width="2" stroke-linecap="round"/></svg><div class="grow"><strong>${urgent ? "Stop training and get medical care now" : "See a physio before training on this"}</strong><span class="small">${esc(res.injury.reason)} ${urgent ? "If symptoms are severe, call your local emergency number." : "Book an assessment with a physiotherapist or sports doctor, and skip anything that hurts until then."}</span></div></div>`;
}

function needsWeek(w) {
  const k = "week" + w.n;
  return `<div class="banner demo"><div class="grow"><strong>Week ${w.n} is ready to plan</strong><span class="small">The Coach writes it from how last week actually went.</span>${S.errors[k] ? `<p class="err">${esc(S.errors[k])}</p>` : ""}</div>${S.busy[k] ? `<span class="thinking">Planning…</span>` : `<button class="btn primary" data-act="planweek" data-n="${w.n}">Plan week ${w.n}</button>`}</div>`;
}
function pendingWeek() {
  const pl = plan(), w = currentWeek(), t = today(); if (!pl) return null;
  if (w && !(w.sessions || []).length) return w;
  const nw = pl.weeks.find(x => x.n === (w?.n || 0) + 1);
  if (nw && !(nw.sessions || []).length && diffDays(t, addDays(pl.startDate, (nw.n - 1) * 7)) <= 2) return nw;
  return null;
}

function viewToday() {
  const t = today();
  const lastCk = entries("checkin").filter(c => c.date >= addDays(t, -2)).pop();
  const todayAll = allSessions().filter(s => s.date === t);
  const todays = todayAll.filter(s => serves(s)), hidden = todayAll.filter(s => !serves(s));
  const next = allSessions().filter(s => s.date > t && serves(s)).slice(0, 3);
  let h = "";
  if (lastCk?.result) h += injuryBanner(lastCk.result);
  const pw = pendingWeek(); if (pw) h += needsWeek(pw);

  h += `<section class="card"><div class="eyebrow">Today · ${fmtDay(t)}</div>`;
  if (!todays.length) h += hidden.length ? `<div class="big">No ${esc(curSport())} session today</div>` : `<div class="big">Rest day</div><p class="muted">Recovery is when you adapt. A walk or some easy mobility is fine.</p>`;
  todays.forEach(s => {
    h += `<div class="big">${esc(s.title)}</div>${multi() && s.for?.length ? `<div>${sportTag(s)}</div>` : ""}
      <p class="muted">${sessMeta(s)}${s.status === "done" ? " · done ✓" : s.status === "skipped" ? " · skipped" : ""}</p>
      ${s.details ? `<p>${esc(s.details)}</p>` : ""}
      ${adjNote(s)}
      ${s.type !== "rest" ? videoBox(s) : ""}
      ${s.status === "planned" && s.type !== "rest" ? (S.openLog === s.id
        ? `<form class="row" data-form="logdiff" data-id="${s.id}" style="align-items:flex-end"><label class="f" style="flex:1 1 120px">Minutes<input type="number" id="lg-min" data-keep min="0" value="${s.minutes}"></label><label class="f" style="flex:1 1 120px">Effort 1–10<input type="number" id="lg-rpe" data-keep min="1" max="10" value="${s.rpe}"></label><button class="btn primary" type="submit">Save</button></form>`
        : `<div class="row"><button class="btn primary" data-act="done" data-id="${s.id}">Done</button><button class="btn" data-act="skip" data-id="${s.id}">Skipped</button><button class="btn ghost" data-act="openlog" data-id="${s.id}">Did something different?</button></div>`) : ""}`;
  });
  if (hidden.length) h += `<p class="small muted">Also today: ${hidden.map(x => esc(x.title)).join(", ")}. <button class="btn ghost small" data-sport="All">Show all sports</button></p>`;
  h += `</section>`;

  h += `<section class="card"><h3>How are you feeling?</h3>
    <label class="f"><span class="hint">Mention sleep, energy, soreness or anything that hurts. The Coach adjusts the next 7 days.</span><textarea id="ck-text" data-keep placeholder="Legs feel heavy, slept 5 hours, slight knee ache on the stairs."></textarea></label>
    <div id="ck-flag" class="err" hidden></div>
    <div class="row">${S.busy.checkin ? `<span class="thinking">The Coach is reading this…</span>` : `<button class="btn primary" data-act="checkin">Send to coach</button>`}</div>
    ${S.errors.checkin ? `<p class="err">${esc(S.errors.checkin)}</p>` : ""}
    ${lastCk ? checkinReply(lastCk) : ""}
  </section>`;

  if (next.length) h += `<section class="card"><h3>Coming up</h3><div>${next.map(s => sessionRow(s, false)).join("")}</div></section>`;
  return h;
}

function checkinReply(c) {
  const r = c.result; if (!r || !r.summary) return "";
  const cls = { green: "good", amber: "warn", red: "bad" }[r.readiness] || "";
  const word = { green: "Ready to train", amber: "Take it easier", red: "Recover first" }[r.readiness];
  return `<div class="reply">
    <div class="row"><span class="eyebrow">Coach · ${c.date === today() ? "today" : fmtDay(c.date)}</span>${word ? `<span class="pill ${cls}"><span class="dot"></span>${word}</span>` : ""}</div>
    <p><strong>${esc(r.summary)}</strong></p>
    ${r.coachNote ? `<p>${esc(r.coachNote)}</p>` : ""}
    ${(r.changes || []).map(ch => { const s = allSessions().find(x => x.id === ch.sessionId);
      return `<div class="change"><span>${s ? fmtDay(s.date) + ": " : ""}<s>${esc(ch.from.title)}</s> → <b>${esc(ch.to.title)}${ch.to.minutes ? `, ${ch.to.minutes} min` : ""}</b></span><span class="why">${esc(ch.why)}</span></div>`; }).join("")}
  </div>`;
}

function viewPlan() {
  const pl = plan(), p = profile(), w = currentWeek(); if (!pl) return "";
  const sp = curSport(), sg = pl.sportGoals || [], goals = goalsOf(p);
  const phasebar = pl.phases?.length ? `<div class="phasebar">${pl.phases.map(ph => `<div class="${w && w.n >= ph.from && w.n <= ph.to ? "cur" : ""}" style="flex:${ph.to - ph.from + 1}">${esc(ph.name)}</div>`).join("")}</div>` : "";
  const benches = list => (list || []).length ? `<div class="stack"><h3>How you'll measure progress</h3>${list.map(b => `<div class="bench"><strong>${esc(b.name)}</strong><span class="small">${esc(b.how)}</span><span class="small muted">${esc(b.when)}</span></div>`).join("")}</div>` : "";
  const why = `<details class="more"><summary>Why the plan looks like this</summary><div class="stack" style="margin-top:8px"><p>${esc(pl.rationale)}</p>
      ${(pl.assumptions || []).length ? `<p class="small muted">The Coach assumed:</p><ul class="plain small">${pl.assumptions.map(a => `<li>${esc(a)}</li>`).join("")}</ul><p class="small muted">If any of this is wrong, change your goals below or tell the Coach.</p>` : ""}</div></details>`;
  let h = `<section class="card">`;
  if (sp === "All") {
    h += `<div class="eyebrow">${multi() ? "Your goals" : "Your goal"}</div><h2>${esc(goalTitle(p))}</h2>`;
    if (sg.length && multi()) h += `<div class="goalgrid">${sportsOf().map(name => { const g = sportGoal(name), txt = goals[name];
        return `<button class="sgoal" data-sport="${esc(name)}"><span class="eyebrow">${esc(name)}${name === p.mainSport ? " · main focus" : ""}</span><strong>${esc(g?.title || (txt ? txt : "No goal yet"))}</strong>${txt ? `<span class="small muted">“${esc(txt)}”</span>` : ""}<span class="go">See ${esc(name)} plan →</span></button>`; }).join("")}</div>`;
    else {
      const g = sg[0];
      h += `<p class="goalquote">“${esc(goalText(p).replace(/^[^:]+: /, multi() ? "$&" : ""))}”</p>${g?.interpretation || pl.interpretation ? `<p>${esc(g?.interpretation || pl.interpretation)}</p>` : ""}`;
      if (!sg.length && multi()) h += `<p class="small muted">This plan was built with one goal. Add a goal for each sport to get a plan that covers all of them.</p><div><button class="btn" data-act="start-setup" data-step="3">Set a goal for each sport</button></div>`;
    }
    h += phasebar + (multi() ? "" : benches(sg[0]?.benchmarks || pl.benchmarks)) + why;
  } else {
    const g = sportGoal(sp), txt = goals[sp];
    h += `<div class="eyebrow">${esc(sp)}${sp === p.mainSport ? " · main focus" : ""}</div><h2>${esc(g?.title || (txt ? sp + " goal" : "No " + sp + " goal yet"))}</h2>`;
    if (txt) h += `<p class="goalquote">“${esc(txt)}”</p>`;
    if (g?.interpretation) h += `<p>${esc(g.interpretation)}</p>`;
    if (!g) h += `<p class="small muted">${txt ? "This goal was added after the plan was built." : `You picked ${esc(sp)} but haven't set a goal for it.`} Rebuild the plan to train for it properly.</p><div><button class="btn primary" data-act="start-setup" data-step="3">${txt ? "Rebuild plan" : "Add a " + esc(sp) + " goal"}</button></div>`;
    h += phasebar + benches(g?.benchmarks);
  }
  h += `</section>`;
  h += `<section class="card"><div><h3>Week by week</h3>${sp !== "All" ? `<p class="small muted">${esc(sp)} and all-round sessions. Switch to All sports to see your full week.</p>` : ""}</div><div class="stack" style="gap:12px">`;
  pl.weeks.forEach(wk => {
    const has = (wk.sessions || []).length, shown = (wk.sessions || []).filter(x => serves(x));
    h += `<details class="week" ${w && wk.n === w.n ? "open" : ""}><summary><span class="wk">Week ${wk.n}</span><span class="pill">${esc(wk.phase)}</span><span class="small">${esc(wk.focus)}</span></summary>
      ${wk.why ? `<p class="small why">${esc(wk.why)}</p>` : ""}
      ${has ? (shown.length ? `<div>${shown.map(s => sessionRow(s, true)).join("")}</div>` : `<p class="small muted">No ${esc(sp)} sessions this week.</p>`) : `<p class="small muted">Planned in detail when the week before is underway.</p>${w && wk.n <= w.n + 1 ? needsWeek(wk) : ""}`}
    </details>`;
  });
  h += `</div></section>`;
  if (!S.demo) {
    const imp = p.units === "Imperial";
    const info = [p.age ? p.age + " yrs" : "", p.heightCm ? (imp ? cmToFtIn(p.heightCm).join("′ ") + "″" : p.heightCm + " cm") : "", p.weightKg ? (imp ? Math.round(p.weightKg / 0.45359) + " lb" : p.weightKg + " kg") : "", (p.sports || []).join(", ")].filter(Boolean).join(" · ");
    h += `<section class="card"><div class="row between"><div><h3>Your details and goals</h3><p class="small muted">${esc(info)}</p></div>${S.confirmReset ? "" : `<button class="btn" data-act="ask-reset">Change goals or details</button>`}</div>
      ${S.confirmReset ? `<div class="row"><span class="small">This builds a new plan. Your workouts and check-ins stay.</span><button class="btn primary" data-act="start-setup">Continue</button><button class="btn ghost" data-act="cancel-reset">Cancel</button></div>` : ""}</section>`;
  }
  return h;
}

function weeklyRows() {
  const pl = plan(); if (!pl) return [];
  const logs = entries("log"), cur = currentWeek()?.n ?? pl.totalWeeks;
  return pl.weeks.filter(w => w.n <= cur).map(w => {
    const s = addDays(pl.startDate, (w.n - 1) * 7), e = addDays(s, 6);
    const ses = (w.sessions || []).filter(x => x.type !== "rest");
    const planned = ses.length ? ses.reduce((a, x) => a + x.minutes * x.rpe, 0) : Math.round(w.targetMinutes * 4.5);
    const wl = logs.filter(l => l.date >= s && l.date <= e);
    return { n: w.n, planned, done: wl.reduce((a, l) => a + l.minutes * l.rpe, 0), minutes: wl.reduce((a, l) => a + l.minutes, 0), count: ses.length, doneCount: ses.filter(x => x.status === "done").length };
  });
}

function viewProgress() {
  const m = metrics(), rows = weeklyRows(), ins = D().insights;
  const [lc, lw, ld] = loadStatus(m.acwr);
  const logs = entries("log").filter(l => serves(l)).slice().reverse(), cks = entries("checkin");
  let h = `<div class="tiles">
    <div class="tile"><span class="l">Sessions done</span><span class="v">${m.done} of ${m.planned}</span><span class="small muted">${m.compliance}% so far</span></div>
    <div class="tile"><span class="l">Training load</span><span>${lc ? `<span class="pill ${lc}" style="font-size:14px;margin-block:4px"><span class="dot"></span>${lw}</span>` : `<strong>${lw}</strong>`}</span><span class="small muted">${ld}</span></div>
    <div class="tile"><span class="l">Average sleep</span><span class="v">${m.sleep7 ?? "—"}${m.sleep7 != null ? " h" : ""}</span><span class="small muted">last 7 days, from check-ins</span></div>
  </div>`;
  h += `<section class="card"><div class="row between"><h3>Weekly load</h3><div class="legend"><span><i style="background:var(--accent-weak)"></i>Planned</span><span><i style="background:var(--accent)"></i>Done</span></div></div>
    <p class="small muted">Load = minutes × effort (1–10)${multi() ? ", all sports combined: one body, one load" : ""}.</p>
    <div class="chartbox">${loadChart(rows)}</div>
    <details class="more"><summary>Show as table</summary><div class="tablewrap"><table class="t"><thead><tr><th>Week</th><th class="n">Planned</th><th class="n">Done</th><th class="n">Minutes</th><th class="n">Sessions</th></tr></thead><tbody>${rows.map(r => `<tr><td>Week ${r.n}</td><td class="n">${r.planned}</td><td class="n">${r.done}</td><td class="n">${r.minutes}</td><td class="n">${r.doneCount}/${r.count}</td></tr>`).join("")}</tbody></table></div></details>
  </section>`;
  h += `<section class="card"><h3>Energy</h3><p class="small muted">From your check-ins, last 4 weeks. 1 drained, 5 great.</p><div class="chartbox">${energyChart(cks.filter(c => c.energy && c.date >= addDays(today(), -27)))}</div></section>`;
  h += `<section class="card"><div class="row between"><h3>Patterns</h3>${S.busy.patterns ? `<span class="thinking">Reading your log…</span>` : `<button class="btn" data-act="patterns">${ins ? "Check again" : "Find patterns"}</button>`}</div>
    ${S.errors.patterns ? `<p class="err">${esc(S.errors.patterns)}</p>` : ""}
    ${ins?.result ? `<p><strong>${esc(ins.result.headline)}</strong></p><div>${(ins.result.insights || []).map(i => `<div class="item"><div class="row"><span class="pill ${i.kind === "positive" ? "good" : ["niggle", "load"].includes(i.kind) ? "bad" : ["fatigue", "plateau"].includes(i.kind) ? "warn" : ""}">${esc(i.kind)}</span><strong>${esc(i.title)}</strong></div><p>${esc(i.detail)}</p><p class="small muted">${esc(i.evidence)}</p></div>`).join("")}</div>${ins.result.nextStep ? `<div class="change"><strong>For next week</strong><span>${esc(ins.result.nextStep)}</span></div>` : ""}<p class="small muted">Checked ${fmtDay(ins.date)}</p>`
    : `<p class="muted">The Coach looks for rising fatigue, plateaus, load jumping too fast and skipped-session habits.</p>`}
  </section>`;
  h += `<section class="card"><div class="row between"><h3>History</h3><button class="btn small" data-act="toggle-add">${S.addOpen ? "Close" : "Add a workout"}</button></div>
    ${S.addOpen ? `<form class="stack" data-form="extralog" style="background:var(--sunk);padding:12px;border-radius:10px">
      <label class="f">What did you do?<input type="text" id="x-title" data-keep placeholder="e.g. 5-a-side match, extra swim" required></label>
      <div class="grid3"><label class="f">Date<input type="date" id="x-date" data-keep value="${today()}"></label><label class="f">Minutes<input type="number" id="x-min" data-keep min="1" value="45"></label><label class="f">Effort 1–10<input type="number" id="x-rpe" data-keep min="1" max="10" value="5"></label>${multi() ? `<label class="f">Sport<select id="x-sport" data-keep style="width:100%;border:1px solid var(--line);background:var(--sunk);border-radius:10px;padding:10px 12px;font-size:16px;color:var(--ink)">${["All", ...sportsOf()].map(x => `<option value="${esc(x)}" ${x === curSport() ? "selected" : ""}>${x === "All" ? "General" : esc(x)}</option>`).join("")}</select></label>` : ""}</div>
      <div><button class="btn primary" type="submit">Add</button></div></form>` : ""}
    ${curSport() !== "All" ? `<p class="small muted">${esc(curSport())} and all-round workouts.</p>` : ""}${logs.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Workout</th><th class="n">Min</th><th class="n">Effort</th><th></th></tr></thead><tbody>${logs.map(l => `<tr><td>${fmtDay(l.date)}</td><td>${esc(l.title)}${sportTag(l)}${l.notes ? `<div class="small muted">${esc(l.notes)}</div>` : ""}</td><td class="n">${l.minutes}</td><td class="n">${l.rpe}</td><td><button class="btn ghost small" data-act="dellog" data-id="${l.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No workouts yet. Tap Done on today's session to log it.</p>`}
    ${cks.length ? `<details class="more"><summary>Past check-ins (${cks.length})</summary><div style="margin-top:6px">${cks.slice().reverse().map(c => `<div class="item"><span class="small muted">${fmtDay(c.date)}</span><p>“${esc(c.text)}”</p>${c.result?.summary ? `<p class="small muted">${esc(c.result.summary)}</p>` : ""}</div>`).join("")}</div></details>` : ""}
  </section>`;
  return h;
}

function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function bar(x, w, yTop, yBase, fill) {
  const h = yBase - yTop, r = Math.min(4, h, w / 2); if (h <= 0) return "";
  return `<path d="M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z" fill="${fill}"/>`;
}
function loadChart(rows) {
  if (!rows.length) return `<p class="muted">Your first week shows here once it starts.</p>`;
  const W = 640, H = 210, L = 44, R = 8, T = 12, B = 26;
  const max = Math.max(1, ...rows.map(r => Math.max(r.planned, r.done)));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top);
  const band = (W - L - R) / rows.length, bw = Math.min(24, band * 0.5);
  let g = "";
  for (let v = 0; v <= top; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "K" : v}</text>`;
  const curN = currentWeek()?.n;
  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    g += bar(cx - bw / 2 - 1, bw + 2, y(r.planned), y(0), "var(--accent-weak)");
    if (r.done) g += bar(cx - bw / 2 + 4, bw - 8, y(r.done), y(0), "var(--accent)");
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" style="${r.n === curN ? "fill:var(--ink);font-weight:500" : ""}">W${r.n}</text>`;
    g += `<rect x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent" data-tip="Week ${r.n}${r.n === curN ? " (this week)" : ""}|Planned ${r.planned}|Done ${r.done} · ${r.doneCount}/${r.count} sessions"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Planned versus completed training load per week">${g}</svg>`;
}
function energyChart(cks) {
  if (cks.length < 2) return `<p class="muted">Check in on a few days to see your energy trend.</p>`;
  const W = 640, H = 160, L = 30, R = 14, T = 12, B = 26, d0 = addDays(today(), -27);
  const x = d => L + (W - L - R) * (diffDays(d0, d) / 27), y = v => T + (H - T - B) * (1 - (v - 1) / 4);
  let g = "";
  for (let v = 1; v <= 5; v++) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  [0, 7, 14, 21, 27].forEach(o => { const d = addDays(d0, o); g += `<text x="${x(d)}" y="${H - 8}" text-anchor="${o === 27 ? "end" : o === 0 ? "start" : "middle"}">${parse(d).getDate()} ${MON[parse(d).getMonth()]}</text>`; });
  const pts = cks.map(c => [x(c.date), y(c.energy), c]);
  g += `<path d="M${pts[0][0]},${y(1)} ${pts.map(p => `L${p[0]},${p[1]}`).join(" ")} L${pts.at(-1)[0]},${y(1)} Z" fill="var(--accent)" opacity=".1"/>`;
  g += `<polyline points="${pts.map(p => p[0] + "," + p[1]).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach(([px, py, c]) => {
    g += `<circle cx="${px}" cy="${py}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<circle cx="${px}" cy="${py}" r="14" fill="transparent" data-tip="${fmtDay(c.date)}|Energy ${c.energy}/5${c.sleep ? " · sleep " + c.sleep + " h" : ""}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Energy rating at each check-in">${g}</svg>`;
}
function wireCharts() {
  document.querySelectorAll(".chartbox").forEach(box => {
    const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; box.append(tip);
    box.addEventListener("pointermove", e => {
      const t = e.target.closest("[data-tip]"); if (!t) { tip.hidden = true; return; }
      const b = box.getBoundingClientRect(), r = t.getBoundingClientRect();
      tip.innerHTML = t.dataset.tip.split("|").map((l, i) => i ? esc(l) : `<b>${esc(l)}</b>`).join("<br>");
      tip.style.left = Math.min(b.width - 80, Math.max(80, r.left - b.left + r.width / 2 + box.scrollLeft)) + "px";
      tip.style.top = (e.clientY - b.top - 10) + "px"; tip.hidden = false;
    });
    box.addEventListener("pointerleave", () => tip.hidden = true);
  });
}

function viewCoach() {
  const sugg = ["Why does this week look like this?", "Can I move tomorrow's session?", "What should I eat before a hard session?", "I'm travelling next week with only a hotel gym"];
  return `<section class="card"><div><h3>Ask the Coach</h3><p class="small muted">The Coach sees your goals, plan, recent workouts, food and check-ins.</p></div>
    <div class="chat" id="chatlog">${S.chat.length ? S.chat.map((m, i) => `<div class="msg ${m.role === "user" ? "me" : "coach"}" ${i === S.chat.length - 1 && m.role === "assistant" ? 'id="chat-last"' : ""}>${esc(m.content || (S.busy.chat ? "Thinking…" : ""))}</div>`).join("") : `<div class="msg coach">Ask anything about your training: why a session changed, how to fit training around a busy week, or what a session should feel like.</div>`}</div>
    ${S.chat.length ? "" : `<div class="examples">${sugg.map(s => `<button data-act="suggest">${esc(s)}</button>`).join("")}</div>`}
    <form class="chatform" data-form="chat"><textarea id="chat-in" data-keep placeholder="Message the Coach" rows="2"></textarea><button class="btn primary" type="submit" ${S.busy.chat ? "disabled" : ""}>Send</button></form>
  </section>`;
}

/* ---------- onboarding: you → your sport → your goal ---------- */
function saveDraft() { lsSet("tc.draft2", S.draft); }
function draftSports() { const d = S.draft, s = [...(d.sports || [])]; if ((d.otherSport || "").trim()) s.push(d.otherSport.trim()); return s; }
function draftProfile() {
  const d = S.draft, sports = draftSports();
  const goals = Object.fromEntries(sports.map(sp => [sp, ((d.goals || {})[sp] || "").trim()]).filter(([, v]) => v));
  return { age: num(d.age), sex: d.sex || "", units: d.units || "Metric", heightCm: num(d.heightCm), weightKg: num(d.weightKg), sports, mainSport: sports.includes(d.mainSport) ? d.mainSport : sports[0], level: d.level || "Intermediate",
    goals, eventDate: d.eventDate || "", daysPerWeek: num(d.daysPerWeek, 4), sessionMinutes: num(d.sessionMinutes, 60), notes: (d.notes || "").trim(), diet: draftDiet() };
}
function profileToDraft(p) {
  const sports = p.sports || [];
  dietToDraft(p.diet);
  return { age: p.age, sex: p.sex, units: p.units || "Metric", heightCm: p.heightCm, weightKg: p.weightKg, level: SPORT_LEVELS.includes(p.level) ? p.level : "Intermediate",
    sports: sports.filter(s => SPORTS.includes(s)), otherSport: sports.filter(s => !SPORTS.includes(s)).join(", "),
    goals: { ...goalsOf(p) }, mainSport: p.mainSport, eventDate: p.eventDate || "", daysPerWeek: p.daysPerWeek || 4, sessionMinutes: p.sessionMinutes || 60,
    notes: [p.notes, p.limits, (p.equipment || []).length ? "Equipment: " + p.equipment.join(", ") : ""].filter(Boolean).join(". ") };
}
function validate(step) {
  const d = S.draft, e = [];
  if (step === 1) {
    if (!(num(d.age) >= 10 && num(d.age) <= 100)) e.push("Enter your age.");
    if (!(num(d.heightCm) >= 100 && num(d.heightCm) <= 230)) e.push("Enter your height.");
    if (!(num(d.weightKg) >= 25 && num(d.weightKg) <= 250)) e.push("Enter your weight.");
  }
  if (step === 2 && !draftSports().length) e.push("Pick at least one sport.");
  if (step === 3) {
    if (!draftSports().some(sp => ((d.goals || {})[sp] || "").trim().length >= 3)) e.push(draftSports().length > 1 ? "Write a goal for at least one sport." : "Tell us your goal in a few words.");
    if (d.eventDate && d.eventDate < addDays(today(), 7)) e.push("Pick a date at least a week away, or leave it empty.");
  }
  return e;
}
function stepper(n) {
  return `<ol class="stepper" aria-label="Setup progress">${["You", "Your sport", "Your goal", "Food"].map((s, i) => {
    const k = i + 1, inner = `<b>${k < n ? "✓" : k}</b>${s}`;
    return `<li class="${k === n ? "cur" : k < n ? "done" : ""}" ${k === n ? 'aria-current="step"' : ""}>${k < n ? `<button type="button" data-act="ob-go" data-n="${k}">${inner}</button>` : `<span>${inner}</span>`}</li>`;
  }).join("")}</ol>`;
}

function goalInputs() {
  const d = S.draft, sports = draftSports(), goals = d.goals || {};
  const box = (sp, i, label) => `<div class="${sports.length > 1 ? "sgoal-in" : "stack"}"><label class="f">${label}<textarea id="ob-goal-${i}" data-d="goal:${esc(sp)}" rows="${sports.length > 1 ? 2 : 3}" placeholder="${sports.length > 1 ? "Leave empty to just stay ready to play" : "e.g. I want to last the whole match without my legs dying in the second half"}">${esc(goals[sp] || "")}</textarea></label>
    <div class="examples">${goalExamples([sp]).map(x => `<button type="button" data-act="example" data-sport="${esc(sp)}">${esc(x)}</button>`).join("")}</div></div>`;
  if (sports.length <= 1) return `<h2>What do you want to achieve?</h2>${box(sports[0] || "", 0, `<span class="hint">Any goal, in your own words. Big or small, specific or vague.</span>`)}`;
  const main = sports.includes(d.mainSport) ? d.mainSport : sports[0];
  return `<h2>What do you want from each sport?</h2><p class="hint" style="margin-top:-6px">Any goal, in your own words. The Coach builds one weekly plan that covers all of them.</p>
    ${sports.map((sp, i) => box(sp, i, `${esc(sp)}`)).join("")}
    <div class="f">Which matters most right now?<div class="seg" role="group">${sports.map(sp => `<button type="button" data-chip="mainSport" data-v="${esc(sp)}" aria-pressed="${main === sp}">${esc(sp)}</button>`).join("")}</div></div>`;
}

function viewSetup() {
  const d = S.draft, n = S.setup;
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button type="button" data-chip="${key}" data-v="${esc(v)}" aria-pressed="${String(d[key]) === String(v)}">${esc(l)}</button>`; }).join("")}</div>`;
  const inp = (key, type, attrs = "") => `<input type="${type}" id="ob-${key}" data-d="${key}" value="${esc(d[key] ?? "")}" ${attrs}>`;
  const errs = (S.errors.ob || []).length ? `<p class="err" role="alert">${S.errors.ob.map(esc).join(" ")}</p>` : "";
  let h = "";
  if (n === 1 && !S.editing) h += `<section class="landing">
      <h1>A training plan that adjusts to your week</h1>
      <p class="lead">Tell us your sport and what you want to get better at, in your own words. The Coach builds the plan and changes it as you check in.</p>
      <div><button class="btn ghost" data-act="preview">See an example first →</button></div>
    </section>`;
  h += stepper(n);

  if (n === 1) {
    const imp = d.units === "Imperial";
    const [ft, inch] = d.heightCm ? cmToFtIn(num(d.heightCm)) : ["", ""];
    const hw = imp
      ? `<div class="f">Height<div class="unitpair"><input type="number" id="ob-ft" data-d="ft" placeholder="ft" aria-label="Feet" value="${esc(d.ftRaw ?? ft)}"><input type="number" id="ob-in" data-d="inch" placeholder="in" aria-label="Inches" value="${esc(d.inRaw ?? inch)}"></div></div>
         <label class="f">Weight (lb)<input type="number" id="ob-lb" data-d="lb" value="${esc(d.lbRaw ?? (d.weightKg ? Math.round(num(d.weightKg) / 0.45359) : ""))}"></label>`
      : `<label class="f">Height (cm)${inp("heightCm", "number", 'placeholder="172"')}</label><label class="f">Weight (kg)${inp("weightKg", "number", 'step="0.1" placeholder="68"')}</label>`;
    h += `<form class="card" data-form="ob" novalidate>
      <h2>About you</h2>
      <div class="grid3"><label class="f">Age${inp("age", "number", 'inputmode="numeric" placeholder="28"')}</label>${hw}</div>
      ${seg("units", ["Metric", "Imperial"])}
      <div class="f">Sex <span class="hint">Optional</span>${seg("sex", ["Female", "Male", "Prefer not to say"])}</div>
      <p class="banner warn small" id="u16" ${num(d.age) > 0 && num(d.age) < 16 ? "" : "hidden"}>Under 16: the Coach keeps loads light and skips maximal lifting. Train with a parent or coach who knows the plan.</p>
      ${errs}
      <div class="row"><button class="btn primary" type="submit">Next</button>${S.editing ? `<button type="button" class="btn ghost" data-act="cancel-setup">Cancel</button>` : ""}</div>
    </form>`;
  }

  if (n === 2) {
    h += `<form class="card" data-form="ob" novalidate>
      <h2>What do you play?</h2>
      <div class="sports" role="group" aria-label="Sports">${SPORTS.map(s => `<button type="button" class="sport" data-chip="sports" data-multi="1" data-v="${esc(s)}" aria-pressed="${(d.sports || []).includes(s)}">${esc(s)}</button>`).join("")}</div>
      <label class="f">Not listed?${inp("otherSport", "text", 'placeholder="e.g. Kabaddi, dance, ultimate frisbee"')}</label>
      <div class="f">How experienced are you?${seg("level", SPORT_LEVELS)}</div>
      ${errs}
      <div class="row"><button type="button" class="btn" data-act="ob-go" data-n="1">Back</button><button class="btn primary" type="submit">Next</button></div>
    </form>`;
  }

  if (n === 3) {
    h += `<form class="card" data-form="ob" novalidate>
      ${goalInputs()}
      <div class="f">Days a week you can train${seg("daysPerWeek", [2, 3, 4, 5, 6])}</div>
      <div class="f">Time per session${seg("sessionMinutes", [[30, "30 min"], [45, "45 min"], [60, "1 hour"], [90, "90 min"]])}</div>
      <label class="f"><span>By when? <span class="hint">Optional: a match, race, trial or season start</span></span>${inp("eventDate", "date", `min="${addDays(today(), 7)}"`)}</label>
      <label class="f"><span>Anything to work around? <span class="hint">Optional: injuries, equipment, team practice days</span></span><textarea id="ob-notes" data-d="notes" rows="2" placeholder="e.g. Team practice Tue and Thu, match on Saturday. Dumbbells at home. Sore left knee.">${esc(d.notes || "")}</textarea></label>
      ${errs}
      <div class="row"><button type="button" class="btn" data-act="ob-go" data-n="2">Back</button><button class="btn primary" type="submit">Next</button></div>
    </form>`;
  }

  if (n === 4) {
    h += `<form class="card" data-form="ob" novalidate>
      <div><h2>How do you eat?</h2><p class="hint">For your meal plans and daily food check. You can change this later.</p></div>
      ${dietFields()}
      ${S.errors.setup ? `<p class="err">${esc(S.errors.setup)}</p>` : ""}
      <div class="row">${S.busy.setup ? `<span class="thinking">The Coach is working out what your goals take and building the plan. Up to a minute…</span>` : `<button type="button" class="btn" data-act="ob-go" data-n="3">Back</button><button class="btn primary" type="submit">Build my plan</button>`}</div>
    </form>`;
  }
  return h;
}

/* ---------- food: targets, meal plans, daily reviews ---------- */
const DIET_TYPES = ["No restrictions", "Vegetarian", "Eggetarian", "Vegan", "Pescatarian", "Jain", "Halal"];
const DIET_AIMS = ["Fuel my training", "Lose fat", "Build muscle", "Keep my weight"];
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks & drinks"]];
const segH = (key, opts) => `<div class="seg" role="group">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button type="button" data-chip="${key}" data-v="${esc(v)}" aria-pressed="${String(S.draft[key]) === String(v)}">${esc(l)}</button>`; }).join("")}</div>`;
const dietOf = p => p?.diet || null;
const dietText = p => { const d = dietOf(p); return d ? `Diet: ${d.type}${d.avoid ? "; avoids " + d.avoid : ""}${d.cuisine ? "; usually eats " + d.cuisine : ""}; aim: ${d.aim}.` : "Diet: not set."; };
const fmtK = n => Math.round(n).toLocaleString();

/* Daily needs: Mifflin-St Jeor BMR × 1.35 for daily life, plus the net cost of that day's training
   (MET ≈ 2 + session effort), then the food aim. Protein by body weight, fat ~27%, carbs fill the rest. */
function targets(date) {
  const p = profile(), d = dietOf(p) || { aim: "Fuel my training" };
  const w = num(p.weightKg, 70), h = num(p.heightCm, 170), a = num(p.age, 30);
  const bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === "Male" ? 5 : p.sex === "Female" ? -161 : -78);
  const base = bmr * 1.35;
  const sessions = allSessions().filter(s => s.date === date && s.status !== "skipped" && s.type !== "rest" && s.minutes);
  const train = sessions.reduce((t, s) => t + (s.minutes / 60) * w * Math.max(0, 2 + s.rpe - 1.35), 0);
  const adj = d.aim === "Lose fat" && a >= 18 ? -0.15 : d.aim === "Build muscle" ? 0.1 : 0;
  const kcal = Math.round(((base + train) * (1 + adj)) / 50) * 50;
  const protein = Math.round(w * (d.aim === "Lose fat" || d.aim === "Build muscle" ? 2 : 1.6));
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, bmr: Math.round(bmr), base: Math.round(base), train: Math.round(train), adj, sessions };
}
const foodDoc = date => D()?.["food-" + date] || null;
/* A reviewed day keeps the target it was reviewed against, so later plan changes don't rewrite history. */
function dayTarget(date) { const f = foodDoc(date); return f?.targets || (f?.target ? { ...targets(date), kcal: f.target } : targets(date)); }
const planDoc = date => D()?.["meals-" + date] || null;
function foodTotals(res) { const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }; (res?.meals || []).forEach(m => { for (const k in t) t[k] += num(m[k]); }); return t; }
function intakeStatus(pct) {
  if (pct < 70) return ["bad", "Well under"];
  if (pct < 80) return ["warn", "Under target"];
  if (pct < 95) return ["good", "Close to target"];
  if (pct <= 120) return ["good", "On target"];
  return ["warn", "Over target"];
}
function trainingLine(date) {
  const ss = allSessions().filter(s => s.date === date && s.type !== "rest" && s.status !== "skipped");
  return ss.length ? ss.map(s => `${s.title} (${s.minutes} min, effort ${s.rpe}/10)`).join(", ") : "rest day";
}
function nutritionText(days = 3) {
  const out = [];
  for (let i = days; i >= 1; i--) { const dt = addDays(today(), -i), f = foodDoc(dt); if (f?.result) { const tt = foodTotals(f.result), tg = dayTarget(dt); out.push(`${dt}: ${fmtK(tt.kcal)} of ${fmtK(tg.kcal)} kcal, protein ${Math.round(tt.protein)}/${tg.protein} g`); } }
  return out.join("; ") || "not logged";
}
const NUTRITION_RULES = `You are also the athlete's sports-nutrition coach (not a dietitian; no medical diets). Strictly respect their diet type and foods they avoid. Prefer the foods and cuisine they normally eat, with portions in household measures plus grams. Time carbohydrate before and after hard sessions and spread protein across meals. Never praise eating far below needs; if intake keeps falling well short, tell them to eat more and suggest a sports dietitian or doctor if it continues. Under 18: no calorie deficits.`;

async function makeMealPlan(date) {
  const p = profile(), tg = targets(date);
  const prev = foodDoc(addDays(date, -1))?.result?.tomorrow || [];
  const prompt = `${NUTRITION_RULES}

Make a one-day meal plan for ${fmtDay(date)}.
Athlete: age ${p.age}, ${p.weightKg} kg, sports: ${(p.sports || []).join(", ")}. ${dietText(p)}
Training that day: ${trainingLine(date)}. Training the next day: ${trainingLine(addDays(date, 1))}.
Targets: ${tg.kcal} kcal, protein ${tg.protein} g, carbs ${tg.carbs} g, fat ${tg.fat} g. Hit them within about 5%.
${prev.length ? "Advice from the previous day's food review to build in: " + prev.join(" | ") : ""}
Use Breakfast, Lunch, Dinner and Snacks (snacks can be 1-2 small items, timed around training).

Reply with only JSON: {"meals":[{"meal":"Breakfast","time":"7:30","items":["2 besan chillas (120 g batter)","1 cup curd (200 g)"],"kcal":450,"protein":25,"carbs":50,"fat":15,"why":"short reason tied to training"}],"note":"one sentence on how the day is fuelled"}`;
  const r = await askJSON("mealplan", prompt);
  if (!r || !Array.isArray(r.meals)) { if (r) { S.errors.mealplan = "The meal plan came back incomplete. Try again."; render(); } return; }
  await put("meals-" + date, { kind: "meals", date, at: new Date().toISOString(), meals: r.meals.map(m => ({ meal: String(m.meal || ""), time: String(m.time || ""), items: Array.isArray(m.items) ? m.items.map(String) : [], kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat), why: m.why || "" })), note: r.note || "" });
}

async function checkFood(date) {
  const meals = {}; MEALS.forEach(([k]) => { meals[k] = ($("#food-" + k)?.value || "").trim(); });
  if (!Object.values(meals).some(Boolean)) { S.errors.food = "Write what you ate for at least one meal."; render(); return; }
  const p = profile(), tg = targets(date);
  const prompt = `${NUTRITION_RULES}

Estimate what the athlete ate on ${fmtDay(date)} and review it against their needs. Estimate portions realistically for their cuisine; when an amount isn't given, assume a typical portion and say what you assumed in "note".
Athlete: age ${p.age}, ${p.weightKg} kg, sports: ${(p.sports || []).join(", ")}. ${dietText(p)}
Training that day: ${trainingLine(date)}. Training tomorrow: ${trainingLine(addDays(date, 1))}.
Targets that day: ${tg.kcal} kcal, protein ${tg.protein} g, carbs ${tg.carbs} g, fat ${tg.fat} g.
What they ate:
${MEALS.map(([k, l]) => `${l}: ${meals[k] || "(nothing logged)"}`).join("\n")}

Reply with only JSON: {"meals":[{"meal":"Breakfast","kcal":0,"protein":0,"carbs":0,"fat":0,"note":"what you assumed, short"}],"summary":"1-2 sentences: how well the day fuelled their training and recovery","wentWell":["short"],"tomorrow":["3 concrete, specific changes for tomorrow that fit their diet and tomorrow's training"]}
Include one entry in "meals" for each meal they logged, using these names: ${MEALS.map(m => m[1]).join(", ")}.`;
  const r = await askJSON("food", prompt);
  if (!r || !Array.isArray(r.meals)) { if (r) { S.errors.food = "The estimate came back incomplete. Try again."; render(); } return; }
  const result = { meals: r.meals.map(m => ({ meal: String(m.meal || ""), kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat), note: m.note || "" })), summary: r.summary || "", wentWell: (r.wentWell || []).map(String), tomorrow: (r.tomorrow || []).map(String) };
  const { kcal, protein, carbs, fat } = foodDoc(date)?.targets || tg;
  await put("food-" + date, { kind: "food", date, at: new Date().toISOString(), meals, result, targets: { kcal, protein, carbs, fat } });
  if (S.draft.food) { delete S.draft.food[date]; saveDraft(); }
}

function dietFields() {
  const d = S.draft, age = num(d.age) || num(profile()?.age);
  return `<div class="f">What do you eat?${segH("dietType", DIET_TYPES)}</div>
    <div class="f">What do you want from food?${segH("dietAim", DIET_AIMS)}</div>
    ${d.dietAim === "Lose fat" && age && age < 18 ? `<p class="banner warn small">Under 18 there's no calorie cut. the Coach focuses on food quality and fuelling instead.</p>` : ""}
    <div class="grid3">
      <label class="f"><span>Food you usually eat <span class="hint">Optional</span></span><input type="text" id="diet-cuisine" data-d="dietCuisine" value="${esc(d.dietCuisine || "")}" placeholder="e.g. Indian home food, South Indian"></label>
      <label class="f"><span>Allergies or foods to avoid <span class="hint">Optional</span></span><input type="text" id="diet-avoid" data-d="dietAvoid" value="${esc(d.dietAvoid || "")}" placeholder="e.g. peanuts, lactose, mushrooms"></label>
    </div>`;
}
const draftDiet = () => ({ type: S.draft.dietType || "No restrictions", aim: S.draft.dietAim || "Fuel my training", cuisine: (S.draft.dietCuisine || "").trim(), avoid: (S.draft.dietAvoid || "").trim() });
function dietToDraft(diet) { if (diet) Object.assign(S.draft, { dietType: diet.type, dietAim: diet.aim, dietCuisine: diet.cuisine, dietAvoid: diet.avoid }); }

const meter = (val, target, cls = "") => `<div class="meter ${cls}" role="img" aria-label="${Math.round(val)} of ${Math.round(target)}"><i style="width:${Math.min(100, target ? (val / target) * 100 : 0)}%"></i></div>`;

function viewFood() {
  const p = profile(), diet = dietOf(p);
  if (!diet || S.dietEdit) {
    return `<section class="card"><div><h2>${diet ? "Food preferences" : "Set up food tracking"}</h2><p class="small muted">The Coach uses this for your meal plans and daily reviews.</p></div>
      ${dietFields()}
      <div class="row"><button class="btn primary" data-act="save-diet">Save</button>${diet ? `<button class="btn ghost" data-act="cancel-diet">Cancel</button>` : ""}</div></section>`;
  }
  const t = today(), off = { yesterday: -1, tomorrow: 1 }[S.foodDay] || 0, date = addDays(t, off), isToday = off === 0;
  const dayWord = ["Yesterday", "Today", "Tomorrow"][off + 1], dayLower = dayWord.toLowerCase();
  const live = targets(date), fd = foodDoc(date), mp = planDoc(date), tg = fd?.targets ? { ...live, ...fd.targets } : live;
  const other = isToday ? targets(addDays(t, 1)) : dayTarget(t);
  const tot = fd?.result ? foodTotals(fd.result) : null;
  let h = `<div class="seg" role="group" aria-label="Day">${[["yesterday", "Yesterday"], ["today", "Today"], ["tomorrow", "Tomorrow"]].map(([k, l]) => `<button type="button" data-act="food-day" data-v="${k}" aria-pressed="${(S.foodDay || "today") === k}">${l}${k === "yesterday" && !foodDoc(addDays(t, -1))?.result ? " · not logged" : ""}</button>`).join("")}</div>`;

  // targets (and today's intake against them)
  h += `<section class="card"><div class="eyebrow">${dayWord} · ${fmtDay(date)} · ${tg.sessions.length ? "training day" : "rest day"}</div>`;
  if (tot) {
    const pct = Math.round((tot.kcal / tg.kcal) * 100), [cls, word] = intakeStatus(pct);
    h += `<div class="row between"><div class="big">${fmtK(tot.kcal)} <span class="muted" style="font-size:.5em">of ${fmtK(tg.kcal)} kcal</span></div><span class="pill ${cls}"><span class="dot"></span>${word} · ${pct}%</span></div>${meter(tot.kcal, tg.kcal, cls)}`;
  } else h += `<div class="big">${fmtK(tg.kcal)} kcal</div>`;
  const diff = tg.kcal - other.kcal;
  h += `<p class="small muted">Everyday needs ${fmtK(Math.round(live.base * (1 + live.adj) / 50) * 50)} + training ${fmtK(Math.round(live.train * (1 + live.adj) / 50) * 50)} kcal${live.sessions.length ? " for " + live.sessions.map(s => `${esc(s.title)} (${s.minutes} min)`).join(", ") : ", rest day"}.${diff && Math.abs(diff) >= 50 ? ` ${fmtK(Math.abs(diff))} kcal ${diff > 0 ? "more" : "less"} than ${isToday ? "tomorrow" : "today"}, because ${dayLower} has ${diff > 0 ? "more" : "less"} training.` : ""}${fd?.targets && fd.targets.kcal !== live.kcal ? " Locked to the target your day was reviewed against." : ""}</p>`;
  h += `<div class="macros">${[["protein", "Protein"], ["carbs", "Carbs"], ["fat", "Fat"]].map(([k, l]) => `<div class="macro"><span class="small muted">${l}</span><strong>${tot ? `${Math.round(tot[k])} <span class="muted small">/ ${tg[k]} g</span>` : `${tg[k]} g`}</strong>${tot ? meter(tot[k], tg[k]) : ""}</div>`).join("")}</div>
    <details class="more"><summary>How this target is worked out</summary><p class="small muted" style="margin-top:6px">Resting burn ${fmtK(tg.bmr)} kcal (from your age, height, weight${p.sex === "Male" || p.sex === "Female" ? " and sex" : ""}) × 1.35 for daily life = ${fmtK(tg.base)} kcal, plus about ${fmtK(tg.train)} kcal for training${tg.adj ? `, then ${tg.adj > 0 ? "+" : ""}${Math.round(tg.adj * 100)}% to ${esc(diet.aim.toLowerCase())}` : ""}. Protein ${tg.protein >= num(p.weightKg) * 2 ? "2.0" : "1.6"} g per kg of body weight, fat about 27% of calories, carbs the rest. These are estimates; adjust if your weight or energy says otherwise.</p></details>
  </section>`;

  // meal plan
  if (off >= 0) h += `<section class="card"><div class="row between"><h3>${dayWord}'s meal plan</h3>${S.busy.mealplan ? `<span class="thinking">Planning meals…</span>` : `<button class="btn ${mp ? "" : "primary"} small" data-act="mealplan" data-date="${date}">${mp ? "Make a new one" : "Make my meal plan"}</button>`}</div>
    ${S.errors.mealplan ? `<p class="err">${esc(S.errors.mealplan)}</p>` : ""}
    ${mp ? `<div>${mp.meals.map(m => `<div class="item"><div class="row between"><strong>${esc(m.meal)}${m.time ? ` <span class="muted small">${esc(m.time)}</span>` : ""}</strong><span class="small muted">${fmtK(m.kcal)} kcal · ${Math.round(m.protein)} g protein</span></div><ul class="plain small">${m.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>${m.why ? `<p class="small muted">${esc(m.why)}</p>` : ""}</div>`).join("")}</div>${mp.note ? `<p class="small">${esc(mp.note)}</p>` : ""}`
      : `<p class="muted">${esc(diet.type)} meals${diet.cuisine ? " from " + esc(diet.cuisine) : ""}, sized to ${fmtK(tg.kcal)} kcal and timed around ${tg.sessions.length ? "your training" : "a rest day"}.${!isToday && foodDoc(t)?.result?.tomorrow?.length ? " Includes the tips from today's review." : ""}</p>`}
  </section>`;

  // log + review (today only)
  if (off <= 0) {
    const saved = fd?.meals || {}, dr = (S.draft.food || {})[date] || {};
    h += `<section class="card"><div><h3>What did you eat ${dayLower}?</h3><p class="small muted">Write it how you'd say it. Amounts help: "2 rotis", "a big bowl of dal".</p></div>
      ${MEALS.map(([k, l]) => `<label class="f">${l}<textarea id="food-${k}" data-d="food:${k}" data-date="${date}" rows="2" placeholder="${{ breakfast: "e.g. 2 eggs, 2 toast with butter, chai", lunch: "e.g. rice, dal, aloo sabzi, curd", dinner: "e.g. 3 rotis, paneer curry, salad", snacks: "e.g. banana before training, protein shake, 2 biscuits" }[k]}">${esc(dr[k] ?? saved[k] ?? "")}</textarea></label>`).join("")}
      ${S.errors.food ? `<p class="err">${esc(S.errors.food)}</p>` : ""}
      <div class="row">${S.busy.food ? `<span class="thinking">Estimating your day…</span>` : `<button class="btn primary" data-act="checkfood" data-date="${date}">${fd ? "Check again" : "Check my day"}</button>${mp ? `<button class="btn ghost" data-act="fill-plan" data-date="${date}">I ate the meal plan</button>` : ""}`}</div>
    </section>`;
    if (fd?.result) h += foodReview(fd, tg, isToday);
  }

  // last 7 days
  const days = []; for (let i = 6; i >= 0; i--) { const dt = addDays(t, -i), f = foodDoc(dt); if (f?.result) days.push([dt, foodTotals(f.result), dayTarget(dt)]); }
  if (days.length) h += `<section class="card"><h3>Last 7 days</h3><div>${days.reverse().map(([dt, tt, tgx]) => { const pct = Math.round((tt.kcal / tgx.kcal) * 100), [cls] = intakeStatus(pct);
      return `<div class="item"><div class="row between"><span class="small">${dt === t ? "Today" : fmtDay(dt)}</span><span class="small mono">${fmtK(tt.kcal)} / ${fmtK(tgx.kcal)} kcal · ${Math.round(tt.protein)} g protein</span></div>${meter(tt.kcal, tgx.kcal, cls)}</div>`; }).join("")}</div></section>`;

  h += foodTracker();
  h += `<p class="small muted">${esc(diet.type)} · ${esc(diet.aim)}${diet.cuisine ? " · " + esc(diet.cuisine) : ""}${diet.avoid ? " · avoids " + esc(diet.avoid) : ""} <button class="btn ghost small" data-act="edit-diet">Edit food preferences</button></p>`;
  return h;
}

/* Tracker: hit = 95–120% of the day's calorie target, close = 80–95%, otherwise just logged. */
function foodStatus(date) {
  const f = foodDoc(date); if (!f?.result) return { st: "none", pct: 0 };
  const pct = Math.round((foodTotals(f.result).kcal / dayTarget(date).kcal) * 100);
  return { st: pct >= 95 && pct <= 120 ? "hit" : pct >= 80 && pct < 95 ? "close" : "logged", pct };
}
function foodTracker() {
  const t = today(), dow = (parse(t).getDay() + 6) % 7, end = addDays(t, 6 - dow), start = addDays(end, -27);
  const cells = [], past = [];
  for (let i = 0; i < 28; i++) {
    const dt = addDays(start, i), fut = dt > t, s = fut ? { st: "future" } : foodStatus(dt);
    if (!fut) past.push([dt, s]);
    const label = fut ? "" : s.st === "none" ? (dt === t ? "Not logged yet" : "Not logged") : `${s.pct}% of target${s.pct > 120 ? " (over)" : ""}`;
    cells.push(`<div class="tcell ${s.st}${dt === t ? " today" : ""}" title="${fmtDay(dt)}${label ? ": " + label : ""}" aria-label="${fmtDay(dt)}${label ? ": " + label : ""}">${parse(dt).getDate()}</div>`);
  }
  const counted = past.filter(([dt, s]) => dt !== t || s.st !== "none");
  const logged = counted.filter(([, s]) => s.st !== "none").length;
  const good = counted.filter(([, s]) => s.st === "hit" || s.st === "close").length;
  let streak = 0; for (let i = foodStatus(t).st === "none" ? 1 : 0; i < 365; i++) { if (foodStatus(addDays(t, -i)).st === "none") break; streak++; }
  return `<section class="card"><div><h3>Food tracker</h3><p class="small muted">Last 4 weeks. Close means at least 80% of the day's calorie target.</p></div>
    <div class="tstats">
      <div><span class="v">${logged}<span class="muted small"> / ${counted.length}</span></span><span class="small muted">days logged</span></div>
      <div><span class="v">${good}<span class="muted small"> / ${logged || 0}</span></span><span class="small muted">hit or close</span></div>
      <div><span class="v">${streak}</span><span class="small muted">day logging streak</span></div>
    </div>
    <div class="tgrid">${["M", "T", "W", "T", "F", "S", "S"].map(d => `<div class="th">${d}</div>`).join("")}${cells.join("")}</div>
    <div class="legend"><span><i class="tkey hit"></i>Hit (95%+)</span><span><i class="tkey close"></i>Close (80%+)</span><span><i class="tkey logged"></i>Logged, below 80% or well over</span><span><i class="tkey none"></i>Not logged</span></div>
  </section>`;
}

function foodReview(fd, tg, isToday) {
  const r = fd.result, tot = foodTotals(r);
  return `<section class="card"><h3>Your day, reviewed</h3>
    <p><strong>${esc(r.summary)}</strong></p>
    <div class="tablewrap"><table class="t"><thead><tr><th>Meal</th><th class="n">kcal</th><th class="n">Protein</th><th class="n">Carbs</th><th class="n">Fat</th></tr></thead><tbody>
      ${r.meals.map(m => `<tr><td>${esc(m.meal)}${m.note ? `<div class="small muted">${esc(m.note)}</div>` : ""}</td><td class="n">${fmtK(m.kcal)}</td><td class="n">${Math.round(m.protein)}</td><td class="n">${Math.round(m.carbs)}</td><td class="n">${Math.round(m.fat)}</td></tr>`).join("")}
      <tr><td><strong>Total</strong></td><td class="n"><strong>${fmtK(tot.kcal)}</strong></td><td class="n"><strong>${Math.round(tot.protein)}</strong></td><td class="n"><strong>${Math.round(tot.carbs)}</strong></td><td class="n"><strong>${Math.round(tot.fat)}</strong></td></tr>
      <tr><td class="muted">Target</td><td class="n muted">${fmtK(tg.kcal)}</td><td class="n muted">${tg.protein}</td><td class="n muted">${tg.carbs}</td><td class="n muted">${tg.fat}</td></tr>
    </tbody></table></div>
    ${r.wentWell.length ? `<div class="stack"><span class="eyebrow">What went well</span><ul class="plain">${r.wentWell.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${r.tomorrow.length ? `<div class="change"><strong>For tomorrow</strong><ul class="plain">${r.tomorrow.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${isToday ? `<div><button class="btn" data-act="plan-tomorrow">Plan tomorrow's meals with these tips</button></div>` : ""}
    <p class="small muted">Estimates from your description, usually within 15–20%.</p>
  </section>`;
}

/* ---------- events ---------- */
function flagCheck() {
  const t = $("#ck-text"), f = $("#ck-flag"); if (!t || !f) return;
  const hit = RED_FLAGS.test(t.value); f.hidden = !hit;
  f.textContent = hit ? "That can be a sign of injury. The Coach will review it, but don't train through it." : "";
}
document.addEventListener("click", e => {
  const tab = e.target.closest("[data-tab]");
  if (tab) { S.tab = tab.dataset.tab; lsSet("tc.tab", S.tab); S.openLog = null; render(); window.scrollTo(0, 0); return; }
  const ch = e.target.closest("[data-chip]");
  if (ch) {
    const k = ch.dataset.chip, v = ch.dataset.v;
    if (ch.dataset.multi) { const a = new Set(S.draft[k] || []); a.has(v) ? a.delete(v) : a.add(v); S.draft[k] = [...a]; }
    else S.draft[k] = /^\d+$/.test(v) ? +v : v;
    if (k === "units") { delete S.draft.ftRaw; delete S.draft.inRaw; delete S.draft.lbRaw; }
    saveDraft(); render(); return;
  }
  const spb = e.target.closest("[data-sport]:not([data-act])");
  if (spb) { S.sport = spb.dataset.sport; lsSet("tc.sport", S.sport); S.openLog = null; render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case "start-setup": if (S.docs.profile) { S.editing = true; Object.assign(S.draft, profileToDraft(S.docs.profile)); } S.preview = false; S.setup = +b.dataset.step || 1; S.confirmReset = false; S.errors.setup = S.errors.ob = null; render(); window.scrollTo(0, 0); break;
    case "cancel-setup": S.setup = 0; S.editing = false; render(); break;
    case "preview": S.preview = true; S.setup = 0; S.tab = "today"; render(); window.scrollTo(0, 0); break;
    case "ob-go": S.setup = +b.dataset.n; S.errors.ob = null; render(); window.scrollTo(0, 0); break;
    case "example": S.draft.goals = { ...(S.draft.goals || {}), [b.dataset.sport]: b.textContent }; saveDraft(); render(); break;
    case "ask-reset": S.confirmReset = true; render(); break;
    case "cancel-reset": S.confirmReset = false; render(); break;
    case "checkin": checkIn(); break;
    case "planweek": planWeek(+b.dataset.n); break;
    case "patterns": findPatterns(); break;
    case "done": logSession(id, "done"); break;
    case "skip": logSession(id, "skipped"); break;
    case "openlog": S.openLog = id; render(); break;
    case "toggle-add": S.addOpen = !S.addOpen; render(); break;
    case "dellog": {
      const l = D()[id]; del(id);
      if (l?.sessionId) { const np = clone(plan()); const s = np.weeks.flatMap(w => w.sessions || []).find(x => x.id === l.sessionId); if (s) { s.status = "planned"; put("plan", np); } }
      break;
    }
    case "suggest": sendChat(b.textContent); break;
    case "load-ex": S.errors["ex-" + id] = null; loadExercises(id); break;
    case "food-day": S.foodDay = b.dataset.v; render(); break;
    case "edit-diet": dietToDraft(dietOf(profile())); S.dietEdit = true; render(); break;
    case "cancel-diet": S.dietEdit = false; render(); break;
    case "save-diet": S.dietEdit = false; put("profile", { ...profile(), diet: draftDiet() }); break;
    case "mealplan": makeMealPlan(b.dataset.date); break;
    case "checkfood": checkFood(b.dataset.date); break;
    case "plan-tomorrow": S.foodDay = "tomorrow"; render(); window.scrollTo(0, 0); makeMealPlan(addDays(today(), 1)); break;
    case "fill-plan": {
      const mp = planDoc(b.dataset.date); if (!mp) break;
      const map = { breakfast: /break/i, lunch: /lunch/i, dinner: /dinner|supper/i, snacks: /snack/i };
      const f = (S.draft.food ||= {})[b.dataset.date] = {};
      MEALS.forEach(([k]) => { f[k] = mp.meals.filter(m => map[k].test(m.meal)).flatMap(m => m.items).join(", "); });
      saveDraft(); render(); break;
    }
  }
});
document.addEventListener("input", e => {
  if (e.target.id === "ck-text") flagCheck();
  const k = e.target.dataset?.d; if (!k) return;
  const d = S.draft, v = e.target.value;
  if (k === "ft" || k === "inch") { d[k === "ft" ? "ftRaw" : "inRaw"] = v; const ft = num(d.ftRaw ?? $("#ob-ft")?.value), inch = num(d.inRaw ?? $("#ob-in")?.value); d.heightCm = ft || inch ? Math.round((ft * 12 + inch) * 2.54) : ""; }
  else if (k === "lb") { d.lbRaw = v; d.weightKg = v ? Math.round(num(v) * 0.45359 * 10) / 10 : ""; }
  else if (k.startsWith("goal:")) d.goals = { ...(d.goals || {}), [k.slice(5)]: v };
  else if (k.startsWith("food:")) { const dt = e.target.dataset.date || today(); d.food ||= {}; d.food[dt] = { ...(d.food[dt] || {}), [k.slice(5)]: v }; }
  else d[k] = v;
  saveDraft();
  if (k === "age") { const u = $("#u16"); if (u) u.hidden = !(num(v) > 0 && num(v) < 16); }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]"); if (!f) return; e.preventDefault();
  const v = id => document.getElementById(id)?.value ?? "";
  const form = f.dataset.form;
  if (form === "ob") {
    S.errors.ob = validate(S.setup);
    if (S.errors.ob.length) { render(); return; }
    if (S.setup < 4) { S.setup++; render(); window.scrollTo(0, 0); } else buildPlan(draftProfile());
  } else if (form === "logdiff") {
    logSession(f.dataset.id, "done", v("lg-min"), v("lg-rpe"));
  } else if (form === "extralog") {
    const title = v("x-title").trim(); if (!title) return;
    const id = uid("e"); put(id, { kind: "log", id, date: v("x-date") || today(), at: new Date().toISOString(), type: "sport", for: normFor(v("x-sport") || "All", sportsOf()), title, minutes: num(v("x-min"), 30), rpe: Math.min(10, Math.max(1, num(v("x-rpe"), 5))), notes: "" });
    S.addOpen = false; toast("Workout added");
  } else if (form === "chat") {
    const t = $("#chat-in"); const val = t.value; t.value = ""; sendChat(val);
  }
});
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.matches?.("details[data-vid]")) return;
  const id = d.dataset.vid;
  if (d.open) {
    S.vidOpen = id;
    const s = allSessions().find(x => x.id === id);
    if (s && !s.exercises && !S.busy["ex-" + id] && !S.errors["ex-" + id]) loadExercises(id);
  } else if (S.vidOpen === id) S.vidOpen = null;
}, true);
document.addEventListener("keydown", e => { if (e.target.id === "chat-in" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });

/* Move to the new day at midnight, and when the page comes back after the phone slept. */
let lastDay = today();
function checkDay() {
  const t = today(); if (t === lastDay) return;
  lastDay = t;
  if (S.draft.food) { for (const dt of Object.keys(S.draft.food)) if (dt < addDays(t, -1)) delete S.draft.food[dt]; saveDraft(); }
  S.openLog = null; render();
  if (S.ready && !S.setup) toast(`New day: ${fmtDay(t)}`);
}
setInterval(checkDay, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDay(); });
window.addEventListener("focus", checkDay);

initStore();
})();
