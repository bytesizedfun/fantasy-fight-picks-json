// ===============================
// Fantasy Fight Picks — script.js (FULL RESET)
// ===============================

// ----- tiny DOM helpers -----
const $id = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $id(id); if (el) el.textContent = v; };

// Safe HTML escape
const html = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

// ----- API base -----
const API_BASE = (typeof window !== "undefined" && window.API_BASE) || "/api";
setText("apiBaseText", API_BASE);

// ----- storage & cookies (robust) -----
function setCookie(name, value, days = 365) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value || "")}; expires=${d.toUTCString()}; path=/`;
  } catch {}
}
function getCookie(name) {
  try {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = document.cookie.match(new RegExp("(?:^|; )" + safe + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}
function saveUsername(name) {
  try { localStorage.setItem("FFP_USER", name || ""); } catch {}
  setCookie("FFP_USER", name || "");
}
function loadSavedUsername() {
  try {
    const qp = new URLSearchParams(location.search);
    const qUser = qp.get("user") || qp.get("username");
    if (qUser) return qUser;
  } catch {}
  try {
    const ls = localStorage.getItem("FFP_USER") || "";
    if (ls) return ls;
  } catch {}
  return getCookie("FFP_USER") || "";
}

// ----- net utils -----
async function getJSON(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    ...opts,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => String(res.status));
    throw new Error(`GET ${url} -> ${res.status}: ${t}`);
  }
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
  if (!res.ok) {
    const t = await res.text().catch(() => String(res.status));
    throw new Error(`POST ${url} -> ${res.status}: ${t}`);
  }
  return res.json();
}

// ----- state -----
let FIGHTS = []; // [{fight,fighter1,fighter2,f1Odds,f2Odds,underdog("Fighter 1"/"Fighter 2"), underdogOdds}]
let MY_PICKS = {}; // { [fight]: { winner, method, round } }
let RESULTS = {};  // { [fight]: { winner, method, round } }
let SCORES = {};   // { username: points }
let CHAMP_MSG = ""; // {string}

// constants
const METHODS = ["Decision", "KO/TKO", "Submission"];
const ROUNDS = ["N/A", "1", "2", "3", "4", "5"];

// ============ UI helpers ============
function showWelcome(name) {
  const sec = $id("welcomeSection");
  const txt = $id("welcomeText");
  if (!sec || !txt) return;
  if (name) {
    txt.textContent = `🎤 IIIIIIIIIIIIT’S ${name.toUpperCase()}!`;
    sec.style.display = "block";
  } else {
    txt.textContent = "";
    sec.style.display = "none";
  }
}
function setBanner(msg) {
  const el = $id("champBanner");
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = "block"; }
  else { el.textContent = ""; el.style.display = "none"; }
}
function withDog(label, f, which) {
  const ud = String(f.underdog || "").toLowerCase();
  const isDog = (ud === "fighter 1" && which === 1) || (ud === "fighter 2" && which === 2);
  return isDog ? `${label} 🐶` : label;
}
function ensurePick(fight) {
  if (!MY_PICKS[fight]) MY_PICKS[fight] = { winner: "", method: "Decision", round: "N/A" };
}

// ============ Renderers ============
function renderFights() {
  const mount = $id("fights");
  if (!mount) return;

  const cards = FIGHTS.map((f) => {
    const key = f.fight;
    const p = MY_PICKS[key] || {};
    const f1label = withDog(f.fighter1, f, 1);
    const f2label = withDog(f.fighter2, f, 2);

    const winnerSel = `
      <select class="pick-winner">
        <option value="">— Pick winner —</option>
        <option value="${html(f.fighter1)}"${p.winner===f.fighter1?' selected':''}>${html(f1label)}</option>
        <option value="${html(f.fighter2)}"${p.winner===f.fighter2?' selected':''}>${html(f2label)}</option>
      </select>`;

    const methodSel = `
      <select class="pick-method">
        ${METHODS.map(m => `<option value="${m}"${(p.method||"Decision")===m?' selected':''}>${m}</option>`).join("")}
      </select>`;

    const method = p.method || "Decision";
    const roundVal = method === "Decision" ? "N/A" : (p.round && p.round!=="N/A" ? p.round : "1");
    const roundSel = `
      <select class="pick-round"${method==="Decision" ? " disabled" : ""}>
        ${ROUNDS.map(r => `<option value="${r}"${roundVal===r?' selected':''}>${r}</option>`).join("")}
      </select>`;

    return `
      <div class="fight card" data-fight="${encodeURIComponent(key)}">
        <div class="fight-row">
          <div class="f-col f1">
            <div class="f-name">${html(f1label)}</div>
            ${f.f1Odds ? `<div class="f-odds">${html(f.f1Odds)}</div>` : ""}
          </div>
          <div class="vs">vs</div>
          <div class="f-col f2">
            <div class="f-name">${html(f2label)}</div>
            ${f.f2Odds ? `<div class="f-odds">${html(f.f2Odds)}</div>` : ""}
          </div>
        </div>
        <div class="pick-row">
          <div class="pick winner">${winnerSel}</div>
          <div class="pick method">${methodSel}</div>
          <div class="pick round">${roundSel}</div>
        </div>
      </div>`;
  });

  mount.innerHTML = cards.join("") || `<div class="empty">No fights found.</div>`;

  // wire selectors
  mount.querySelectorAll(".fight").forEach(card => {
    const fight = decodeURIComponent(card.getAttribute("data-fight") || "");
    const selW = card.querySelector(".pick-winner");
    const selM = card.querySelector(".pick-method");
    const selR = card.querySelector(".pick-round");

    const syncRound = () => {
      if (!selM || !selR) return;
      if (selM.value === "Decision") {
        selR.value = "N/A";
        selR.disabled = true;
      } else {
        if (selR.value === "N/A") selR.value = "1";
        selR.disabled = false;
      }
    };

    selW?.addEventListener("change", () => { ensurePick(fight); MY_PICKS[fight].winner = selW.value || ""; });
    selM?.addEventListener("change", () => {
      ensurePick(fight);
      MY_PICKS[fight].method = selM.value || "Decision";
      syncRound();
      MY_PICKS[fight].round = selR?.value || (selM.value === "Decision" ? "N/A" : "1");
    });
    selR?.addEventListener("change", () => {
      ensurePick(fight);
      MY_PICKS[fight].round = selR.value || (selM?.value === "Decision" ? "N/A" : "1");
    });

    syncRound();
  });
}

function renderResults() {
  const tb = $id("resultsBody");
  if (!tb) return;
  const rows = Object.entries(RESULTS).map(([fight, r]) => {
    const rd = r.method === "Decision" ? "N/A" : (r.round || "");
    return `<tr><td>${html(fight)}</td><td>${html(r.winner||"")}</td><td>${html(r.method||"")}</td><td>${html(rd)}</td></tr>`;
  });
  tb.innerHTML = rows.join("");
}

function renderLeaderboard() {
  const tb = $id("leaderboardBody");
  const note = $id("leaderboardNote");
  if (!tb) return;

  const sorted = Object.entries(SCORES).map(([u, pts]) => ({ u, pts: Number(pts||0) }))
    .sort((a,b) => b.pts - a.pts);

  if (!sorted.length) {
    tb.innerHTML = "";
    if (note) note.textContent = "Leaderboard will populate once results start.";
    return;
  }
  let rank = 0, lastPts = null;
  tb.innerHTML = sorted.map((row, idx) => {
    if (row.pts !== lastPts) { rank = idx + 1; lastPts = row.pts; }
    const crown = rank === 1 ? " 👑" : "";
    return `<tr><td class="rank">#${rank}</td><td class="user">${html(row.u)}${crown}</td><td class="pts">${row.pts}</td></tr>`;
  }).join("");

  if (note) note.textContent = CHAMP_MSG || "";
}

