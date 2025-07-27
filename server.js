const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Correct deployed Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// ✅ Lockout set to August 2, 2025 @ 6:00 PM Eastern Time (EDT)
const lockoutTime = new Date("2025-08-02T18:00:00-04:00");

// === GET FIGHTS FROM GOOGLE SHEETS
app.get("/api/fights", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const fights = await response.json();
    res.json(fights);
  } catch (error) {
    console.error("Error fetching fights:", error);
    res.status(500).json({ error: "Failed to load fight data." });
  }
});

// === SUBMIT PICKS
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

// === GET USER PICKS
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

// === GET LEADERBOARD
app.get("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLeaderboard`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
    res.status(500).json({ error: "Failed to load leaderboard." });
  }
});

app.listen(PORT, () => {
  console.log(`Fantasy Fight Picks server running on port ${PORT}`);
});
