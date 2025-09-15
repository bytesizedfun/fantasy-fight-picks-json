/* Frontend client — fast & minimal */

const API_BASE = (location.origin.includes("localhost"))
  ? "http://localhost:3000/api"
  : `${location.origin}/api`;

const el = (id) => document.getElementById(id);
const loginCard = el("loginCard");
const picksCard = el("picksCard");
const weeklyCard = el("weeklyCard");
const allTimeCard = el("allTimeCard");
const fightsWrap = el("fights");
const loginBtn = el("loginBtn");
const submitBtn = el("submitBtn");

let STATE = {
  token: null,
  user: null,
  meta: null,
  fights: [],
  results: [],
  picksLocked: false,
  mySubmitted: false,
};

function prettyTime(t) {
  try { return new Date(t).toLocaleString(); } catch { return t; }
}

async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && STATE.token) headers["X-Session-Token"] = STATE.token;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "omit",
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(`API ${path} ${res.status} ${txt}`);
  }
  return res.json();
}

/* Login */
loginBtn.addEventListener("click", async () => {
  const username = el("username").value.trim();
  const pin = el("pin").value.trim();
  if (!username || !/^\d{4}$/.test(pin)) {
    el("loginMsg").textContent = "Enter username and 4-digit PIN.";
    return;
  }
  loginBtn.disabled = true;
  el("loginMsg").textContent = "Signing in…";
  try {
    const data = await api("/login", { method: "POST", body: { username, pin } });
    STATE.token = data.token;
    STATE.user = data.user;
    localStorage.setItem("ffp_username", username);
    localStorage.setItem("ffp_token", STATE.token);
    el("welcome").textContent = `Hi, ${STATE.user.username}`;
    loginCard.classList.add("hidden");
    picksCard.classList.remove("hidden");
    weeklyCard.classList.remove("hidden");
    allTimeCard.classList.remove("hidden");
    await initAfterLogin();
  } catch (e) {
    el("loginMsg").textContent = e.message;
  } finally {
    loginBtn.disabled = false;
  }
});

async function initPublic() {
  const [meta, fights, results, weekly, alltime] = await Promise.all([
    api("/meta"),
    api("/fights"),
    api("/results"),
    api("/weekly"),
    api("/alltime"),
  ]);
  STATE.meta = meta;
  STATE.fights = fights;
  STATE.results = results;

  el("eventName").textContent = meta.event_name || "Event";
  el("lockInfo").textContent = `Lock: ${prettyTime(meta.lock_at)}`;

  renderFights();
  renderWeekly(weekly);
  renderAllTime(alltime);

  const cachedU = localStorage.getItem("ffp_username");
  const cachedT = localStorage.getItem("ffp_token");
  if (cachedU && cachedT) {
    // try token
    STATE.token = cachedT;
    STATE.user = { username: cachedU };
    el("welcome").textContent = `Hi, ${cachedU}`;
    loginCard.classList.add("hidden");
    picksCard.classList.remove("hidden");
    weeklyCard.classList.remove("hidden");
    allTimeCard.classList.remove("hidden");
    await initAfterLogin();
  }
}

async function initAfterLogin() {
  // Check if user already submitted
  try {
    const mine = await api("/picks/mine", { auth: true });
    STATE.mySubmitted = !!(mine && mine.length);
    if (STATE.mySubmitted) {
      el("status").textContent = "Submitted ✅";
      submitBtn.disabled = true;
      // paint my picks
      hydrateSelections(mine);
    } else {
      el("status").textContent = "Not submitted";
    }
  } catch {
    // ignore
  }
}

function isLocked() {
  const now = Date.now();
  const t = Date.parse(STATE.meta?.lock_at || 0);
  return now >= t;
}

