// ✅ Minimal File polyfill for Node 18 (fixes "File is not defined" from undici)
if (typeof globalThis.File === "undefined") {
  class File extends Blob {
    constructor(chunks = [], name = "", options = {}) {
      super(chunks, options);
      this.name = String(name);
      this.lastModified = options?.lastModified ?? Date.now();
    }
    get [Symbol.toStringTag]() {
      return "File";
    }
  }
  globalThis.File = File;
}

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Google Apps Script Web App URL (defined BEFORE use)
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

// ✅ Updated Lockout Time: August 16, 2025 @ 6:00 PM ET
const lockoutTime = new Date("2025-08-16T18:00:00-04:00"); // ET in August = UTC-04:00

// ✅ Endpoint to check lockout status (for frontend)
app.get("/api/lockout", (req, res) => {
  const now = new Date();
  const locked = now >= lockoutTime;
  res.json({ locked });
});

// ✅ Fetch Fights
app.get("/api/fights", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const fights = await response.json();
    res.json(fights);
  } catch (error) {
    console.error("getFights error:", error);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// ✅ Submit Picks (with lockout logic)
app.post("/api/submit", async (req, res) => {
  const now = new Date();
  if (now >= lockoutTime) {
    return res.json({
      success: false,
      error: "⛔ Picks are locked. The event has started."
    });
  }

  try {
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

// ✅ Get User Picks
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

// ✅ Get Weekly Leaderboard
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

// ✅ NEW: All-Time (Hall) via GAS getHall
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
