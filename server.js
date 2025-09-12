// server.js
// Simple Express server: GAS bridge + hardened UFCStats scraper + health + short in-memory cache

const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

// Native fetch is built-in on Node >= 18
const hasFetch = typeof fetch === "function";

// Try to load compression, but don’t crash if it’s missing
let compression = null;
try { compression = require("compression"); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CONFIG ----------
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

const UFC_BASE = "http://www.ufcstats.com";

// ---------- MIDDLEWARE ----------
if (compression) app.use(compression({ level: 6 }));

// No-cache for API
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});

app.use(express.json());

// Static files
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    lastModified: true,
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      if (/\.(css|js|png|jpg|jpeg|gif|svg|woff2?)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    }
  })
);

// Optional: fallback to index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- TINY IN-MEM CACHE ----------
const cache = new Map();
function remember(key, ttlMs, supplier) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now < hit.exp) return Promise.resolve(hit.val);
  return supplier().then(val => {
    cache.set(key, { exp: now + ttlMs, val });
    return val;
  });
}

// ---------- HELPERS ----------
async function safeJson(resp) {
  const text = await resp.text();
  try { return { ok: true, json: JSON.parse(text), raw: text, status: resp.status }; }
  catch { return { ok: false, json: null, raw: text, status: resp.status }; }
}

async function fetchTextWithTimeout(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

const cleanMethod = (s) => (s || "").replace(/\s*\(.*?\)\s*/g, "").replace(/\s+/g, " ").trim();
const cleanRound  = (r) => { const rr = String(r || "").trim(); return !rr || rr === "0" ? "1" : rr; };

function parseUfcstatsEvent(html) {
  const $ = cheerio.load(html);
  const rows = $('tr.b-fight-details__table-row.b-fight-details__table-row__hover');
  const bouts = [];

  rows.each((_, tr) => {
    const t = $(tr);
    const links = t.find('a.b-link.b-link_style_black[href*="/fighter-details/"]');
    const redName = links.eq(0).text().trim();
    const blueName = links.eq(1).text().trim();

    const winRed = /win/i.test(t.find('i.b-fight-details__person-status--red').text());
    const winBlue = /win/i.test(t.find('i.b-fight-details__person-status--blue').text());
    const winner = winRed ? redName : winBlue ? blueName : "";

    const methodCell =
      t.find('p.b-fight-details__table-text:contains("Method:")').next().text().trim() ||
      t.find('td.b-fight-details__table-col').eq(6).text().trim();
    const rdCell =
      t.find('p.b-fight-details__table-text:contains("Round:")').next().text().trim() ||
      t.find('td.b-fight-details__table-col').eq(7).text().trim();

    const method = cleanMethod(methodCell);
    const round = cleanRound(rdCell);
    const fight = redName && blueName ? `${redName} vs ${blueName}` : "";

    if (fight && winner && method) bouts.push({ fight, winner, method, round });
  });

  return bouts;
}

// ---------- API ROUTES ----------

// Lockout (kept)
const lockoutTime = new Date("2025-08-16T18:00:00-04:00");
app.get("/api/lockout", (req, res) => res.json({ locked: new Date() >= lockoutTime }));

// Fights (30s cache)
app.get("/api/fights", async (_req, res) => {
  try {
    const data = await remember("fights", 30_000, async () => {
      const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, { headers: { "Cache-Control": "no-cache" } });
      const parsed = await safeJson(r);
      if (!parsed.ok) throw new Error(`GAS getFights not JSON: ${parsed.raw.slice(0,200)}`);
      return parsed.json;
    });
    res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("getFights error:", e);
    res.status(502).json({ error: "Failed to fetch fights" });
  }
});

// Submit picks (no cache)
app.post("/api/submit", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    const parsed = await safeJson(r);
    if (!parsed.ok) return res.status(502).json({ success: false, error: "Upstream not JSON", upstream: parsed.raw.slice(0, 300) });
    // Bust leaderboard cache quickly
    cache.delete("leaderboard");
    res.json(parsed.json);
  } catch (e) {
    console.error("submitPicks error:", e);
    res.status(502).json({ success: false, error: "Failed to submit picks" });
  }
});

