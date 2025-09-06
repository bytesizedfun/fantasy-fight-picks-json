// ---------- DOM helpers (prevents null .value crashes) ----------
const $id = (id) => document.getElementById(id);
const setValue = (id, v) => { const el = $id(id); if (el) el.value = v; };
const setText  = (id, v) => { const el = $id(id); if (el) el.textContent = v; };

// ---------- API base ----------
const API_BASE = (typeof window !== "undefined" && window.API_BASE) || "/api";
setText("apiBaseText", API_BASE);

// ---------- tiny utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJSON(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    ...opts,
  });
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

// ---------- app state ----------
let FIGHTS = [];        // [{fight, fighter1, fighter2, underdog, underdogOdds, f1Odds, f2Odds}]
let MY_PICKS = {};      // { [fight]: { winner, method, round } }
let RESULTS = {};       // { [fight]: { winner, method, round, underdog: "Y"|"N" } }
let SCORES  = {};       // { username: points }
let CHAMPM = "";        // champion banner message if present

const METHODS = ["Decision", "KO/TKO", "Submission"];
const ROUNDS  = ["N/A", "1", "2", "3", "4", "5"];

// ---------- UI renderers ----------
function badge(text, cls = "") {
  return `<span class="${cls}" style="display:inline-block;padding:.2rem .5rem;border:1px solid var(--border);border-radius:999px;background:#131b28;">${text}</span>`;
}

