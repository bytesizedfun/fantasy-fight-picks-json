const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Your deployed Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// 🔒 Lockout time (adjust for your next event)
const lockoutTime = new Date("2025-07-27T15:00:00"); // Saturday 3PM

// Serve fights from static JSON (this can stay local)
app.get("/api/fights", (req, res) => {
  const fights = require("./data/fights.json");
  res.json(fights);
});

// Submit picks to Google Sheets
app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) {
    return res.status(403).json({ error: "Picks are locked. Fight card has started." });
  }

  const { username, picks } = req.body;
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submitPicks",
        username,
        picks
      })
    });
    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: "Submission failed." });
  }
});

// Get user's own picks from Google Sheets
app.post("/api/picks", async (req, res) => {
  const { username } = req.body;
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "getUserPicks",
        username
      })
    });
    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error("Picks load error:", err);
    res.status(500).json({ error: "Failed to load picks." });
  }
});

// Get leaderboard from Google Sheets
app.get("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLeaderboard`);
    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to load leaderboard." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
