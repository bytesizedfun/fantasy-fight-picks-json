const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// ✅ Lockout set to August 2, 2025 @ 6:00 PM Eastern Time (EDT)
const lockoutTime = new Date("2025-08-02T18:00:00-04:00");

app.get("/api/fights", (req, res) => {
  const fights = require("./data/fights.json");
  res.json(fights);
});

app.post("/api/submit", async (req, res) => {
  const { username, picks } = req.body;

  if (new Date() >= lockoutTime) {
    return res.json({ success: false, error: "Picks are locked." });
  }

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", username, picks }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error." });
  }
});

app.post("/api/picks", async (req, res) => {
  const { username } = req.body;
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", username }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not retrieve picks." });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLeaderboard`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not load leaderboard." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