// All fights complete?
function allFightsCompleted() {
  if (!FIGHTS.length) return false;
  const completed = FIGHTS.filter(f => {
    const r = RESULTS[f.fight];
    if (!r || !r.winner || !r.method) return false;
    if (r.method === "Decision") return true;
    return !!r.round && r.round !== "N/A";
  }).length;
  return completed === FIGHTS.length;
}

// ============ Loads ============
async function loadHealth() {
  try { await getJSON("/health"); setText("appStatus","ok"); }
  catch (e) { setText("appStatus","API error"); console.error(e); }
}

async function loadBanner() {
  try {
    const j = await getJSON("/champion"); // { message }
    CHAMP_MSG = j?.message || "";
    if (allFightsCompleted()) setBanner(CHAMP_MSG); else setBanner("");
  } catch { setBanner(""); }
}

async function loadFights() {
  const arr = await getJSON("/fights");
  FIGHTS = (Array.isArray(arr)?arr:[])
    .filter(r => r && typeof r.fight === "string" && (r.fighter1 || r.fighter2))
    .map(r => ({
      fight: r.fight,
      fighter1: r.fighter1 || "",
      fighter2: r.fighter2 || "",
      f1Odds: r.f1Odds || "",
      f2Odds: r.f2Odds || "",
      underdog: r.underdog || "", // "Fighter 1"/"Fighter 2"
      underdogOdds: r.underdogOdds || ""
    }));
  renderFights();
  setText("appStatus","ready");
}

