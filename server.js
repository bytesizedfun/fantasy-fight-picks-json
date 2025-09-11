// server.js
// Express server + GAS bridge + hardened UFCStats scraper (Render-ready)

const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const path = require("path");

// Try to load compression, but don’t crash if it’s missing
let compression = null;
try {
  compression = require("compression");
} catch (e) {
  console.warn("[warn] compression package not installed; continuing without it");
}

const app = express();
const PORT = process.env.PORT || 3000;

// ======== CONFIG ========
// GAS web app URL
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// UFCStats base (served over HTTP)
const UFC_BASE = "http://www.ufcstats.com";

// ======== MIDDLEWARE ========
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

// ======== UTILS: UFCSTATS SCRAPER ========
async function fetchWithRetry(url, { tries = 3, timeoutMs = 12000 } = {}) {
  let lastErr;
  while (tries-- > 0) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

function cleanMethod(s) {
  if (!s) return "";
  return s.replace(/\s*\(.*?\)\s*/g, "").replace(/\s+/g, " ").trim();
}

function cleanRound(r) {
  const rr = String(r || "").trim();
  if (!rr || rr === "0") return "1";
  return rr;
}

// Parse UFCStats event page into [{fight, winner, method, round}]
function parseUfcstatsEvent(html) {
  const $ = cheerio.load(html);

  // Bout rows have this class combo on event details pages
  const rows = $('tr.b-fight-details__table-row.b-fight-details__table-row__hover');

  const bouts = [];
  rows.each((_, tr) => {
    const t = $(tr);

    // Fighter names; using robust selectors
    const redName =
      t.find('a.b-link.b-link_style_black[href*="/fighter-details/"]').eq(0).text().trim() ||
      t.find('div.b-fight-details__person:has(i.b-fight-details__person-status--red) a').first().text().trim();

    const blueName =
      t.find('a.b-link.b-link_style_black[href*="/fighter-details/"]').eq(1).text().trim() ||
      t.find('div.b-fight-details__person:has(i.b-fight-details__person-status--blue) a').first().text().trim();

    // Outcome icons/text for each corner (red/blue)
    const outcomeRed = t.find('i.b-fight-details__person-status--red').text().trim();
    const outcomeBlue = t.find('i.b-fight-details__person-status--blue').text().trim();

    let winner = "";
    if (/win/i.test(outcomeRed)) winner = redName;
    if (/win/i.test(outcomeBlue)) winner = blueName;

    // Method and Round; use either "p:contains" path or column fallback
    const methodCell =
      t.find('p.b-fight-details__table-text:contains("Method:")').next().text().trim() ||
      t.find('td.b-fight-details__table-col:nth-child(7)').text().trim();
    const rdCell =
      t.find('p.b-fight-details__table-text:contains("Round:")').next().text().trim() ||
      t.find('td.b-fight-details__table-col:nth-child(8)').text().trim();

    const method = cleanMethod(methodCell);
    const round = cleanRound(rdCell);

    const fight = redName && blueName ? `${redName} vs ${blueName}` : "";

    if (fight && winner && method) {
      bouts.push({ fight, winner, method, round });
    }
  });

  return bouts;
}

// ======== ROUTES ========

// Optional lockout (kept)
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

// ======== UFCSTATS SCRAPER (FIXED: no self-recursive fetch) ========
// GET /api/scrape/ufcstats/event/:id  -> [{ fight, winner, method, round }]
app.get("/api/scrape/ufcstats/event/:id", async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Missing event id" });

    const url = `${UFC_BASE}/event-details/${encodeURIComponent(eventId)}`;
    const html = await fetchWithRetry(url);
    const bouts = parseUfcstatsEvent(html);

    res.json({ eventId, source: "ufcstats", bouts });
  } catch (e) {
    console.error("ufcstats scrape error:", e);
    res.status(500).json({ error: "Failed to scrape UFCStats" });
  }
});

// ======== START ========
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