// User picks (no cache per-user)
app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    const parsed = await safeJson(r);
    if (!parsed.ok) return res.status(502).json({ error: "Upstream not JSON", upstream: parsed.raw.slice(0, 300) });
    res.json(parsed.json);
  } catch (e) {
    console.error("getUserPicks error:", e);
    res.status(502).json({ error: "Failed to fetch picks" });
  }
});

// Weekly leaderboard (5s cache)
app.post("/api/leaderboard", async (_req, res) => {
  try {
    const data = await remember("leaderboard", 5_000, async () => {
      const r = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getLeaderboard" })
      });
      const parsed = await safeJson(r);
      if (!parsed.ok) throw new Error(`GAS getLeaderboard not JSON: ${parsed.raw.slice(0,200)}`);
      return parsed.json;
    });
    res.set("Cache-Control", "no-store");
    res.json(data || {});
  } catch (e) {
    console.error("getLeaderboard error:", e);
    res.status(502).json({ error: "Failed to fetch leaderboard" });
  }
});

// All-time (10 min cache)
app.get("/api/hall", async (_req, res) => {
  try {
    const data = await remember("hall", 10 * 60_000, async () => {
      const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, { headers: { "Cache-Control": "no-cache" } });
      const parsed = await safeJson(r);
      if (!parsed.ok) throw new Error(`GAS getHall not JSON: ${parsed.raw.slice(0,200)}`);
      return parsed.json;
    });
    res.set("Cache-Control", "no-store");
    res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("getHall error:", e);
    res.status(502).json([]);
  }
});

// Champion banner (10 min cache)
app.get("/api/champion-banner", async (_req, res) => {
  try {
    const data = await remember("champmsg", 10 * 60_000, async () => {
      const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`);
      const parsed = await safeJson(r);
      if (!parsed.ok) throw new Error(`GAS getChampionBanner not JSON: ${parsed.raw.slice(0,200)}`);
      return parsed.json;
    });
    res.json(data || {});
  } catch (e) {
    console.error("getChampionBanner error:", e);
    res.status(502).json({ message: "" });
  }
});

/* ---------- UFCSTATS SCRAPER (simple & safe) ---------- */
app.get("/api/scrape/ufcstats/event/:id", async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Missing event id" });

    const url = `${UFC_BASE}/event-details/${encodeURIComponent(eventId)}`;
    const html = await fetchTextWithTimeout(url, { timeoutMs: 12000 });
    const bouts = parseUfcstatsEvent(html);

    res.json({ eventId, source: "ufcstats", bouts });
  } catch (e) {
    console.error("ufcstats scrape error:", e);
    res.status(500).json({ error: "Failed to scrape UFCStats" });
  }
});

/* ---------- Health: see upstream quickly ---------- */
app.get("/api/health", async (_req, res) => {
  try {
    const [f, lb, hall] = await Promise.all([
      fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`),
      fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getLeaderboard" }) }),
      fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`)
    ]);
    const [fj, lbj, hj] = await Promise.all([safeJson(f), safeJson(lb), safeJson(hall)]);
    res.json({
      fights_ok: fj.ok, fights_status: fj.status, fights_len: fj.ok && Array.isArray(fj.json) ? fj.json.length : null,
      leaderboard_ok: lbj.ok, leaderboard_status: lbj.status, leaderboard_keys: lbj.ok && lbj.json && lbj.json.scores ? Object.keys(lbj.json.scores).length : null,
      hall_ok: hj.ok, hall_status: hj.status, hall_len: hj.ok && Array.isArray(hj.json) ? hj.json.length : null,
      sample_error_snippet: (!fj.ok && fj.raw) ? fj.raw.slice(0,200) : (!lbj.ok && lbj.raw) ? lbj.raw.slice(0,200) : (!hj.ok && hj.raw) ? hj.raw.slice(0,200) : null
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