async function loadMyPicks() {
  const name = $id("username")?.value?.trim();
  const msgEl = $id("loginHint");
  if (!name) { if (msgEl) msgEl.textContent = "Enter your username first."; return; }
  try {
    const j = await postJSON("/picks", { action: "getUserPicks", username: name });
    if (j && j.success && Array.isArray(j.picks)) {
      MY_PICKS = {};
      j.picks.forEach(p => {
        MY_PICKS[p.fight] = {
          winner: p.winner || "",
          method: p.method || "Decision",
          round:  p.method === "Decision" ? "N/A" : (p.round || "1")
        };
      });
      renderFights();
      if (msgEl) msgEl.textContent = `Loaded picks for ${name}.`;
      saveUsername(name);
      showWelcome(name);
    } else {
      if (msgEl) msgEl.textContent = j?.error || "Could not load picks.";
    }
  } catch (e) {
    console.error(e);
    if (msgEl) msgEl.textContent = "Could not load picks.";
  }
}

async function loadLeaderboard() {
  try {
    const j = await postJSON("/leaderboard", { action: "getLeaderboard" });
    SCORES = j?.scores || {};
    RESULTS = j?.fightResults || {};
    CHAMP_MSG = j?.champMessage || "";

    renderResults();
    renderLeaderboard();
    if (allFightsCompleted()) setBanner(CHAMP_MSG); else setBanner("");
  } catch (e) { console.warn("leaderboard fetch failed:", e); }
}

// ============ Actions ============
async function submitPicks() {
  const btn = $id("submitBtn");
  const name = $id("username")?.value?.trim();
  const msg = $id("submitMsg");
  if (!name) { if (msg) msg.textContent = "Enter your username first."; return; }

  const picks = [];
  FIGHTS.forEach(f => {
    const p = MY_PICKS[f.fight];
    if (p && p.winner) {
      picks.push({
        fight: f.fight,
        winner: p.winner,
        method: p.method || "Decision",
        round:  p.method === "Decision" ? "N/A" : (p.round || "1")
      });
    }
  });
  if (!picks.length) { if (msg) msg.textContent = "Make at least one pick."; return; }

  if (btn) btn.disabled = true;
  if (msg) msg.textContent = "Submitting…";
  try {
    const j = await postJSON("/submit", { action: "submitPicks", username: name, picks });
    if (j?.success) {
      if (msg) msg.textContent = "Picks submitted ✅";
      saveUsername(name);
      showWelcome(name);
      await loadLeaderboard();
    } else {
      if (msg) msg.textContent = j?.error || "Submit failed.";
      console.error("Submit error payload:", j);
    }
  } catch (e) {
    if (msg) msg.textContent = "Submit failed.";
    console.error(e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============ Init ============
function wire() {
  $id("submitBtn")?.addEventListener("click", submitPicks);
  $id("loadPicksBtn")?.addEventListener("click", loadMyPicks);

  const saved = loadSavedUsername();
  if (saved) {
    const u = $id("username");
    if (u) u.value = saved;
    showWelcome(saved);
    loadMyPicks().catch(()=>{});
  }
}
async function init() {
  wire();
  await loadHealth();
  await loadFights();
  await loadLeaderboard();
  await loadBanner();
  setInterval(loadLeaderboard, 30000);
}
document.addEventListener("DOMContentLoaded", init);
