// server.js
// Express server + GAS bridge + hardened UFCStats scraper

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const cheerio = require("cheerio");

// Try to load compression, but don’t crash if it’s missing
let compression = null;
try {
  compression = require("compression");
} catch (e) {
  console.warn("[warn] compression package not installed; continuing without it");
}

const app = express();
const PORT = process.env.PORT || 3000;

// GAS web app URL
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// --- PERFORMANCE ---
if (compression) {
  app.use(compression({ level: 6 }));
}

// Hard no-cache for API
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

// Aggressive caching for static assets
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    lastModified: true,
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      if (/\.(css|js|png|jpg|jpeg|gif|svg|woff2?)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    },
  })
);

// Lockout (kept)
const lockoutTime = new Date("2025-08-16T18:00:00-04:00");
app.get("/api/lockout", (req, res) => {
  res.json({ locked: new Date() >= lockoutTime });
});

// Fights
app.get("/api/fights", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getFights error:", e);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// Submit picks
app.post("/api/submit", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body }),
    });
    res.json(await r.json());
  } catch (e) {
    console.error("submitPicks error:", e);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

// User picks
app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body }),
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getUserPicks error:", e);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// Weekly leaderboard
app.post("/api/leaderboard", async (_req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" }),
    });
    res.set("Cache-Control", "no-store");
    res.json(await r.json());
  } catch (e) {
    console.error("getLeaderboard error:", e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// All-time
app.get("/api/hall", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.set("Cache-Control", "no-store");
    res.json(await r.json());
  } catch (e) {
    console.error("getHall error:", e);
    res.status(500).json([]);
  }
});

/* =========================
   UFCSTATS SCRAPER (fixed)
   ========================= */

const UFC_BASE = "http://www.ufcstats.com";

async function fetchWithRetry(url, { tries = 3, timeoutMs = 12000 } = {}) {
  let lastErr;
  while (tries-- > 0) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { redirect: "follow", signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      await new Promise(r => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

const cleanMethod = (s) => (s || "").replace(/\s*\(.*?\)\s*/g, "").replace(/\s+/g, " ").trim();
const cleanRound  = (r) => { const rr = String(r || "").trim(); return (!rr || rr === "0") ? "1" : rr; };

function parseUfcstatsEvent(html) {
  const $ = cheerio.load(html);
  const rows = $('tr.b-fight-details__table-row.b-fight-details__table-row__hover');
  const bouts = [];

  rows.each((_, tr) => {
    const t = $(tr);
    const links = t.find('a.b-link.b-link_style_black[href*="/fighter-details/"]');
    const red = links.eq(0).text().trim();
    const blu = links.eq(1).text().trim();

    const winRed  = /win/i.test(t.find('i.b-fight-details__person-status--red').text());
    const winBlue = /win/i.test(t.find('i.b-fight-details__person-status--blue').text());
    const winner = winRed ? red : (winBlue ? blu : "");

    const methodCell = t.find('p.b-fight-details__table-text:contains("Method:")').next().text().trim()
                    || t.find('td.b-fight-details__table-col').eq(6).text().trim();
    const roundCell  = t.find('p.b-fight-details__table-text:contains("Round:")').next().text().trim()
                    || t.find('td.b-fight-details__table-col').eq(7).text().trim();

    const method = cleanMethod(methodCell);
    const round  = cleanRound(roundCell);
    const fight  = (red && blu) ? `${red} vs ${blu}` : "";

    if (fight && winner && method) bouts.push({ fight, winner, method, round });
  });

  return bouts;
}

// GET /api/scrape/ufcstats/event/:id  -> { eventId, source, bouts:[...] }
app.get("/api/scrape/ufcstats/event/:id", async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Missing event id" });

    const url = `${UFC_BASE}/event-details/${encodeURIComponent(eventId)}`;
    const html = await fetchWithRetry(url);
    const bouts = parseUfcstatsEvent(html);

    res.json({ eventId, source: "ufcstats", bouts });
  } catch (e) {
    console.error("Scraper error:", e);
    res.status(500).json({ error: "Failed to scrape UFCStats" });
  }
});

// Start
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
