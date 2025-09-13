// server.js
const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

// ✅ Lockout (via GAS)
app.get("/api/lockout", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLockout`, {
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("lockout error:", err);
    res.status(500).json({ locked: true, error: "Failed to fetch lockout" });
  }
});

// ✅ Fights
app.get("/api/fights", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, {
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getFights error:", err);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// ✅ Submit Picks
app.post("/api/submit", async (req, res) => {
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

// ✅ Get User Picks
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

// ✅ Leaderboard
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

// ✅ Hall of Fame
app.get("/api/hall", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getHall error:", err);
    res.status(500).json([]);
  }
});

// ✅ Champion Banner
app.get("/api/champion", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`, {
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getChampionBanner error:", err);
    res.status(500).json({ message: "" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
