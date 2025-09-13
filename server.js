// server.js
// Express server + GAS bridge (Render-ready)

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

/* ================================
   Fetch fights + lockout together
   ================================ */
app.get("/api/fights", async (req, res) => {
  try {
    // get fights
    const fightsRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const fights = await fightsRes.json();

    // get event meta (lockout info)
    const metaRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getEventMeta`);
    const meta = await metaRes.json();
    const lockoutTime = new Date(meta.LOCKOUT_ET);
    const now = new Date();

    res.json({
      locked: now >= lockoutTime,
      fights
    });
  } catch (error) {
    console.error("getFights/lockout error:", error);
    res.status(500).json({ error: "Failed to fetch fights or lockout" });
  }
});

/* ================================
   Submit picks (lockout respected)
   ================================ */
app.post("/api/submit", async (req, res) => {
  try {
    // pull meta for lockout
    const metaRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getEventMeta`);
    const meta = await metaRes.json();
    const lockoutTime = new Date(meta.LOCKOUT_ET);

    if (new Date() >= lockoutTime) {
      return res.json({
        success: false,
        error: "⛔ Picks are locked. The event has started."
      });
    }

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "submitPicks", ...req.body }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("submitPicks error:", error);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

/* ================================
   Get user picks
   ================================ */
app.post("/api/picks", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getUserPicks", ...req.body }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("getUserPicks error:", error);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

/* ================================
   Get weekly leaderboard
   ================================ */
app.post("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getLeaderboard" }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("getLeaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

/* ================================
   All-time (Hall of Fame)
   ================================ */
app.get("/api/hall", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" }
    });
    res.set("Cache-Control", "no-store");
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error("getHall error:", e);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
