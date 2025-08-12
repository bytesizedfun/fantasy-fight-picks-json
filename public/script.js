const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Google Apps Script Web App URL (your existing one)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

// ✅ Updated Lockout Time: August 9, 2025 @ 4:00 PM ET
const lockoutTime = new Date("2025-08-09T16:00:00-04:00");

// ✅ Endpoint to check lockout status (for frontend)
app.get("/api/lockout", (req, res) => {
  const now = new Date();
  const locked = now >= lockoutTime;
  res.json({ locked });
});

// ✅ Fetch Fights
app.get("/api/fights", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const fights = await response.json();
    res.json(fights);
  } catch (error) {
    console.error("getFights error:", error);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// ✅ Submit Picks (with lockout logic)
app.post("/api/submit", async (req, res) => {
  const now = new Date();
  if (now >= lockoutTime) {
    return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
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
    console.error("submitPicks error:", error);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

// ✅ Get User Picks
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
    console.error("getUserPicks error:", error);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// ✅ Get Leaderboard (Weekly)
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
    console.error("getLeaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ✅ All-Time (Hall) — reads champions sheet summary from Apps Script
app.get("/api/hall", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" }
    });
    const result = await response.json();
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    console.error("getHall error:", error);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