function renderFights() {
  const el = $id("fights");
  if (!el) return;
  const q = ($id("search")?.value || "").trim().toLowerCase();

  const rows = FIGHTS.filter(f => {
    if (!q) return true;
    return (
      String(f.fight).toLowerCase().includes(q) ||
      String(f.fighter1).toLowerCase().includes(q) ||
      String(f.fighter2).toLowerCase().includes(q)
    );
  }).map(f => {
    const key = f.fight;
    const pick = MY_PICKS[key] || {};
    const method = pick.method || "Decision";
    const round  = pick.round  || (method === "Decision" ? "N/A" : "1");

    return `
      <div class="fight" data-fight="${encodeURIComponent(key)}">
        <div class="line">
          <div>${f.fighter1} ${f.f1Odds ? badge(f.f1Odds, "muted") : ""}</div>
          <div class="vs">vs</div>
          <div class="right">${f.fighter2} ${f.f2Odds ? badge(f.f2Odds, "muted") : ""}</div>
        </div>
        <div class="odds">
          ${f.underdog ? `Underdog: ${badge(f.underdog + (f.underdogOdds ? " " + f.underdogOdds : ""), "underdog")}` : ""}
        </div>
        <div class="row-3" style="margin-top:8px;">
          <select class="pick-winner">
            <option value="">— Pick winner —</option>
            <option value="${html(f.fighter1)}" ${pick.winner===f.fighter1?"selected":""}>${f.fighter1}</option>
            <option value="${html(f.fighter2)}" ${pick.winner===f.fighter2?"selected":""}>${f.fighter2}</option>
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

  // wire up change handlers
  el.querySelectorAll(".fight").forEach(node => {
    const fight = decodeURIComponent(node.getAttribute("data-fight") || "");
    const selW = node.querySelector(".pick-winner");
    const selM = node.querySelector(".pick-method");
    const selR = node.querySelector(".pick-round");

    const syncRoundEnabled = () => {
      if (selM.value === "Decision") {
        selR.value = "N/A";
        selR.disabled = true;
      } else {
        if (selR.value === "N/A") selR.value = "1";
        selR.disabled = false;
      }
    };

    selW?.addEventListener("change", () => {
      ensurePick(fight);
      MY_PICKS[fight].winner = selW.value || "";
    });
    selM?.addEventListener("change", () => {
      ensurePick(fight);
      MY_PICKS[fight].method = selM.value;
      syncRoundEnabled();
      MY_PICKS[fight].round = selR.value;
    });
    selR?.addEventListener("change", () => {
      ensurePick(fight);
      MY_PICKS[fight].round = selR.value;
    });

    syncRoundEnabled();
  });
}

function renderResults() {
  const tb = $id("resultsBody");
  if (!tb) return;
  const rows = Object.entries(RESULTS).map(([fight, r]) => {
    return `<tr>
      <td>${fight}</td>
      <td>${r.winner || ""}</td>
      <td>${r.method || ""}</td>
      <td class="center">${r.method==="Decision" ? "N/A" : (r.round || "")}</td>
      <td class="center">${r.underdog==="Y" ? "✔︎" : ""}</td>
    </tr>`;
  });
  tb.innerHTML = rows.join("");
}

function renderLeaderboard() {
  const tb = $id("leaderboardBody");
  if (!tb) return;
  const note = $id("leaderboardNote");

  // Scores may be empty before results start; show a hint
  const entries = Object.entries(SCORES).map(([u, pts]) => ({ u, pts: Number(pts || 0) }));
  entries.sort((a,b) => b.pts - a.pts);

  if (!entries.length) {
    tb.innerHTML = "";
    setText("leaderboardNote", "Leaderboard will populate once results start (or is currently held until lockout).");
    return;
  } else {
    setText("leaderboardNote", CHAMPM ? CHAMPM : "");
  }

  tb.innerHTML = entries.map(r => `
    <tr>
      <td>${r.u}</td>
      <td class="right">${r.pts}</td>
    </tr>
  `).join("");
}

function setBanner(msg) {
  const el = $id("champBanner");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

function ensurePick(fight) {
  if (!MY_PICKS[fight]) MY_PICKS[fight] = { winner: "", method: "Decision", round: "N/A" };
}

function html(s) { return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- data loaders ----------
async function loadHealth() {
  try {
    await getJSON("/health");
    setText("appStatus", "ok");
  } catch {
    setText("appStatus", "API error");
  }
}
async function loadBanner() {
  try {
    // Try the path most clients expect; server aliases /api/champion to this
    const j = await getJSON("/champion-banner");
    setBanner(j.message || "");
  } catch {
    try {
      const j2 = await getJSON("/champion");
      setBanner(j2.message || "");
    } catch {
      setBanner("");
    }
  }
}
async function loadFights() {
  const list = await getJSON("/fights");
  // Normalize shape (accepts either {fight,...} or full objects)
  FIGHTS = (Array.isArray(list) ? list : []).map(r => ({
    fight: r.fight,
    fighter1: r.fighter1,
    fighter2: r.fighter2 ?? r.f2 ?? "",
    underdog: r.underdog || "",
    underdogOdds: r.underdogOdds || "",
    f1Odds: r.f1Odds || "",
    f2Odds: r.f2Odds || "",
  }));
  renderFights();
}
async function loadMyPicks() {
  const name = $id("username")?.value?.trim();
  if (!name) return;
  const j = await postJSON("/picks", { action: "getUserPicks", username: name });
  if (j && j.success && Array.isArray(j.picks)) {
    MY_PICKS = {};
    j.picks.forEach(p => {
      MY_PICKS[p.fight] = { winner: p.winner, method: p.method, round: p.round };
    });
    renderFights();
    $id("submitMsg").textContent = `Loaded picks for ${name}.`;
  }
}
async function loadLeaderboard() {
  try {
    // GET preferred (server includes both GET/POST)
    const j = await getJSON("/leaderboard");
    // shape: { scores, fightResults, champs?, champMessage? }
    SCORES = j && j.scores ? j.scores : {};
    RESULTS = j && j.fightResults ? j.fightResults : {};
    CHAMPM = j && j.champMessage ? j.champMessage : "";
    if (CHAMPM) setBanner(CHAMPM);
    renderResults();
    renderLeaderboard();
  } catch (e) {
    console.warn("leaderboard fetch failed:", e);
  }
}

// ---------- actions ----------
async function submitPicks() {
  const btn = $id("submitBtn");
  const name = $id("username")?.value?.trim();
  const msg = $id("submitMsg");

  if (!name) { msg.textContent = "Enter your username first."; return; }

  // Collect picks from rendered fights
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

  btn.disabled = true;
  msg.textContent = "Submitting…";
  try {
    const j = await postJSON("/submit", { action: "submitPicks", username: name, picks });
    if (j && j.success) {
      msg.textContent = "Picks submitted ✅";
      await loadLeaderboard();
    } else {
      msg.textContent = (j && j.error) ? j.error : "Submit failed.";
    }
  } catch (e) {
    msg.textContent = "Submit failed.";
  } finally {
    btn.disabled = false;
  }
}

// ---------- init ----------
async function init() {
  setText("appStatus", "loading…");
  $id("search")?.addEventListener("input", renderFights);
  $id("submitBtn")?.addEventListener("click", submitPicks);
  $id("loadPicksBtn")?.addEventListener("click", loadMyPicks);

  await loadHealth();
  await loadBanner();
  await loadFights();
  await loadLeaderboard();

  // Refresh leaderboard periodically during event night
  // (low frequency; server/GAS handle lockout logic + caching)
  setInterval(loadLeaderboard, 30_000);

  setText("appStatus", "ready");
}

document.addEventListener("DOMContentLoaded", init);
