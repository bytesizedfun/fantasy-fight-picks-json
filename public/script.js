// ===== DOM helpers =====
const $id = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $id(id); if (el) el.textContent = v; };
const setVal  = (id, v) => { const el = $id(id); if (el) el.value = v; };

// ===== API base =====
const API_BASE = (typeof window !== "undefined" && window.API_BASE) || "/api";
setText("apiBaseText", API_BASE);

// ===== small utils =====
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJSON(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" }, ...opts });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function postJSON(path, body) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
function html(s){return String(s??"").replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}

// ===== robust field pickers (accepts many shapes) =====
function pick(obj, keys, def="") {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return String(obj[k]);
  }
  return def;
}
function normalizeFightRow(r) {
  // Accept: fighter1/fighter2 OR "Fighter 1"/"Fighter 2" OR f1/f2, etc.
  const f1 = pick(r, ["fighter1","Fighter 1","f1","F1","fighter_one","fighter-1"]);
  const f2 = pick(r, ["fighter2","Fighter 2","f2","F2","fighter_two","fighter-2"]);
  let fight = pick(r, ["fight","Fight"]);
  if (!fight && (f1 || f2)) fight = `${f1 || "TBD"} vs ${f2 || "TBD"}`;
  const f1Odds = pick(r, ["f1Odds","F1 Odds","odds1","odds_1"]);
  const f2Odds = pick(r, ["f2Odds","F2 Odds","odds2","odds_2"]);
  const underdog = pick(r, ["underdog","Underdog"]);
  const underdogOdds = pick(r, ["underdogOdds","Underdog Odds","underdog_odds"]);
  return { fight, fighter1: f1, fighter2: f2, f1Odds, f2Odds, underdog, underdogOdds };
}

// ===== app state =====
let FIGHTS = [];
let MY_PICKS = {};      // { [fight]: { winner, method, round } }
let RESULTS = {};       // { [fight]: { winner, method, round, underdog: "Y"/"N" } }
let SCORES  = {};       // { username: points }
let CHAMPM = "";

const METHODS = ["Decision","KO/TKO","Submission"];
const ROUNDS  = ["N/A","1","2","3","4","5"];

// ===== render =====
function badge(text) {
  return `<span class="badge">${html(text)}</span>`;
}

function ensurePick(fight) {
  if (!MY_PICKS[fight]) MY_PICKS[fight] = { winner: "", method: "Decision", round: "N/A" };
}

function renderFights() {
  const el = $id("fights"); if (!el) return;
  const q = ($id("search")?.value || "").toLowerCase().trim();

  const rows = FIGHTS
    .filter(f => {
      if (!q) return true;
      return (
        String(f.fight).toLowerCase().includes(q) ||
        String(f.fighter1).toLowerCase().includes(q) ||
        String(f.fighter2).toLowerCase().includes(q)
      );
    })
    .map(f => {
      const key = f.fight;
      const pick = MY_PICKS[key] || {};
      const method = pick.method || "Decision";
      const round = pick.round || (method === "Decision" ? "N/A" : "1");
      return `
        <div class="fight" data-fight="${encodeURIComponent(key)}">
          <div class="line">
            <div>${html(f.fighter1)} ${f.f1Odds ? " " + badge(f.f1Odds) : ""}</div>
            <div class="vs">vs</div>
            <div class="right">${html(f.fighter2)} ${f.f2Odds ? " " + badge(f.f2Odds) : ""}</div>
          </div>
          <div class="line" style="grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px;">
            <select class="pick-winner">
              <option value="">— Pick winner —</option>
              ${[f.fighter1,f.fighter2].filter(Boolean).map(name => `<option value="${html(name)}" ${pick.winner===name?"selected":""}>${html(name)}</option>`).join("")}
            </select>
            <select class="pick-method">
              ${METHODS.map(m => `<option value="${m}" ${m===method?"selected":""}>${m}</option>`).join("")}
            </select>
            <select class="pick-round" ${method==="Decision"?"disabled":""}>
              ${ROUNDS.map(r => `<option value="${r}" ${r===round?"selected":""}>${r}</option>`).join("")}
            </select>
          </div>
        </div>
      `;
    });

  el.innerHTML = rows.join("") || `<div class="muted">No fights found.</div>`;

  // wire controls
  el.querySelectorAll(".fight").forEach(card => {
    const fight = decodeURIComponent(card.getAttribute("data-fight") || "");
    const selW = card.querySelector(".pick-winner");
    const selM = card.querySelector(".pick-method");
    const selR = card.querySelector(".pick-round");

    const syncRound = () => {
      if (selM.value === "Decision") { selR.value = "N/A"; selR.disabled = true; }
      else { if (selR.value === "N/A") selR.value = "1"; selR.disabled = false; }
    };

    selW?.addEventListener("change", () => { ensurePick(fight); MY_PICKS[fight].winner = selW.value || ""; });
    selM?.addEventListener("change", () => { ensurePick(fight); MY_PICKS[fight].method = selM.value; syncRound(); MY_PICKS[fight].round = selR.value; });
    selR?.addEventListener("change", () => { ensurePick(fight); MY_PICKS[fight].round = selR.value; });

    syncRound();
  });
}

