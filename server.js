const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Your live Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzs6Jg54csLTWWqGWeN76lPygWFxUvH8jFdst_41VoIulte5EksLWAgUyr0Ufm0kYyE/exec";

// ⏰ Lockout before card starts
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

// ✅ Send fight card to frontend
app.get("/api/fights", (req, res) => {
  res.json(fights);
});

// ✅ Submit picks to Google Sheets backend
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

// ✅ Get leaderboard from backend
app.get("/api/leaderboard", async (req, res) => {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getLeaderboard" })
  });

  const data = await response.json();
  res.json(data);
});

// ✅ Get user picks (via POST)
app.post("/api/picks", async (req, res) => {
  const { username } = req.body;

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getUserPicks", username })
  });

  const data = await response.json();
  res.json(data);
});

// ✅ Optional test route to check backend connectivity
app.get("/test", async (req, res) => {
  try {
    const testRes = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" })
    });

    const json = await testRes.json();
    res.json({ success: true, connected: true, sampleData: json });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
  
