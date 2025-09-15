// Express server + optional rate limiting + GAS proxy + simple fights feed
// Works on Render out of the box. Safe with CommonJS.

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

// ---- Optional deps (graceful fallback so missing modules don't crash boot)
let rateLimit;
try {
  rateLimit = require("express-rate-limit");
} catch {
  console.warn("[warn] express-rate-limit not installed; running without rate limits");
  rateLimit = () => (req, res, next) => next();
}

let cheerio;
try {
  cheerio = require("cheerio");
} catch {
  console.warn("[warn] cheerio not installed; disabling HTML scraping features");
  cheerio = null;
}

const fetch = require("node-fetch"); // v2 CJS

// ---- Config via env
const PORT = process.env.PORT || 3000;
// Google Apps Script Web App URL, e.g. https://script.google.com/macros/s/XXXX/exec
const GAS_URL = process.env.GAS_URL || "";
// Optional: an upstream JSON endpoint for fights (or use local file/public)
const FIGHTS_JSON = process.env.FIGHTS_JSON || ""; // e.g. https://raw.githubusercontent.com/your/repo/main/fights.json

// ---- App init
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cors());
app.use(morgan("tiny"));

// Basic global rate limit (no-op if module missing)
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 300
  })
);

// ---- Health
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    env: {
      hasGAS: Boolean(GAS_URL),
      hasCheerio: Boolean(cheerio),
    }
  });
});

// ---- Fights feed
// Strategy:
// 1) If FIGHTS_JSON env is set, fetch from there.
// 2) Else try to read a local JSON file at /public/fights.json (if present).
// 3) Else return empty array with a helpful message.
app.get("/api/fights", async (req, res) => {
  try {
    if (FIGHTS_JSON) {
      const r = await fetch(FIGHTS_JSON, { timeout: 10_000 });
      if (!r.ok) throw new Error(`Upstream ${FIGHTS_JSON} returned ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("Upstream fights is not an array");
      return res.json(data);
    }
    // Try local JSON (optional)
    try {
      const path = require("path");
      const fs = require("fs");
      const p = path.join(__dirname, "public", "fights.json");
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, "utf8");
        const data = JSON.parse(text);
        if (Array.isArray(data)) return res.json(data);
      }
    } catch {}
    // Nothing available
    return res.status(200).json({
      message:
        "No fights found. Set FIGHTS_JSON env to a JSON array URL or add public/fights.json.",
      fights: []
    });
  } catch (e) {
    console.error("[/api/fights] error", e);
    res.status(500).json({ error: "Failed to load fights", detail: String(e.message || e) });
  }
});

// ---- GAS proxy helpers
async function gasFetch(payload) {
  if (!GAS_URL) {
    throw new Error("GAS_URL env not set. Add GAS_URL in Render → Environment.");
  }
  const r = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // GAS often expects a JSON body with an 'action' field
    body: JSON.stringify(payload),
    timeout: 15_000
  });
  const text = await r.text();
  // GAS can return text or JSON; try JSON first
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: r.status };
  }
}

// Example: leaderboard passthrough
app.get("/api/leaderboard", async (req, res) => {
  try {
    const data = await gasFetch({ action: "getLeaderboard" });
    res.json(data);
  } catch (e) {
    console.error("[/api/leaderboard] error", e);
    res.status(500).json({ error: "Failed to fetch leaderboard", detail: String(e.message || e) });
  }
});

// Example: champion banner passthrough (kept for compatibility)
app.get("/api/championBanner", async (req, res) => {
  try {
    const data = await gasFetch({ action: "getChampionBanner" });
    res.json(data);
  } catch (e) {
    console.error("[/api/championBanner] error", e);
    res.status(500).json({ error: "Failed to fetch champion banner", detail: String(e.message || e) });
  }
});

// Example: submit picks passthrough
app.post("/api/submit", async (req, res) => {
  try {
    const { username, picks } = req.body || {};
    const data = await gasFetch({ action: "submitPicks", username, picks });
    res.json(data);
  } catch (e) {
    console.error("[/api/submit] error", e);
    res.status(500).json({ error: "Failed to submit picks", detail: String(e.message || e) });
  }
});

// ---- Optional: simple scrape (disabled if cheerio missing)
// Keep a stub route so your frontend doesn’t 404 if it calls it
app.get("/api/ufcstats/:cardId", async (req, res) => {
  if (!cheerio) {
    return res.status(200).json({ disabled: true, reason: "cheerio not installed" });
  }
  // You can implement real scraping here if needed.
  return res.status(200).json({ ok: true, note: "Scraper stub. Implement when needed." });
});

// ---- Static (optional): serve your SPA/public
app.use(express.static("public"));

// ---- Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ---- Start
app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
  if (!GAS_URL) {
    console.warn("[warn] GAS_URL is not set. GAS proxy routes will return errors until you add it.");
  }
});
