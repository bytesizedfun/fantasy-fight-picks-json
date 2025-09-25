// Robust proxy for Fantasy Fight Picks (Render)
// - Maps RESTy /api/* routes to GAS doGet/doPost actions
// - In-memory caching (ETag/304), coalesced requests, keep-alive, compression
// - Stale-on-error to avoid 502s when Apps Script hiccups

import express from "express";
import path from "path";
import compression from "compression";
import crypto from "node:crypto";
import { fileURLToPath } from "url";
import { Agent as UndiciAgent, setGlobalDispatcher } from "undici";

// ---- Config
const PORT = process.env.PORT || 10000;
const GAS_URL = process.env.GAS_URL || ""; // MUST end with /exec
const TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 8000); // faster fail
const RETRIES = Number(process.env.GAS_RETRIES || 1);          // 1 retry max
const CACHE_TTL_MS = Number(process.env.API_CACHE_TTL_MS || 60_000); // 60s
const STALE_WHILE_REVALIDATE_MS = Number(process.env.API_STALE_SWR_MS || 60_000);

if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(GAS_URL)) {
  console.error("FATAL: GAS_URL env var missing or invalid. Set it to your Apps Script Web App /exec URL.");
  process.exit(1);
}

// ---- Keep-alive for all outbound fetch
setGlobalDispatcher(
  new UndiciAgent({
    keepAliveTimeout: 20_000,
    keepAliveMaxTimeout: 60_000,
    connections: 10, // a few is enough
    pipelining: 1
  })
);

// ---- Small helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function withTimeout(ms, signal) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

function hashETag(bufOrStr) {
  const data = typeof bufOrStr === "string" ? bufOrStr : JSON.stringify(bufOrStr);
  const h = crypto.createHash("sha1").update(data).digest("hex");
  // weak ETag is fine for JSON
  return `W/"${h}"`;
}

function toQuery(params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

function cacheKeyFromReq(req) {
  // Include method + original url (with query params) to key
  return `${req.method}:${req.originalUrl}`;
}

const getCache = new Map();        // key -> { ts, body, status, etag, headers }
const inflight = new Map();        // key -> Promise

function putCache(key, body, status = 200, headers = {}) {
  const payload = JSON.stringify(body);
  const etag = hashETag(payload);
  const now = Date.now();
  getCache.set(key, { ts: now, body, status, etag, headers });
  return { payload, etag, now };
}

function getFreshCache(key) {
  const hit = getCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts <= CACHE_TTL_MS) return hit; // fresh
  return null;
}

function getAnyCache(key) {
  // Return even if stale (for stale-on-error)
  return getCache.get(key) || null;
}

function sendCached(res, hit, reqEtag) {
  res.setHeader("ETag", hit.etag);
  res.setHeader("Cache-Control", `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=${Math.floor(STALE_WHILE_REVALIDATE_MS / 1000)}`);
  // Forward any extra headers we stored (rarely used here)
  for (const [k, v] of Object.entries(hit.headers || {})) res.setHeader(k, v);

  if (reqEtag && reqEtag === hit.etag) {
    return res.status(304).end();
  }
  return res.status(hit.status).json(hit.body);
}

async function fetchJSON(url, opts = {}) {
  const { method = "GET", body, headers = {}, timeout = TIMEOUT_MS, retries = RETRIES } = opts;
  let attempt = 0;
  let lastErr;

  while (attempt <= retries) {
    attempt++;
    const { signal, clear } = withTimeout(timeout, opts.signal);
    try {
      const res = await fetch(url, { method, headers, body, signal });
      const text = await res.text();

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
      const msg = String(err?.message || err);
      const retriable = /aborted|network|timeout|fetch failed|TypeError: fetch/i.test(msg);
      if (!retriable || attempt > retries) break;
    }
  }

  const errText = String(lastErr?.message || lastErr || "Unknown upstream error");
  const e = new Error(errText);
  e.status = 502;
  throw e;
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

// Generic GET handler with cache/coalescing
function cachedGetHandler(handler) {
  return async (req, res) => {
    const key = cacheKeyFromReq(req);
    const ifNoneMatch = req.headers["if-none-match"];

    // Serve fresh cache immediately if present
    const fresh = getFreshCache(key);
    if (fresh) return sendCached(res, fresh, ifNoneMatch);

    // Coalesce in-flight identical requests
    if (inflight.has(key)) {
      try {
        const result = await inflight.get(key);
        return sendCached(res, result.cacheEntry, ifNoneMatch);
      } catch (e) {
        // in-flight failed; try stale
        const stale = getAnyCache(key);
        if (stale) {
          res.setHeader("Warning", "110 - Response is stale");
          return sendCached(res, stale, null); // 200 with stale body
        }
        return res.status(e.status || 502).json({ ok: false, error: String(e.message || e) });
      }
    }

    // Start upstream fetch and remember the promise
    const p = (async () => {
      try {
        const data = await handler(req);
        const { etag } = putCache(key, data, 200, {});
        return { cacheEntry: getCache.get(key), etag };
      } catch (e) {
        // On error, serve stale if possible
        const stale = getAnyCache(key);
        if (stale) {
          return { cacheEntry: stale, stale: true };
        }
        throw e;
      }
    })();

    inflight.set(key, p);

    try {
      const result = await p;
      return sendCached(res, result.cacheEntry, ifNoneMatch);
    } catch (e) {
      return res.status(e.status || 502).json({ ok: false, error: String(e.message || e) });
    } finally {
      inflight.delete(key);
    }
  };
}

// Cache invalidation (lightweight)
function invalidateAll(...prefixes) {
  // prefixes are path starts like "/api/results", "/api/leaderboard", "/api/bootstrap"
  for (const key of Array.from(getCache.keys())) {
    const [, url] = key.split(":");
    if (prefixes.some(p => url.startsWith(p))) getCache.delete(key);
  }
}

// ---- App
const app = express();
app.use(compression());
app.use(express.json());

// Static frontend from ./public
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  lastModified: true,
  maxAge: "5m",
  extensions: ["html"]
}));

