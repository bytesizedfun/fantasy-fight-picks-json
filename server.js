const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const picksPath = path.join(__dirname, "data", "picks.json");
const resultsPath = path.join(__dirname, "data", "results.json");

// Lockout time before event (adjust as needed)
const lockoutTime = new Date("2025-07-19T18:00:00"); // 6:00 PM on fight day

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

// Serve fights list
app.get("/api/fights", (req, res) => {
  res.json(fights);
});

// Save picks with lockout and one-time submission
app.post("/api/submit", (req, res) => {
  const now = new Date();
  if (now >= lockoutTime) {
    return res.status(403).json({ error: "Picks are locked. Fight card has started." });
  }

  const { username, picks } = req.body;
  const data = JSON.parse(fs.readFileSync(picksPath));

  if (data[username]) {
    return res.status(400).json({ error: "You have already submitted picks." });
  }

  data[username] = picks;
  fs.writeFileSync(picksPath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// Load leaderboard with champ logic
app.get("/api/leaderboard", (req, res) => {
  const picksData = JSON.parse(fs.readFileSync(picksPath));
  const resultsData = JSON.parse(fs.readFileSync(resultsPath));
  const scores = {};
  let topScore = 0;
  let champ = null;

  Object.entries(picksData).forEach(([user, userPicks]) => {
    let score = 0;

    Object.entries(userPicks).forEach(([fight, pick]) => {
      const result = resultsData[fight];
      if (!result) return;

      if (pick.winner === result.winner) {
        score += 1;
        if (pick.method === result.method) {
          score += 1;
        }
      }
    });

    scores[user] = score;
    if (score > topScore) {
      topScore = score;
      champ = user;
    }
  });

  res.json({ scores, champ });
});

// Return picks status for frontend check
app.get("/api/picks/:username", (req, res) => {
  const data = JSON.parse(fs.readFileSync(picksPath));
  const user = req.params.username;

  if (data[user]) {
    return res.json({ submitted: true, picks: data[user] });
  } else {
    return res.json({ submitted: false });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

