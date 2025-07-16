const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzs6Jg54csLTWWqGWeN76lPygWFxUvH8jFdst_41VoIulte5EksLWAgUyr0Ufm0kYyE/exec";
const lockoutTime = new Date("2025-07-19T18:00:00");

const fights = [
  {
    fighter1: "Max Holloway",
    fighter2: "Dustin Poirier",
    method_options: ["KO/TKO", "Submission", "Decision"]
  },
  {
    fighter1: "Erin Blanchfield",
    fighter2: "Maycee Barber",
    method_options: ["KO/TKO", "Submission", "Decision"]
  }
];

// Serve fight card
app.get("/api/fights", (req, res) => {
  res.json(fights);
});

// Submit picks
app.post("/api/submit", async (req, res) => {
  const now = new Date();
  if (now >= lockoutTime) {
    return res.status(403).json({ error: "Picks are locked. Fight card has started." });
  }

  const { username, picks } = req.body;

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submitPicks", username, picks })
  });

  const result = await response.json();
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: result.error || "Failed to submit picks." });
  }
});

// Load leaderboard (✅ changed to POST)
app.get("/api/leaderboard", async (req, res) => {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getLeaderboard" })
  });

  const data = await response.json();
  res.json(data);
});

// Load user picks (✅ changed to POST)
app.get("/api/picks/:username", async (req, res) => {
  const username = req.params.username;

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getUserPicks", username })
  });

  const data = await response.json();
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
