const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Your Google Apps Script deployment URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// ⏳ Lockout time for fight submissions
const lockoutTime = new Date("2025-07-20T18:00:00");

// ✅ Safely load fights.json using fs (Render-safe)
app.get("/api/fights", (req, res) => {
  try {
    const dataPath = path.join(__dirname, "data", "fights.json");
    const fights = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    res.json(fights);
  } catch (err) {
    console.error("Error reading fights.json:", err);
    res.status(500).json({ error: "Failed to load fight data" });
  }
});

// 🥊 Submit picks (sends to Apps Script)
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
      res.status(400).json({ error: result.error || "Failed to submit picks." });
    }
  } catch (err) {
    console.error("Error submitting picks:", err);
    res.status(500).json({ error: "Server error while submitting picks." });
  }
});

// 👤 Get user's saved picks
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
    console.error("Error fetching picks:", err);
    res.status(500).json({ error: "Failed to fetch user picks." });
  }
});

// 🏆 Get leaderboard
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
    console.error("Error fetching leaderboard:", err);
    res.status(500).json({ error: "Failed to load leaderboard." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
