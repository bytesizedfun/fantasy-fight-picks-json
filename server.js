const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Google Apps Script Web App URL (your existing one)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

// ✅ Lockout time (ET)
const lockoutTime = new Date("2025-08-09T16:00:00-04:00");

// ---------- Health / lockout ----------
app.get("/api/lockout", (req, res) => {
  const locked = new Date() >= lockoutTime;
  res.json({ locked });
});

// ---------- Fights ----------
app.get("/api/fights", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getFights error:", err);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// ---------- Submit picks (honors lockout) ----------
app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) {
    return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
  }
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("submitPicks error:", err);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

// ---------- Get user picks ----------
app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getUserPicks error:", err);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// ---------- Weekly leaderboard ----------
app.post("/api/leaderboard", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getLeaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ---------- All-Time / Hall (used by the All-Time tab) ----------
app.get("/api/hall", async (req, res) => {
  try {
    // No-cache so it reflects the latest Log Champion run
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, { headers: { "Cache-Control": "no-cache" } });
    const data = await r.json();
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    console.error("getHall error:", err);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
