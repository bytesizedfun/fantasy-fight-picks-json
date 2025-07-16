const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const picksPath = path.join(__dirname, "data", "picks.json");

app.use(express.json());
app.use(express.static("public"));

function loadPicks() {
  if (!fs.existsSync(picksPath)) return {};
  return JSON.parse(fs.readFileSync(picksPath, "utf-8"));
}

function savePicks(data) {
  fs.writeFileSync(picksPath, JSON.stringify(data, null, 2));
}

app.post("/api/picks", (req, res) => {
  const { username, picks } = req.body;
  const allPicks = loadPicks();
  allPicks[username] = picks;
  savePicks(allPicks);
  res.json({ success: true });
});

app.get("/api/picks/:username", (req, res) => {
  const allPicks = loadPicks();
  res.json(allPicks[req.params.username] || {});
});

app.get("/api/leaderboard", (req, res) => {
  const allPicks = loadPicks();
  const leaderboard = Object.entries(allPicks).map(([username, picks]) => ({
    username,
    score: Object.keys(picks).length
  }));
  leaderboard.sort((a, b) => b.score - a.score);
  res.json(leaderboard);
});

app.get("/api/fights", (req, res) => {
  res.json([
    {
      id: "1",
      fighter1: "Max Holloway",
      fighter2: "Dustin Poirier",
      method_options: ["KO", "Submission", "Decision"]
    },
    {
      id: "2",
      fighter1: "Sean O'Malley",
      fighter2: "Merab Dvalishvili",
      method_options: ["KO", "Submission", "Decision"]
    }
  ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