function renderResults() {
  const tb = $id("resultsBody"); if (!tb) return;
  const rows = Object.entries(RESULTS).map(([fight, r]) => `
    <tr>
      <td>${html(fight)}</td>
      <td>${html(r.winner || "")}</td>
      <td>${html(r.method || "")}</td>
      <td class="center">${r.method==="Decision" ? "N/A" : html(r.round || "")}</td>
      <td class="center">${r.underdog==="Y" ? "✔︎" : ""}</td>
    </tr>
  `);
  tb.innerHTML = rows.join("");
}

function renderLeaderboard() {
  const tb = $id("leaderboardBody"); if (!tb) return;
  const entries = Object.entries(SCORES).map(([u, pts]) => ({ u, pts: Number(pts || 0) }))
    .sort((a,b) => b.pts - a.pts);

  if (!entries.length) {
    tb.innerHTML = "";
    setText("leaderboardNote", "Leaderboard will populate once results start (or is currently held until lockout).");
    return;
  }
  setText("leaderboardNote", CHAMPM || "");
  tb.innerHTML = entries.map(r => `<tr><td>${html(r.u)}</td><td class="right">${r.pts}</td></tr>`).join("");
}

function setBanner(msg) {
  const el = $id("champBanner"); if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

// ===== loaders =====
async function loadHealth() {
  try { await getJSON("/health"); setText("appStatus","ok"); }
  catch { setText("appStatus","API error"); }
}
async function loadBanner() {
  try { const j = await getJSON("/champion-banner"); setBanner(j.message || ""); }
  catch { try { const j2 = await getJSON("/champion"); setBanner(j2.message || ""); } catch { setBanner(""); } }
}
async function loadFights() {
  const raw = await getJSON("/fights");
  const arr = Array.isArray(raw) ? raw : [];
  FIGHTS = arr.map(normalizeFightRow).filter(f => f.fight && (f.fighter1 || f.fighter2));
  renderFights();
  setText("appStatus", `ready`);
}
async function loadMyPicks() {
  const name = $id("username")?.value?.trim(); if (!name) return;
  const j = await postJSON("/picks", { action: "getUserPicks", username: name });
  if (j && j.success && Array.isArray(j.picks)) {
    MY_PICKS = {};
    j.picks.forEach(p => { MY_PICKS[p.fight] = { winner: p.winner, method: p.method, round: p.round }; });
    renderFights();
    setText("submitMsg", `Loaded picks for ${name}.`);
  }
}
async function loadLeaderboard() {
  try {
    const j = await getJSON("/leaderboard");
    SCORES  = j?.scores || {};
    RESULTS = j?.fightResults || {};
    CHAMPM  = j?.champMessage || "";
    if (CHAMPM) setBanner(CHAMPM);
    renderResults();
    renderLeaderboard();
  } catch (e) { console.warn("leaderboard fetch failed:", e); }
}

// ===== actions =====
async function submitPicks() {
  const btn = $id("submitBtn");
  const name = $id("username")?.value?.trim();
  const msg = $id("submitMsg");
  if (!name) { msg.textContent = "Enter your username first."; return; }

  const picks = [];
  FIGHTS.forEach(f => {
    const p = MY_PICKS[f.fight];
    if (p && p.winner) {
      picks.push({
        fight: f.fight,
        winner: p.winner,
        method: p.method || "Decision",
        round: (p.method === "Decision") ? "N/A" : (p.round || "1"),
      });
    }
  });
  if (!picks.length) { msg.textContent = "Make at least one pick."; return; }

  btn.disabled = true; msg.textContent = "Submitting…";
  try {
    const j = await postJSON("/submit", { action: "submitPicks", username: name, picks });
    if (j?.success) { msg.textContent = "Picks submitted ✅"; await loadLeaderboard(); }
    else { msg.textContent = j?.error || "Submit failed."; }
  } catch { msg.textContent = "Submit failed."; }
  finally { btn.disabled = false; }
}

// ===== init =====
async function init() {
  $id("search")?.addEventListener("input", renderFights);
  $id("submitBtn")?.addEventListener("click", submitPicks);
  $id("loadPicksBtn")?.addEventListener("click", loadMyPicks);

  await loadHealth();
  await loadBanner();
  await loadFights();
  await loadLeaderboard();

  // Periodic refresh during event night
  setInterval(loadLeaderboard, 30000);
}
document.addEventListener("DOMContentLoaded", init);
