// server.js
const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Your deployed Google Apps Script Web App URL
// (Leave code.gs unchanged; we only call it with ?action=... here.)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Small helper to fetch JSON safely
async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { headers: { "Cache-Control": "no-cache" }, ...opts });
  // If GAS returns a string like "Invalid GET action", guard JSON parse
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from GAS: ${text.slice(0, 200)}`);
  }
}

/* ========= API PASSTHRU (aligns with code.gs doGet/doPost) ========= */

// Fights (GET → ?action=getFights)
app.get("/api/fights", async (_req, res) => {
  try {
    const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getFights error:", err);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// Submit Picks (POST → action=submitPicks)
app.post("/api/submit", async (req, res) => {
  try {
    const data = await fetchJson(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("submitPicks error:", err);
    res.status(500).json({ success: false, error: "Failed to submit picks" });
  }
});

// Get User Picks (POST → action=getUserPicks)
app.post("/api/picks", async (req, res) => {
  try {
    const data = await fetchJson(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getUserPicks error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch picks" });
  }
});

// Weekly Leaderboard (POST → action=getLeaderboard)
app.post("/api/leaderboard", async (_req, res) => {
  try {
    const data = await fetchJson(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" })
    });
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getLeaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Champion Banner (GET → ?action=getChampionBanner)
app.get("/api/champion", async (_req, res) => {
  try {
    const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`);
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getChampionBanner error:", err);
    res.status(500).json({ message: "" });
  }
});

// All-Time Leaderboard (GET → ?action=getHall)
app.get("/api/hall", async (_req, res) => {
  try {
    const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getHall`);
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getHall error:", err);
    res.status(500).json([]);
  }
});

/* ========= SPA fallback (optional) ========= */
// If you have a single-page app front-end, uncomment this:
// app.get("*", (_req, res) => {
//   res.sendFile(path.join(__dirname, "public", "index.html"));
// });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
