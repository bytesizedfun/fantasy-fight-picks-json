// Robust proxy for Fantasy Fight Picks (Render)
// - Maps RESTy /api/* routes to GAS doGet/doPost actions
// - Hardened against upstream slowness: timeouts, retries, no process crash
// - Clear JSON errors instead of 502 HTML

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// ---- Config
const PORT = process.env.PORT || 10000;
const GAS_URL = process.env.GAS_URL || ""; // MUST end with /exec
const TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 12000);
const RETRIES = Number(process.env.GAS_RETRIES || 1); // total attempts = 1 + RETRIES

if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(GAS_URL)) {
  console.error("FATAL: GAS_URL env var missing or invalid. Set it to your Apps Script Web App /exec URL.");
  process.exit(1);
}

// ---- Small helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function withTimeout(ms, signal) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  // If caller passes a parent signal, propagate abort
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

async function fetchJSON(url, opts = {}) {
  const { method = "GET", body, headers = {}, timeout = TIMEOUT_MS, retries = RETRIES } = opts;
  let attempt = 0;
  let lastErr;

  while (attempt <= retries) {
    attempt++;
    const { signal, clear } = withTimeout(timeout, opts.signal);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal
      });
      const text = await res.text();

      // GAS occasionally returns HTML (login/error) when misconfigured.
      // We still try to parse JSON; if it fails, we surface a structured error.
      let data;
      try { data = JSON.parse(text); }
      catch {
        if (!res.ok) throw new Error(`Upstream ${res.status} ${res.statusText}`);
        throw new Error(`Upstream returned non-JSON (${text.slice(0,120)})`);
      }

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `${res.status} ${res.statusText}`;
        throw new Error(msg);
      }

      clear();
      return data;
    } catch (err) {
      lastErr = err;
      clear();
      // Retry only on abort/network-ish errors
      const msg = String(err?.message || err);
      const retriable = /aborted|network|timeout|fetch failed|TypeError: fetch/.test(msg);
      if (!retriable || attempt > retries) break;
    }
  }

  const errText = String(lastErr?.message || lastErr || "Unknown upstream error");
  const e = new Error(errText);
  e.status = 502;
  throw e;
}

function toQuery(params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

async function gasGET(action, params = {}) {
  const q = toQuery({ action, ...params });
  const url = `${GAS_URL}?${q}`;
  return fetchJSON(url, { method: "GET" });
}

async function gasPOST(action, json = {}) {
  const body = JSON.stringify({ action, ...json });
  return fetchJSON(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
}

// ---- App
const app = express();
app.use(express.json());

// Static frontend from ./public
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  lastModified: true,
  maxAge: "5m",
  extensions: ["html"]
}));

// Health
app.get("/health", async (req, res) => {
  try {
    const meta = await gasGET("getmeta");
    return res.json({ ok: true, status: meta?.status || "unknown" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) }); // never trip Render health
  }
});

// ---- API -> GAS mappings (GETs)
app.get("/api/meta", async (req, res) => {
  try { res.json(await gasGET("getmeta")); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});
app.get("/api/fights", async (req, res) => {
  try { res.json(await gasGET("getfights")); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});
app.get("/api/results", async (req, res) => {
  try { res.json(await gasGET("getresults")); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});
app.get("/api/leaderboard", async (req, res) => {
  try { res.json(await gasGET("getleaderboard")); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});
app.get("/api/champion", async (req, res) => {
  try { res.json(await gasGET("getchampion")); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});
app.get("/api/userlock", async (req, res) => {
  try { res.json(await gasGET("getuserlock", { username: req.query.username || "" })); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});
app.get("/api/userpicks", async (req, res) => {
  try { res.json(await gasGET("getuserpicks", { username: req.query.username || "" })); }
  catch (e) { res.status(e.status || 502).json({ ok:false, error:String(e.message||e) }); }
});

// ---- API -> GAS mappings (POSTs)
app.post("/api/submitpicks", async (req, res) => {
  try {
    const { username, pin, picks } = req.body || {};
    res.json(await gasPOST("submitpicks", { username, pin, picks }));
  } catch (e) {
    res.status(e.status || 502).json({ ok:false, error:String(e.message||e) });
  }
});
app.post("/api/setevent", async (req, res) => {
  try {
    const { url, lockout_iso, lockout_local, tz } = req.body || {};
    res.json(await gasPOST("setevent", { url, lockout_iso, lockout_local, tz }));
  } catch (e) {
    res.status(e.status || 502).json({ ok:false, error:String(e.message||e) });
  }
});
app.post("/api/repairlabels", async (req, res) => {
  try {
    res.json(await gasPOST("repairlabels", {}));
  } catch (e) {
    res.status(e.status || 502).json({ ok:false, error:String(e.message||e) });
  }
});

// Fallback to index.html (SPA-ish)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- Boot
app.listen(PORT, () => {
  console.log(`FFP proxy listening on http://localhost:${PORT}  (GAS_URL set: ${!!GAS_URL})`);
});
