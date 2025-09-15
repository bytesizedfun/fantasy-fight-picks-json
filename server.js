const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

let rateLimit;
try { rateLimit = require("express-rate-limit"); }
catch { console.warn("[warn] express-rate-limit not installed; continuing without rate limits."); rateLimit = () => (req,res,next)=>next(); }

const fetch = require("node-fetch");

const PORT = process.env.PORT || 3000;
// Hard-wired GAS URL (env can override if you add it later)
const GAS_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cors());
app.use(morgan("tiny"));
app.use(rateLimit({ windowMs: 60_000, max: 300 }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), gasUrlPresent: Boolean(GAS_URL) });
});

async function gasFetch(payload) {
  if (!GAS_URL) throw new Error("GAS_URL missing");
  const r = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeout: 20_000
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: r.status }; }
}

app.get("/api/fights", async (req, res) => {
  try {
    const data = await gasFetch({ action: "getFights" });
    if (!Array.isArray(data)) return res.status(200).json({ message: "GAS getFights did not return an array", data });
    res.json(data);
  } catch (e) {
    console.error("[/api/fights] error", e);
    res.status(500).json({ error: "Failed to load fights from GAS", detail: String(e.message || e) });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try { res.json(await gasFetch({ action: "getLeaderboard" })); }
  catch (e) { console.error("[/api/leaderboard] error", e); res.status(500).json({ error: "Failed to fetch leaderboard", detail: String(e.message || e) }); }
});

app.get("/api/championBanner", async (req, res) => {
  try { res.json(await gasFetch({ action: "getChampionBanner" })); }
  catch (e) { console.error("[/api/championBanner] error", e); res.status(500).json({ error: "Failed to fetch champion banner", detail: String(e.message || e) }); }
});

app.post("/api/submit", async (req, res) => {
  try {
    const { username, picks } = req.body || {};
    res.json(await gasFetch({ action: "submitPicks", username, picks }));
  } catch (e) {
    console.error("[/api/submit] error", e);
    res.status(500).json({ error: "Failed to submit picks", detail: String(e.message || e) });
  }
});

app.use(express.static("public"));

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
  console.log(`[server] using GAS_URL: ${GAS_URL.replace(/\/exec.*/i, "/exec")}`);
});
