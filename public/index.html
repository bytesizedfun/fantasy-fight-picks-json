// ===== DOM helpers =====
const $id = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $id(id); if (el) el.textContent = v; };
const html = (s)=>String(s??"").replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ===== API base =====
const API_BASE = (typeof window !== "undefined" && window.API_BASE) || "/api";
setText("apiBaseText", API_BASE);

// ===== storage & cookies (restore original “remember me” feel) =====
function setCookie(name, value, days=365) {
  try {
    const d = new Date(); d.setTime(d.getTime() + days*24*60*60*1000);
    document.cookie = `${name}=${encodeURIComponent(value||"")}; expires=${d.toUTCString()}; path=/`;
  } catch {}
}
function getCookie(name) {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )'+name.replace(/([.$?*|{}()[\]\\/+^])/g,'\\$1')+'=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}
function saveUsername(name) {
  try { localStorage.setItem("FFP_USER", name||""); } catch {}
  setCookie("FFP_USER", name||"");
}
function loadSavedUsername() {
  try {
    const qp = new URLSearchParams(location.search);
    const qUser = qp.get("user") || qp.get("username");
    if (qUser) return qUser;
  } catch {}
  const ls = (()=>{ try { return localStorage.getItem("FFP_USER")||""; } catch { return ""; } })();
  if (ls) return ls;
  const ck = getCookie("FFP_USER");
  return ck || "";
}

// ===== utils =====
async function getJSON(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" }, ...opts });
  if (!res.ok) {
    const t = await res.text().catch(()=>String(res.status));
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
    const t = await res.text().catch(()=>String(res.status));
    throw new Error(`POST ${url} -> ${res.status}: ${t}`);
  }
  return res.json();
}

// ===== state (strict to your GAS shape) =====
let FIGHTS = [];        // [{fight,fighter1,fighter2,f1Odds,f2Odds,underdog,underdogOdds}]
let MY_PICKS = {};      // { [fight]: { winner, method, round } }
let RESULTS = {};       // { [fight]: { winner, method, round, underdog:"Y"|"N" } }
let SCORES  = {};       // { username: points }
let CHAMPM  = "";

const METHODS = ["Decision","KO/TKO","Submission"];
const ROUNDS  = ["N/A","1","2","3","4","5"];

