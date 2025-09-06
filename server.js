// server.js — simple, path-only API proxy to GAS (no service worker, no scraper)

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Use env GAS_URL if you rotate the Apps Script URL
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// Optional lockout (UTC). Leave blank/undefined to disable.
const LOCKOUT_ISO = process.env.LOCKOUT_ISO || ""; // e.g. 2025-09-06T22:00:00Z
const lockoutTime = Number.isNaN(Date.parse(LOCKOUT_ISO)) ? null : new Date(LOCKOUT_ISO);

app.use(express.json());

// Serve /public and prevent HTML caching
app.use(
  express.static("public", {
    extensions: ["html"],
    setHeaders: (res, file) => {
      if (file.endsWith(".html")) {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");
        res.set("Surrogate-Control", "no-store");
      }
    }
  })
);

app.get("/", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// No-cache on API
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Lockout status
app.get("/api/lockout", (_req, res) => {
  const locked = lockoutTime ? Date.now() >= lockoutTime.getTime() : false;
  res.json({ locked, lockoutISO: LOCKOUT_ISO || null });
});

// Fights
app.get("/api/fights", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, { headers: { "Cache-Control": "no-cache" } });
    res.json(await r.json());
  } catch (e) {
    console.error("getFights:", e);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// Get user picks
app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getUserPicks:", e);
    res.status(500).json({ success: false, error: "Failed to fetch picks" });
  }
});

// Submit picks (lockout enforced if set)
app.post("/api/submit", async (req, res) => {
  if (lockoutTime && Date.now() >= lockoutTime.getTime()) {
    return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
  }
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("submitPicks:", e);
    res.status(500).json({ success: false, error: "Failed to submit picks" });
  }
});

// Weekly leaderboard/results
app.post("/api/leaderboard", async (_req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" })
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getLeaderboard:", e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Champion banner
app.get("/api/champion", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`, { headers: { "Cache-Control": "no-cache" } });
    res.json(await r.json());
  } catch (e) {
    console.error("getChampionBanner:", e);
    res.status(500).json({ message: "" });
  }
});

// All-time hall
app.get("/api/hall", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, { headers: { "Cache-Control": "no-cache" } });
    res.set("Cache-Control", "no-store");
    res.json(await r.json());
  } catch (e) {
    console.error("getHall:", e);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => console.log(`Server running on :${PORT}`));
