const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const picksPath = path.join(__dirname, "data", "picks.json");

const fights = [
  {
    fighter1: "Max Holloway",
    fighter2: "Dustin Poirier",
    is_underdog: true,
    method_options: ["KO/TKO", "Submission", "Decision"]
  },
  {
    fighter1: "Erin Blanchfield",
    fighter2: "Maycee Barber",
    is_underdog: false,
    method_options: ["KO/TKO", "Submission", "Decision"]
  }
];

// Serve list of fights
app.get("/api/fights", (req, res) => {
  res.json(fights);
});

// Save picks
app.post("/api/submit", (req, res) => {
  const { username, picks } = req.body;
  const data = JSON.parse(fs.readFileSync(picksPath));
  data[username] = picks;
  fs.writeFileSync(picksPath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// Load leaderboard
app.get("/api/leaderboard", (req, res) => {
  const data = JSON.parse(fs.readFileSync(picksPath));
  const scores = {};
  Object.keys(data).forEach((user) => {
    scores[user] = Object.keys(data[user]).length;
  });
  res.json(scores);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
