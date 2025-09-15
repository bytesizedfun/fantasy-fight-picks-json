// Express proxy + scraper (Render-ready)
// Security: CORS allowlist, rate limits, admin API key for scraper writes

const express = require("express");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// === ENV ===
// MUST SET on Render:
// GAS_URL: your deployed Apps Script web app URL (ending with /exec)
// FRONTEND_ORIGIN: your site origin (e.g., https://fantasy-fight-picks-json.onrender.com)
// ADMIN_API_KEY: random string for posting results into GAS
const GAS_URL = process.env.GAS_URL || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

// CORS
const allowlist = new Set([FRONTEND_ORIGIN, "http://localhost:3000", "http://localhost:5173"]);
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  if (origin && allowlist.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "false");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Token, X-Admin-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "200kb" }));

// Rate limits
const readLimiter = rateLimit({ windowMs: 60_000, max: 60 });
const writeLimiter = rateLimit({ windowMs: 60_000, max: 10 });
app.use("/api", readLimiter);
app.use("/api/login", writeLimiter);
app.use("/api/picks", writeLimiter);

// Static (for PWA assets if you deploy frontend here as well)
app.use(express.static("public"));

// --- Proxy helpers ---
async function gasGet(route) {
  const url = `${GAS_URL}?route=${encodeURIComponent(route)}`;
  const r = await fetch(url, { method: "GET", timeout: 15000 });
  if (!r.ok) throw new Error(`/gas ${route} ${r.status}`);
  return r.json();
}
async function gasPost(route, payload, headers = {}) {
  const url = `${GAS_URL}?route=${encodeURIComponent(route)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json", ...headers },
    body: JSON.stringify(payload),
    timeout: 20000
  });
  if (!r.ok) throw new Error(`/gas ${route} ${r.status} ${await r.text()}`);
  return r.json();
}

// --- Public API (frontend) ---
app.get("/api/health", async (req,res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get("/api/meta", async (req,res) => {
  const data = await gasGet("meta");
  res.json(data);
});
app.get("/api/fights", async (req,res) => res.json(await gasGet("fights")));
app.get("/api/results", async (req,res) => res.json(await gasGet("results")));
app.get("/api/weekly", async (req,res) => res.json(await gasGet("weekly")));
app.get("/api/alltime", async (req,res) => res.json(await gasGet("alltime")));

app.post("/api/login", async (req,res) => {
  const { username, pin } = req.body || {};
  if (!username || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: "Invalid login" });
  try {
    const data = await gasPost("login", { username, pin });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || "Login failed" });
  }
});

app.get("/api/picks/mine", async (req,res) => {
  const token = req.headers["x-session-token"] || "";
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const data = await gasGet(`picks_mine&token=${encodeURIComponent(token)}`);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: "Failed" });
  }
});

app.post("/api/picks", async (req,res) => {
  const token = req.headers["x-session-token"] || "";
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const data = await gasPost("picks", { token, picks: req.body?.picks || [] });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || "Save failed" });
  }
});

// --- Scraper (UFCStats) ---
let LAST_SCRAPE = { html: "", at: 0 };

async function fetchEventUrlFromMeta() {
  const meta = await gasGet("meta");
  return { url: meta.event_url || "", status: meta.status || "scheduled" };
}

async function scrapeAndPublish() {
  if (!ADMIN_API_KEY) { console.warn("ADMIN_API_KEY missing"); return; }
  const { url, status } = await fetchEventUrlFromMeta();
  if (!url) return;

  // Don't hammer: cache HTML for 30s
  const now = Date.now();
  let html = "";
  if (now - LAST_SCRAPE.at < 30_000 && LAST_SCRAPE.html) {
    html = LAST_SCRAPE.html;
  } else {
    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) return;
    html = await r.text();
    LAST_SCRAPE = { html, at: now };
  }

  const $ = cheerio.load(html);
  // This selector may need tweaking if UFCStats markup changes:
  const fights = [];
  $(".b-fight-details__table-row").each((_, tr) => {
    const cols = $(tr).find(".b-fight-details__table-col");
    if (cols.length < 2) return;
    const names = $(cols[1]).text().trim().replace(/\s+/g," ");
    const bout = names || $(cols[0]).text().trim();
    const resultCol = $(cols[0]).text().trim();
    // Heuristic parse — you can refine as needed:
    const m = /(\b[A-Za-z' .-]+)\s+def\.\s+([A-Za-z' .-]+)/i.exec(resultCol) || null;
    let winner = "";
    if (m) winner = m[1].trim();

    // Pull method/round if available
    let method = "";
    let round = "";
    const methodCol = $(cols[6]).text().trim();
    if (methodCol) {
      if (/KO|TKO/i.test(methodCol)) method = "KO/TKO";
      else if (/SUB/i.test(methodCol)) method = "Submission";
      else if (/DEC/i.test(methodCol)) method = "Decision";
    }
    const roundCol = $(cols[8]).text().trim();
    if (roundCol) round = roundCol;

    if (bout) fights.push({ fight: bout, winner, method, round });
  });

  if (!fights.length) return;

  await gasPost("admin_results_update", { fights }, { "X-Admin-Key": ADMIN_API_KEY });
  if (status === "scheduled") {
    // Flip status to live is optional (handled on Sheets if desired)
  }
}

let loopActive = false;
async function scrapeLoop() {
  try { await scrapeAndPublish(); } catch(e){ /* silent */ }
  setTimeout(scrapeLoop, 30_000);
}

// Optional auto loop
if (process.env.SCRAPE_LOOP === "1") {
  loopActive = true;
  scrapeLoop();
}

// Manual trigger
app.post("/api/admin/scrape", async (req,res) => {
  if ((req.headers["x-admin-key"] || "") !== ADMIN_API_KEY) return res.status(401).json({ error: "forbidden" });
  try { await scrapeAndPublish(); res.json({ ok: true }); } catch(e){ res.status(500).json({ error: "scrape failed" }); }
});

app.listen(PORT, () => console.log(`Server on :${PORT}`));
