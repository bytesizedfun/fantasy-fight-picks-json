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
const allowlist = new Set([
  FRONTEND_ORIGIN,
  "http://localhost:3000",
  "http://localhost:5173",
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowlist.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "false");
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Session-Token"
  );
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

// Static (serve the frontend/PWA)
app.use(express.static("public"));

// --- Proxy helpers ---
async function gasGet(route) {
  const url = `${GAS_URL}?route=${encodeURIComponent(route)}`;
  const r = await fetch(url, { method: "GET", timeout: 15000 });
  if (!r.ok) throw new Error(`/gas ${route} ${r.status}`);
  return r.json();
}
async function gasPost(route, payload) {
  const url = `${GAS_URL}?route=${encodeURIComponent(route)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeout: 20000,
  });
  if (!r.ok) throw new Error(`/gas ${route} ${r.status} ${await r.text()}`);
  return r.json();
}

// --- Public API (frontend) ---
app.get("/api/health", async (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get("/api/meta", async (req, res) => {
  const data = await gasGet("meta");
  res.json(data);
});
app.get("/api/fights", async (req, res) => res.json(await gasGet("fights")));
app.get("/api/results", async (req, res) => res.json(await gasGet("results")));
app.get("/api/weekly", async (req, res) => res.json(await gasGet("weekly")));
app.get("/api/alltime", async (req, res) => res.json(await gasGet("alltime")));

app.post("/api/login", async (req, res) => {
  const { username, pin } = req.body || {};
  if (!username || !/^\d{4}$/.test(pin))
    return res.status(400).json({ error: "Invalid login" });
  try {
    const data = await gasPost("login", { username, pin });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || "Login failed" });
  }
});

app.get("/api/picks/mine", async (req, res) => {
  const token = req.headers["x-session-token"] || "";
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const data = await gasGet(
      `picks_mine&token=${encodeURIComponent(token)}`
    );
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: "Failed" });
  }
});

app.post("/api/picks", async (req, res) => {
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
  if (!ADMIN_API_KEY) {
    console.warn("ADMIN_API_KEY missing");
    return;
  }
  const { url } = await fetchEventUrlFromMeta();
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
  const fights = [];

  // NOTE: UFCStats markup changes sometimes. This is a conservative parse.
  $(".b-fight-details__table-row").each((_, tr) => {
    const cols = $(tr).find(".b-fight-details__table-col");
    if (cols.length < 2) return;

    // bout name
    const names = $(cols[1]).text().trim().replace(/\s+/g, " ");
    const fight = names || $(cols[0]).text().trim();
    if (!fight) return;

    // result (winner)
    let winner = "";
    const resultCol = $(cols[0]).text().trim();
    const m =
      /([A-Za-z' .-]+)\s+def\.\s+([A-Za-z' .-]+)/i.exec(resultCol) || null;
    if (m) winner = m[1].trim();

    // method + round
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

    if (winner) fights.push({ fight, winner, method, round });
  });

  if (!fights.length) return;

  // 🔐 IMPORTANT: include _adminKey in the BODY (GAS reads body, not headers)
  await gasPost("admin_results_update", {
    _adminKey: ADMIN_API_KEY,
    fights,
  });
}

async function scrapeLoop() {
  try {
    await scrapeAndPublish();
  } catch (e) {
    // silent
  }
  setTimeout(scrapeLoop, 30_000);
}

if (process.env.SCRAPE_LOOP === "1") {
  scrapeLoop();
}

// Manual trigger
app.post("/api/admin/scrape", async (req, res) => {
  const key = req.headers["x-admin-key"] || req.body?._adminKey || "";
  if (key !== ADMIN_API_KEY) return res.status(401).json({ error: "forbidden" });
  try {
    await scrapeAndPublish();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "scrape failed" });
  }
});

app.listen(PORT, () => console.log(`Server on :${PORT}`));
