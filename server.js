const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Deployed Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// ✅ Fight card lockout time (Eastern Time)
const lockoutTime = new Date("2025-07-27T15:00:00-04:00"); // Saturday, July 27, 2025 at 3:00 PM EDT

app.get("/api/fights", (req, res) => {
  const fights = require("./data/fights.json");
  res.json(fights);
});

app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) {
    return res.status(403).json({ error: "Picks are locked. Fight card has started." });
  }

  const { username, picks } = req.body;
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", username, picks })
    });

    const result = await response.json();
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.message || "Failed to submit picks." });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error submitting picks." });
  }
});

app.post("/api/picks", async (req, res) => {
  const { username } = req.body;
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", username })
    });

    const result = await response.json();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch picks." });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" })
    });

    const result = await response.json();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to load leaderboard." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
