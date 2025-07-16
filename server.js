const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzFc7Ikhdum2ILaZB0Y7K1ohugVgS_MpIlO2oLD7Paq2uhR2-gI1p9mEJzy8kdyZrlaKQ/exec";
const lockoutTime = new Date("2025-07-20T18:00:00");

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

app.get("/api/fights", (req, res) => res.json(fights));

app.post("/api/submit", async (req, res) => {
  if (new Date() >= lockoutTime) return res.status(403).json({ error: "Picks are locked." });

  const { username, picks } = req.body;
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submitPicks", username, picks })
  });
  const result = await response.json();
  result.success ? res.json({ success: true }) : res.status(400).json({ error: result.error });
});

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

app.get("/api/leaderboard", async (req, res) => {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getLeaderboard" })
  });
  const data = await response.json();
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
