// server.js
const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// GAS Web App URL (leave code.gs unchanged; the server calls it with ?action=...)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { headers: { "Cache-Control": "no-cache" }, ...opts });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Non-JSON from GAS: ${text.slice(0, 200)}`); }
}

/* ---------- Health ---------- */
// Quick check that Node can reach GAS *and* GAS accepts the action.
app.get("/api/health", async (_req, res) => {
  try {
    const gas = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const ok = Array.isArray(gas);
    res.json({ ok, gasType: typeof gas, fightsCount: ok ? gas.length : 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* ---------- Path endpoints (what your script.js calls) ---------- */
app.get("/api/fights", async (_req, res) => {
  try {
    const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getFights error:", err);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

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

app.get("/api/champion", async (_req, res) => {
  try {
    const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`);
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getChampionBanner error:", err);
    res.status(500).json({ message: "" });
  }
});

app.get("/api/hall", async (_req, res) => {
  try {
    const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=getHall`);
    res.set("Cache-Control", "no-store").json(data);
  } catch (err) {
    console.error("getHall error:", err);
    res.status(500).json([]);
  }
});

/* ---------- Query fallback (/api?action=...) for older clients ---------- */
app.all("/api", async (req, res) => {
  const method = req.method.toUpperCase();
  const action = (req.query && req.query.action) || (req.body && req.body.action);
  if (!action) return res.status(400).json({ error: "Missing action" });

  try {
    if (method === "GET") {
      // e.g., /api?action=getFights
      const data = await fetchJson(`${GOOGLE_SCRIPT_URL}?action=${encodeURIComponent(action)}`);
      return res.set("Cache-Control", "no-store").json(data);
    }

    // e.g., POST /api { action: "getLeaderboard" }
    const body = { ...req.body };
    const data = await fetchJson(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.set("Cache-Control", "no-store").json(data);
  } catch (e) {
    console.error("/api passthrough error:", e);
    return res.status(500).json({ error: "GAS passthrough failed", details: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
