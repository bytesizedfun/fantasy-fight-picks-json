const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Your correct deployed Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// ✅ Set your lockout time
const lockoutTime = new Date("2025-07-20T15:00:00"); // Adjust as needed

// Serve fights.json (no changes)
app.get("/api/fights", (req, res) => {
  const fights = require("./data/fights.json");
  res.json(fights);
});

// Submit picks
app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) {
    return res.status(403).json({ error: "Picks are locked. Fight card has started." });
  }

  const { username, picks } = req.body;

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submitPicks", username, picks }),
  });

  const result = await response.json();
  res.json(result);
});

// Get user's own picks
app.post("/api/picks", async (req, res) => {
  const { username } = req.body;

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getUserPicks", username }),
  });

  const result = await response.json();
  res.json(result);
});

// Leaderboard
app.get("/api/leaderboard", async (req, res) => {
  const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLeaderboard`);
  const data = await response.json();
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Fantasy Fight Picks server running on port ${PORT}`);
});