// ===== render =====
function ensurePick(fight) {
  if (!MY_PICKS[fight]) MY_PICKS[fight] = { winner: "", method: "Decision", round: "N/A" };
}
function renderFights() {
  const mount = $id("fights"); if (!mount) return;

  const rows = FIGHTS.map(f => {
    const key = f.fight;
    const pick = MY_PICKS[key] || {};
    const method = pick.method || "Decision";
    const round  = pick.round  || (method==="Decision" ? "N/A" : "1");

    return `
      <div class="fight" data-fight="${encodeURIComponent(key)}">
        <div class="fight-line">
          <div class="fighter fighter--left">
            ${html(f.fighter1)} ${f.f1Odds ? ` <span class="odds">${html(f.f1Odds)}</span>` : ""}
          </div>
            <div class="vs">vs</div>
          <div class="fighter fighter--right">
            ${html(f.fighter2)} ${f.f2Odds ? ` <span class="odds">${html(f.f2Odds)}</span>` : ""}
          </div>
        </div>
        ${f.underdog ? `<div class="underdog">Underdog: ${html(f.underdog)}${f.underdogOdds ? " " + html(f.underdogOdds) : ""}</div>` : ""}
        <div class="fight-picks">
          <select class="pick-winner">
            <option value="">— Pick winner —</option>
            <option value="${html(f.fighter1)}" ${pick.winner===f.fighter1?"selected":""}>${html(f.fighter1)}</option>
            <option value="${html(f.fighter2)}" ${pick.winner===f.fighter2?"selected":""}>${html(f.fighter2)}</option>
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

  mount.innerHTML = rows.join("") || `<div class="hint">No fights found.</div>`;

  // hook up selectors
  mount.querySelectorAll(".fight").forEach(card => {
    const fight = decodeURIComponent(card.getAttribute("data-fight") || "");
    const selW = card.querySelector(".pick-winner");
    const selM = card.querySelector(".pick-method");
    const selR = card.querySelector(".pick-round");

    const syncRound = () => {
      if (selM.value === "Decision") { selR.value="N/A"; selR.disabled=true; }
      else { if (selR.value==="N/A") selR.value="1"; selR.disabled=false; }
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
  const note = $id("leaderboardNote");

  const entries = Object.entries(SCORES).map(([u, pts]) => ({ u, pts: Number(pts || 0) }))
    .sort((a,b) => b.pts - a.pts);

  if (!entries.length) {
    tb.innerHTML = "";
    if (note) note.textContent = "Leaderboard will populate once results start (or is being held until lockout).";
    return;
  }
  if (note) note.textContent = CHAMPM || "";
  tb.innerHTML = entries.map(r => `<tr><td>${html(r.u)}</td><td class="right">${r.pts}</td></tr>`).join("");
}

function setBanner(msg) {
  const el = $id("champBanner"); if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = "block"; }
  else { el.textContent = ""; el.style.display = "none"; }
}

function showWelcome(name) {
  const sec = $id("welcomeSection");
  const txt = $id("welcomeText");
  if (!sec || !txt) return;
  if (name) {
    txt.textContent = `Welcome, ${name}!`;
    sec.style.display = "block";
  } else {
    txt.textContent = "";
    sec.style.display = "none";
  }
}

// ===== loads =====
async function loadHealth() {
  try { await getJSON("/health"); setText("appStatus","ok"); }
  catch (e) { setText("appStatus","API error"); console.error(e); }
}
async function loadBanner() {
  // Your server exposes GET /champion
  try { const j = await getJSON("/champion"); setBanner(j.message || ""); }
  catch { setBanner(""); }
}
async function loadFights() {
  const arr = await getJSON("/fights"); // strict GAS shape
  FIGHTS = (Array.isArray(arr)?arr:[]).filter(r =>
    r && typeof r.fight === "string" && (r.fighter1 || r.fighter2)
  ).map(r => ({
    fight: r.fight,
    fighter1: r.fighter1 || "",
    fighter2: r.fighter2 || "",
    f1Odds: r.f1Odds || "",
    f2Odds: r.f2Odds || "",
    underdog: r.underdog || "",
    underdogOdds: r.underdogOdds || ""
  }));
  renderFights();
  setText("appStatus","ready");
}
async function loadMyPicks() {
  const name = $id("username")?.value?.trim();
  if (!name) { setText("loginHint","Enter your username first."); return; }
  const j = await postJSON("/picks", { action: "getUserPicks", username: name });
  if (j && j.success && Array.isArray(j.picks)) {
    MY_PICKS = {};
    j.picks.forEach(p => { MY_PICKS[p.fight] = { winner: p.winner, method: p.method, round: p.round }; });
    renderFights();
    setText("loginHint", `Loaded picks for ${name}.`);
    saveUsername(name);
    showWelcome(name);
  } else {
    setText("loginHint","Could not load picks.");
  }
}
async function loadLeaderboard() {
  try {
    // IMPORTANT: your server has POST /leaderboard (not GET)
    const j = await postJSON("/leaderboard", { action: "getLeaderboard" });
    SCORES  = j?.scores || {};
    RESULTS = j?.fightResults || {};
    CHAMPM  = j?.champMessage || "";
    if (CHAMPM) setBanner(CHAMPM);
    renderResults();
    renderLeaderboard();
  } catch (e) {
    console.warn("leaderboard fetch failed:", e);
  }
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
    if (j?.success) {
      msg.textContent = "Picks submitted ✅";
      saveUsername(name);
      showWelcome(name);
      await loadLeaderboard();
    } else {
      msg.textContent = j?.error || "Submit failed.";
      console.error("Submit error payload:", j);
    }
  } catch (e) {
    msg.textContent = "Submit failed.";
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

// ===== init =====
function wire() {
  $id("submitBtn")?.addEventListener("click", submitPicks);
  $id("loadPicksBtn")?.addEventListener("click", loadMyPicks);

  // Detect saved username and greet + prefill + auto-load picks
  const saved = loadSavedUsername();
  if (saved) {
    const u = $id("username");
    if (u) u.value = saved;
    showWelcome(saved);
    // auto-load saved user's picks like the original did
    loadMyPicks().catch(()=>{});
  }
}
async function init() {
  wire();
  await loadHealth();
  await loadBanner();
  await loadFights();
  await loadLeaderboard();
  // periodic refresh during event night
  setInterval(loadLeaderboard, 30000);
}
document.addEventListener("DOMContentLoaded", init);
