// server.js
// Express bridge -> Google Apps Script. Safe, minimal, and unlocked by default.

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== CONFIG ======
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// Lockout: set env LOCKOUT_ISO="2025-09-20T19:00:00-04:00" to enable.
// By default, NOT locked (so you can submit while testing).
const LOCKOUT_ISO = process.env.LOCKOUT_ISO || null;

app.use(express.json());
app.use(express.static("public"));

// Health (quick check your GAS is reachable)
app.get("/api/health", async (req, res) => {
  try {
    const ping = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, { timeout: 8000 });
    res.json({ ok: true, gas_ok: ping.ok });
  } catch (e) {
    res.json({ ok: true, gas_ok: false, note: e.message });
  }
});

// Lockout status
app.get("/api/lockout", (req, res) => {
  if (!LOCKOUT_ISO) return res.json({ locked: false });
  const now = new Date();
  const lockoutTime = new Date(LOCKOUT_ISO);
  res.json({ locked: now >= lockoutTime });
});

// Fights (proxy to GAS getFights)
app.get("/api/fights", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, { timeout: 15000 });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: "GAS bad status", status: r.status, text });
    }
    const fights = await r.json();
    // Must be an array; older payloads acceptable if array-like
    if (!Array.isArray(fights)) return res.json([]);
    return res.json(fights);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// Submit Picks (respects lockout only if LOCKOUT_ISO set)
app.post("/api/submit", async (req, res) => {
  if (LOCKOUT_ISO) {
    const now = new Date();
    const lockoutTime = new Date(LOCKOUT_ISO);
    if (now >= lockoutTime) {
      return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
    }
  }
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "submitPicks", ...req.body }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

// Get User Picks
app.post("/api/picks", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getUserPicks", ...req.body }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// Get Leaderboard
app.post("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getLeaderboard" }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
