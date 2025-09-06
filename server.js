// server.js — Node/Express proxy for Fantasy Fight Picks
// PROXIES /api calls to your Google Apps Script Web App.

const express = require("express");
const path = require("path");

// ✅ Your actual GAS Web App URL (you gave me this)
const GAS_BASE = process.env.GAS_BASE
  || "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// Use built-in fetch on Node 18+, fallback to node-fetch if needed
const _fetch = (typeof fetch === "function")
  ? fetch
  : (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();

function ensureGas() {
  if (!GAS_BASE || !/script\.google\.com\/macros\/s\/.+\/exec/.test(GAS_BASE)) {
    const msg = "GAS_BASE is not set to a valid Apps Script /exec URL.";
    const err = new Error(msg);
    err.status = 500;
    throw err;
  }
}
function sep(url) { return url.includes("?") ? "&" : "?"; }

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, gasConfigured: !!(GAS_BASE && GAS_BASE.includes("/exec")) });
});

// Static site (public/index.html, script.js, style.css, images…)
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "5m",
  etag: true,
  lastModified: true
}));

app.use(express.json({ limit: "1mb" }));

// GET /api → forwards to GAS GET (e.g., ?action=getFights)
app.get("/api", async (req, res) => {
  try {
    ensureGas();
    const q = new URLSearchParams(req.query).toString();
    const url = `${GAS_BASE}${sep(GAS_BASE)}${q}`;
    const r = await _fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
    const body = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api → forwards JSON body to GAS POST
app.post("/api", async (req, res) => {
  try {
    ensureGas();
    const r = await _fetch(GAS_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(req.body || {})
    });
    const body = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Fantasy Fight Picks server listening on :${PORT}`);
  if (!GAS_BASE || !GAS_BASE.includes("/exec")) {
    console.warn("WARNING: GAS_BASE not configured — /api routes will fail.");
  }
});