// Health
app.get("/health", cachedGetHandler(async () => {
  const meta = await gasGET("getmeta");
  return { ok: true, status: meta?.status || "unknown" };
}));

// ---- API -> GAS mappings (GETs) with cache
app.get("/api/meta", cachedGetHandler(async () => gasGET("getmeta")));
app.get("/api/fights", cachedGetHandler(async () => gasGET("getfights")));
app.get("/api/results", cachedGetHandler(async () => gasGET("getresults")));
app.get("/api/leaderboard", cachedGetHandler(async () => gasGET("getleaderboard")));
app.get("/api/champion", cachedGetHandler(async () => gasGET("getchampion")));
app.get("/api/userlock", cachedGetHandler(async (req) => gasGET("getuserlock", { username: req.query.username || "" })));
app.get("/api/userpicks", cachedGetHandler(async (req) => gasGET("getuserpicks", { username: req.query.username || "" })));

// NEW: Bootstrap bundle
app.get("/api/bootstrap", cachedGetHandler(async (req) => {
  const username = req.query.username || "";
  return gasGET("bootstrap", { username });
}));

// Also support /api?action=bootstrap&username=...
app.get("/api", cachedGetHandler(async (req) => {
  const action = String(req.query.action || "").toLowerCase();
  const username = req.query.username || "";
  switch (action) {
    case "bootstrap": return gasGET("bootstrap", { username });
    case "getmeta": return gasGET("getmeta");
    case "getfights": return gasGET("getfights");
    case "getresults": return gasGET("getresults");
    case "getleaderboard": return gasGET("getleaderboard");
    case "getchampion": return gasGET("getchampion");
    case "getuserlock": return gasGET("getuserlock", { username });
    case "getuserpicks": return gasGET("getuserpicks", { username });
    default: return { ok: false, error: "Unknown action" };
  }
}));

// ---- API -> GAS mappings (POSTs) + targeted cache busts
app.post("/api/submitpicks", async (req, res) => {
  try {
    const { username, pin, picks } = req.body || {};
    const out = await gasPOST("submitpicks", { username, pin, picks });
    // Bust data that likely changed
    invalidateAll("/api/results", "/api/leaderboard", "/api/bootstrap", `/api/userpicks?username=${encodeURIComponent(username || "")}`);
    return res.json(out);
  } catch (e) {
    return res.status(e.status || 502).json({ ok:false, error:String(e.message||e) });
  }
});

app.post("/api/setevent", async (req, res) => {
  try {
    const { url, lockout_iso, lockout_local, tz } = req.body || {};
    const out = await gasPOST("setevent", { url, lockout_iso, lockout_local, tz });
    // Bust everything reasonably impacted
    invalidateAll("/api/meta", "/api/fights", "/api/results", "/api/leaderboard", "/api/champion", "/api/bootstrap", "/api/userpicks", "/api/userlock");
    return res.json(out);
  } catch (e) {
    return res.status(e.status || 502).json({ ok:false, error:String(e.message||e) });
  }
});

app.post("/api/repairlabels", async (req, res) => {
  try {
    const out = await gasPOST("repairlabels", {});
    // Wide invalidation (safer)
    invalidateAll("/api");
    return res.json(out);
  } catch (e) {
    return res.status(e.status || 502).json({ ok:false, error:String(e.message||e) });
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
