const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// Hard-coded GAS URL (no env var required)
const GAS_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok:true, gas_configured: true }));

app.post("/api", async (req, res) => {
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    try { res.status(r.status).json(JSON.parse(text)); }
    catch { res.status(r.status).send(text); }
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Legacy GET aliases for old calls if any
app.get("/api/card",        (_req, res) => proxy(res, "getCard"));
app.get("/api/results",     (_req, res) => proxy(res, "getResults"));
app.get("/api/leaderboard", (_req, res) => proxy(res, "getLeaderboard"));
app.get("/api/champion",    (_req, res) => proxy(res, "getChampionBanner"));
async function proxy(res, action){
  try {
    const r = await fetch(GAS_URL, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ action })
    });
    const text = await r.text();
    try { res.status(r.status).json(JSON.parse(text)); }
    catch { res.status(r.status).send(text); }
  }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e) }); }
}

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, ()=> console.log(`Server on :${PORT}`));
