// server.js
// Node 18+ (built-in fetch). Start with: node server.js
import express from "express";
import path from "path";
import compression from "compression";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GAS_URL = process.env.GAS_URL; // e.g. https://script.google.com/macros/s/AKfy.../exec

if (!GAS_URL) {
  console.warn("[WARN] GAS_URL is not set. Set it in .env to reach your Apps Script backend.");
}

app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// ---- Helpers
function toJSONSafe(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const txt = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body: toJSONSafe(txt) };
    }
    return { ok: true, status: res.status, body: toJSONSafe(txt) };
  } finally {
    clearTimeout(id);
  }
}
function q(params) {
  const usp = new URLSearchParams(params);
  return usp.toString();
}

// ---- Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, hasGAS: Boolean(GAS_URL) });
});

// ---- Read routes (proxy to GAS doGet)
app.get("/api/meta", async (_req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const url = `${GAS_URL}?${q({ action: "getmeta" })}`;
  const r = await fetchWithTimeout(url, { method: "GET" });
  res.status(r.ok ? 200 : 502).json(r.body);
});

app.get("/api/fights", async (_req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const url = `${GAS_URL}?${q({ action: "getfights" })}`;
  const r = await fetchWithTimeout(url, { method: "GET" });
  res.status(r.ok ? 200 : 502).json(r.body);
});

app.get("/api/results", async (_req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const url = `${GAS_URL}?${q({ action: "getresults" })}`;
  const r = await fetchWithTimeout(url, { method: "GET" });
  res.status(r.ok ? 200 : 502).json(r.body);
});

app.get("/api/leaderboard", async (_req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const url = `${GAS_URL}?${q({ action: "getleaderboard" })}`;
  const r = await fetchWithTimeout(url, { method: "GET" });
  res.status(r.ok ? 200 : 502).json(r.body);
});

app.get("/api/champion", async (_req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const url = `${GAS_URL}?${q({ action: "getchampion" })}`;
  const r = await fetchWithTimeout(url, { method: "GET" });
  res.status(r.ok ? 200 : 502).json(r.body);
});

// user lock proxy (supports your existing frontend logic)
app.get("/api/userlock", async (req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const username = String(req.query.username || "");
  const url = `${GAS_URL}?${q({ action: "getuserlock", username })}`;
  const r = await fetchWithTimeout(url, { method: "GET" });
  res.status(r.ok ? 200 : 502).json(r.body);
});

// ---- Write route (proxy to GAS doPost)
app.post("/api/submitpicks", async (req, res) => {
  if (!GAS_URL) return res.status(503).json({ ok: false, error: "GAS_URL missing" });
  const { username, pin, picks } = req.body || {};
  // Minimal validation (frontend already does checks)
  if (!username || !pin || !Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ ok: false, error: "Missing username/pin/picks" });
  }
  const payload = { action: "submitpicks", username, pin, picks };
  const r = await fetchWithTimeout(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  res.status(r.ok ? 200 : 502).json(r.body);
});

// Echo (debug end-to-end)
app.post("/api/echo", (req, res) => {
  res.json({ ok: true, received: req.body ?? null });
});

// Fallback → index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`FFP proxy listening on http://localhost:${PORT}  (GAS_URL set: ${Boolean(GAS_URL)})`);
});
