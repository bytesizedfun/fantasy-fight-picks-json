// Minimal proxy server — single source of truth for lockout is GAS (event_meta.LOCKOUT_ET)

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Your deployed Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Fights
app.get("/api/fights", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, { headers: { "Cache-Control": "no-cache" } });
    res.json(await r.json());
  } catch (e) {
    console.error("getFights error:", e);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// Submit picks (GAS enforces lockout)
app.post("/api/submit", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("submitPicks error:", e);
    res.status(500).json({ success: false, error: "Failed to submit picks" });
  }
});

// User picks
app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getUserPicks error:", e);
    res.status(500).json({ success: false, error: "Failed to fetch picks" });
  }
});

// Leaderboard (weekly/live, with cache behavior)
app.post("/api/leaderboard", async (_req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
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

// Champion banner
app.get("/api/champion", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`, { headers: { "Cache-Control": "no-cache" } });
    res.json(await r.json());
  } catch (e) {
    console.error("getChampionBanner error:", e);
    res.status(500).json({ message: "" });
  }
});

// All-time
app.get("/api/hall", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, { headers: { "Cache-Control": "no-cache" } });
    res.json(await r.json());
  } catch (e) {
    console.error("getHall error:", e);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