function renderFights() {
  fightsWrap.innerHTML = "";
  const locked = isLocked();
  STATE.picksLocked = locked;

  STATE.fights.forEach((f) => {
    const isDogF1 = (f.underdog || "").toLowerCase().includes("1");
    const isMain = String(f.is_main_event).toLowerCase() === "true";

    const row = document.createElement("div");
    row.className = "fight";
    row.dataset.fight = f.fight;

    const fighters = document.createElement("div");
    fighters.className = "fighters";
    const a = document.createElement("div");
    a.className = "fighter";
    a.innerHTML = `<span>${f.fighter_1} ${isDogF1 ? '🐶' : ''}</span>`;
    const b = document.createElement("div");
    b.className = "fighter";
    b.innerHTML = `<span>${f.fighter_2} ${!isDogF1 ? '🐶' : ''}</span>`;
    fighters.append(a,b);

    const pick = document.createElement("select");
    pick.innerHTML = `
      <option value="">Winner</option>
      <option value="${f.fighter_1}">${f.fighter_1} ${isDogF1 ? '🐶' : ''}</option>
      <option value="${f.fighter_2}">${f.fighter_2} ${!isDogF1 ? '🐶' : ''}</option>
    `;

    const method = document.createElement("select");
    method.innerHTML = `
      <option value="">Method</option>
      <option value="KO/TKO">KO/TKO</option>
      <option value="Submission">Submission</option>
      <option value="Decision">Decision</option>
    `;

    const rounds = isMain ? [1,2,3,4,5] : [1,2,3];
    const round = document.createElement("select");
    round.innerHTML = `<option value="">Round</option>${rounds.map(r=>`<option value="${r}">${r}</option>`).join("")}
      <option value="N/A">N/A</option>`;

    pick.addEventListener("change", () => {
      // no special link
    });
    method.addEventListener("change", () => {
      if (method.value === "Decision") {
        round.value = "N/A";
        round.disabled = true;
      } else {
        if (round.value === "N/A") round.value = "";
        round.disabled = false;
      }
    });

    if (locked) {
      pick.disabled = true; method.disabled = true; round.disabled = true;
    }

    row.append(fighters, pick, method, round);
    fightsWrap.appendChild(row);
  });
}

function hydrateSelections(mine) {
  const map = new Map();
  mine.forEach(p => map.set(p.fight, p));
  document.querySelectorAll(".fight").forEach(row => {
    const fId = row.dataset.fight;
    const p = map.get(fId);
    if (!p) return;
    const [pick, method, round] = row.querySelectorAll("select");
    pick.value = p.winner || "";
    method.value = p.method || "";
    round.value = p.round || "";
    pick.disabled = true; method.disabled = true; round.disabled = true;
  });
}

/* Submit picks (once, no edits) */
submitBtn.addEventListener("click", async () => {
  if (!STATE.token) { el("submitMsg").textContent = "Please login first."; return; }
  if (isLocked()) { el("submitMsg").textContent = "Picks are locked."; return; }
  if (STATE.mySubmitted) { el("submitMsg").textContent = "You already submitted."; return; }

  const rows = [...document.querySelectorAll(".fight")];
  const payload = rows.map(row => {
    const selects = row.querySelectorAll("select");
    return {
      fight: row.dataset.fight,
      winner: selects[0].value || "",
      method: selects[1].value || "",
      round: selects[2].value || "",
    };
  });

  // basic validation (winner required at least)
  for (const p of payload) {
    if (!p.winner) { el("submitMsg").textContent = `Choose winner for "${p.fight}".`; return; }
    if (!p.method) { el("submitMsg").textContent = `Choose method for "${p.fight}".`; return; }
    if (p.method === "Decision") p.round = "N/A";
    if (!p.round) { el("submitMsg").textContent = `Choose round for "${p.fight}".`; return; }
  }

  submitBtn.disabled = true;
  el("submitMsg").textContent = "Submitting…";

  try {
    const res = await api("/picks", { method: "POST", auth: true, body: { picks: payload } });
    STATE.mySubmitted = true;
    el("status").textContent = "Submitted ✅";
    // lock UI
    document.querySelectorAll(".fight select").forEach(s => s.disabled = true);
    el("submitMsg").textContent = "Saved!";
  } catch (e) {
    el("submitMsg").textContent = e.message;
  } finally {
    submitBtn.disabled = true;
  }
});

/* Leaderboards */
el("refreshWeekly").addEventListener("click", async () => {
  try {
    const weekly = await api("/weekly");
    renderWeekly(weekly);
  } catch (e) {
    // ignore
  }
});

function renderWeekly(weekly) {
  const t = el("weeklyTable");
  if (!weekly || !weekly.length) {
    t.innerHTML = `<tr><td>No entries yet.</td></tr>`;
    return;
  }
  t.innerHTML = `
    <tr><th style="width:60px">Rank</th><th>User</th><th style="width:120px">Points</th></tr>
    ${weekly.map((r,i)=>`
      <tr>
        <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
        <td>${r.username}</td>
        <td><strong class="points">${r.points}</strong></td>
      </tr>`).join("")}
  `;
}
function renderAllTime(rows) {
  const t = el("allTimeTable");
  if (!rows || !rows.length) { t.innerHTML = `<tr><td>No data</td></tr>`; return; }
  t.innerHTML = `
    <tr><th>User</th><th style="width:120px">Points</th></tr>
    ${rows.map(r=>`<tr><td>${r.username}</td><td>${r.points}</td></tr>`).join("")}
  `;
}

/* Results auto-refresh */
async function refreshResultsLoop(){
  try {
    const meta = await api("/meta");
    if (meta.status === "live") {
      const results = await api("/results");
      STATE.results = results;
      // (Optional) show partial scoring per fight later
    }
  } catch {}
  setTimeout(refreshResultsLoop, 30000); // 30s
}

initPublic().then(()=>refreshResultsLoop());
