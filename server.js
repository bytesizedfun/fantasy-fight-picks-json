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
  { fighter1: "Max Holloway", fighter2: "Dustin Poirier", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Paulo Costa", fighter2: "Roman Kopylov", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Kevin Holland", fighter2: "Daniel Rodriguez", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Dan Ige", fighter2: "Patricio Pitbull", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Michael Johnson", fighter2: "Daniel Zellhuber", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Kyler Phillips", fighter2: "Vinicius Oliveira", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Marvin Vettori", fighter2: "Brendan Allen", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Francisco Prado", fighter2: "Nikolay Veretennikov", method_options: ["KO/TKO", "Submission", "Decision"] },
  { fighter1: "Ateba Gautier", fighter2: "Robert Valentin", method_options: ["KO/TKO", "Submission", "Decision"] },
];

app.get("/api/fights", (req, res) => res.json(fights));

app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) return res.status(403).json({ error: "Picks are locked." });
  const { username, picks } = req.body;
  const resp = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submitPicks", username, picks })
  });
  const data = await resp.json();
  res.status(data.success ? 200 : 400).json(data);
});

app.post("/api/picks", async (req, res) => {
  const resp = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getUserPicks", username: req.body.username })
  });
  res.json(await resp.json());
});

app.get("/api/leaderboard", async (_, res) => {
  const resp = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getLeaderboard" })
  });
  res.json(await resp.json());
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
