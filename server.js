const express = require("express");
const fetch = require("node-fetch");
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

// GAS web app URL
const GOOGLE_SCRIPT_URL =
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

// Scraper passthrough (kept as-is)
app.get("/api/scrape/ufcstats/event/:id", async (req, res) => {
  try {
    const r = await fetch(
      `${req.protocol}://${req.get("host")}/api/scrape/ufcstats/event/${encodeURIComponent(
        req.params.id
      )}`
    );
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: "Scraper passthrough failed" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
