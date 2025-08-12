const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- Static / JSON ---------- */
app.use(express.json());
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir, { maxAge: "1h" }));

/* ---------- Health check (Render) ---------- */
app.get("/health", (_req, res) => res.sendStatus(200));

/* ---------- Config ---------- */
const lockoutTime = new Date("2025-08-09T16:00:00-04:00");
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

/* Use built-in fetch (Node 18+/20+). Fallback loads node-fetch only if needed. */
const _fetch = globalThis.fetch || ((...args) =>
  import("node-fetch").then(({ default: f }) => f(...args))
);

/* ---------- Lockout ---------- */
app.get("/api/lockout", (_req, res) => {
  res.json({ locked: new Date() >= lockoutTime });
});

/* ---------- Fights ---------- */
app.get("/api/fights", async (_req, res) => {
  try {
    const r = await _fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    res.json(await r.json());
  } catch (e) {
    console.error("getFights error:", e);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

/* ---------- Submit picks ---------- */
app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) {
    return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
  }
  try {
    const r = await _fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("submitPicks error:", e);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

/* ---------- User picks ---------- */
app.post("/api/picks", async (req, res) => {
  try {
    const r = await _fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getUserPicks error:", e);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

/* ---------- Weekly leaderboard ---------- */
app.post("/api/leaderboard", async (_req, res) => {
  try {
    const r = await _fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getLeaderboard error:", e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

/* ---------- All-Time (Hall) ---------- */
app.get("/api/hall", async (_req, res) => {
  try {
    const r = await _fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" }
    });
    res.set("Cache-Control", "no-store");
    res.json(await r.json());
  } catch (e) {
    console.error("getHall error:", e);
    res.status(500).json([]);
  }
});

/* ---------- SPA fallback (serves /public/index.html) ---------- */
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
