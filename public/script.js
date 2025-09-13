// ==== script.js (full) ====

// Kill any old service workers to avoid stale caches (safe even if none exist)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then(regs => {
    regs.forEach(r => r.unregister().catch(()=>{}));
  }).catch(()=>{});
}

document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  // ---- Fetch helpers: timeout + retries + cache-buster
  function fetchWithTimeout(url, options = {}, timeoutMs = 70000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(t));
  }
  async function getJsonRetry(url, options = {}, { retries = 2, timeoutMs = 70000 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await fetchWithTimeout(url, options, timeoutMs);
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Non-JSON: ${text.slice(0,200)}`);
        }
      } catch (e) {
        lastErr = e;
        if (i < retries) await new Promise(res => setTimeout(res, 800 * (i + 1)));
      }
    }
    throw lastErr;
  }
  function bust(url) {
    const hasQuery = url.includes("?");
    return url + (hasQuery ? "&" : "?") + "cb=" + Date.now();
  }

  // -------- API (calls your Node server's path endpoints) --------
  const api = {
    getFights() {
      const url = bust(`${BASE.replace(/\/$/, "")}/fights`);
      return getJsonRetry(url, { method: "GET", headers: { "Cache-Control": "no-cache" } })
        .catch(() => []);
    },
    getUserPicks(username) {
      const url = `${BASE.replace(/\/$/, "")}/picks`;
      return getJsonRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      }, { retries: 1, timeoutMs: 25000 })
      .catch(() => ({ success:false, picks:[] }));
    },
    submitPicks(payload) {
      const url = `${BASE.replace(/\/$/, "")}/submit`;
      return getJsonRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, { retries: 0, timeoutMs: 30000 })
      .catch(() => ({ success:false, error:"Network error" }));
    },
    getLeaderboard() {
      const url = bust(`${BASE.replace(/\/$/, "")}/leaderboard`);
      return getJsonRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }, { retries: 1, timeoutMs: 40000 })
      .catch(() => ({ scores:{}, fightResults:{} }));
    },
    getChampionBanner() {
      const url = bust(`${BASE.replace(/\/$/, "")}/champion`);
      return getJsonRetry(url, { method: "GET", headers: { "Cache-Control":"no-cache" } },
        { retries: 1, timeoutMs: 25000 })
      .catch(() => ({ message:"" }));
    },
    getHall() {
      const url = bust(`${BASE.replace(/\/$/, "")}/hall`);
      return getJsonRetry(url, { method: "GET", headers: { "Cache-Control":"no-cache" } },
        { retries: 1, timeoutMs: 30000 })
      .catch(() => []);
    }
  };

  // -------- DOM refs --------
  const welcome        = document.getElementById("welcome");
  const fightList      = document.getElementById("fightList");
  const submitBtn      = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput  = document.getElementById("usernameInput");
  const champBanner    = document.getElementById("champBanner");
  const leaderboardEl  = document.getElementById("leaderboard");
  const allTimeList    = document.getElementById("allTimeBoard");
  const weeklyTabBtn   = document.getElementById("tabWeekly");
  const allTimeTabBtn  = document.getElementById("tabAllTime");

  // Create a refresh button + hint container if not present
  let refreshBtn = document.getElementById("refreshBtn");
  if (!refreshBtn) {
    refreshBtn = document.createElement("button");
    refreshBtn.id = "refreshBtn";
    refreshBtn.textContent = "Refresh";
    refreshBtn.style.cssText = "display:none;margin:10px 0;padding:8px 12px;";
    (document.getElementById("controls") || document.body).prepend(refreshBtn);
  }
  function setLoadingHint(on) {
    let hint = document.getElementById("coldStartHint");
    if (on) {
      if (!hint) {
        hint = document.createElement("div");
        hint.id = "coldStartHint";
        hint.textContent = "Warming server… first load can take ~30–60s.";
        hint.style.cssText = "margin:8px 0;font-size:12px;color:#888;";
        (document.getElementById("controls") || document.body).prepend(hint);
      }
    } else if (hint) {
      hint.remove();
    }
  }
  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";
    refreshAll().finally(() => {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    });
  });

  let username = localStorage.getItem("username");

  // -------- Login --------
  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    startApp();
  }
  document.querySelector("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  // -------- Startup --------
  if (username) {
    usernameInput.value = username;
    startApp();
  }

  async function startApp() {
    if (usernamePrompt) usernamePrompt.style.display = "none";
    if (welcome) {
      welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
      welcome.style.display = "block";
    }

    // Show champ banner immediately (independent of results progress)
    showChampionBanner();

    // first load: show “warming” in case Render is cold
    const warmTimeout = setTimeout(() => setLoadingHint(true), 1500);

    const [fights, picks] = await Promise.all([
      api.getFights(),
      api.getUserPicks(username)
    ]).finally(() => clearTimeout(warmTimeout));

    setLoadingHint(false);

    if (picks.success && Array.isArray(picks.picks) && picks.picks.length > 0) {
      localStorage.setItem("submitted", "true");
      if (fightList) fightList.style.display = "none";
      if (submitBtn) submitBtn.style.display = "none";
    } else {
      renderFightList(fights);
      if (submitBtn) submitBtn.style.display = "block";
    }

    loadMyPicks();
    loadLeaderboard();
    preloadAllTime();

    // Show refresh button for users with flaky networks
    refreshBtn.style.display = "inline-block";
  }

  // -------- Fight list render --------
  function renderFightList(data) {
    if (!fightList) return;
    fightList.innerHTML = "";
    (data || []).forEach(({ fight, fighter1, fighter2 }) => {
      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <h3>${fight}</h3>
        <div class="options">
          <label><input type="radio" name="${fight}-winner" value="${fighter1}">${fighter1}</label>
          <label><input type="radio" name="${fight}-winner" value="${fighter2}">${fighter2}</label>
        </div>
        <div class="pick-controls">
          <select name="${fight}-method">
            <option value="Decision">Decision</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
          </select>
          <select name="${fight}-round">
            <option value="1">Round 1</option>
            <option value="2">Round 2</option>
            <option value="3">Round 3</option>
            <option value="4">Round 4</option>
            <option value="5">Round 5</option>
          </select>
        </div>
      `;
      fightList.appendChild(div);
    });
  }

  // -------- Submit picks --------
  submitBtn?.addEventListener("click", () => {
    if (!username) return alert("Please enter your name first.");
    const picks = [];
    document.querySelectorAll(".fight").forEach(f => {
      const fight = f.querySelector("h3")?.innerText || "";
      const winner = f.querySelector(`input[name="${fight}-winner"]:checked`)?.value;
      const method = f.querySelector(`select[name="${fight}-method"]`)?.value || "Decision";
      const round = f.querySelector(`select[name="${fight}-round"]`)?.value || "";
      if (fight && winner) picks.push({ fight, winner, method, round });
    });

    if (!picks.length) return alert("Please make at least one pick.");

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    api.submitPicks({ username, picks }).then(r => {
      if (r.success) {
        alert("Picks submitted!");
        if (fightList) fightList.style.display = "none";
        if (submitBtn) submitBtn.style.display = "none";
        loadMyPicks();
        loadLeaderboard();
      } else {
        alert(r.error || "Submission failed.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
      }
    }).catch(() => {
      alert("Network error submitting picks.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Picks";
    });
  });

  // -------- My picks --------
  function loadMyPicks() {
    api.getUserPicks(username).then(r => {
      const div = document.getElementById("myPicks");
      if (!div) return;
      if (!r.success || !Array.isArray(r.picks) || !r.picks.length) {
        div.style.display = "none";
        div.innerHTML = "";
        return;
      }
      div.innerHTML = "<h3>Your Picks</h3>" + r.picks.map(p =>
        `<div>${p.fight}: ${p.winner} by ${p.method}${p.method === "Decision" ? "" : ` (R${p.round||""})`}</div>`
      ).join("");
      div.style.display = "block";
    }).catch(()=>{});
  }

  // -------- Weekly leaderboard --------
  function loadLeaderboard() {
    api.getLeaderboard().then(r => {
      if (!leaderboardEl) return;
      const scores = r.scores || {};
      const entries = Object.entries(scores).sort((a,b) => b[1]-a[1]);
      leaderboardEl.innerHTML = "<h3>Weekly Leaderboard</h3>" +
        entries.map(([u,s]) => `<div>${u}: ${s} pts</div>`).join("");
    }).catch(()=>{});
  }

  // -------- Champion banner (from champions sheet via GAS) --------
  function showChampionBanner() {
    api.getChampionBanner().then(r => {
      if (!champBanner) return;
      const msg = (r && typeof r.message === "string") ? r.message.trim() : "";
      if (msg) {
        champBanner.innerText = `🏆 ${msg.replace(/^🏆\s*/, "")}`;
        champBanner.style.display = "block";
      } else {
        champBanner.style.display = "none";
      }
    }).catch(()=>{});
  }

  // -------- All-Time leaderboard (getHall) --------
  let allTimeLoaded = false;
  let allTimeData = [];
  function preloadAllTime() {
    api.getHall().then(rows => { allTimeData = rows || []; allTimeLoaded = true; }).catch(() => {});
  }
  function loadAllTime() {
    if (!allTimeList) return;
    const rows = allTimeLoaded ? (allTimeData || []) : (window.__hallCache || []);
    if (!rows.length) { allTimeList.innerHTML = "<li>No All-Time data yet.</li>"; return; }

    allTimeList.innerHTML = "<h3>All-Time Leaderboard</h3>" +
      rows.map(r => {
        const pct = (Number(r.crown_rate || 0) * 100).toFixed(1) + "%";
        return `<div>${r.username}: 👑 ${r.crowns} • Events: ${r.events_played} • Rate: ${pct}</div>`;
      }).join("");
  }

  // -------- Bulk refresh helper --------
  async function refreshAll() {
    try {
      setLoadingHint(true);
      const [fights, picks, lb, hall, champ] = await Promise.allSettled([
        api.getFights(),
        api.getUserPicks(username),
        api.getLeaderboard(),
        api.getHall(),
        api.getChampionBanner()
      ]);

      if (fights.status === "fulfilled" && Array.isArray(fights.value)) {
        renderFightList(fights.value);
      }
      if (picks.status === "fulfilled") {
        const r = picks.value || { success:false, picks:[] };
        const div = document.getElementById("myPicks");
        if (div) {
          if (!r.success || !r.picks?.length) {
            div.style.display = "none";
            div.innerHTML = "";
          } else {
            div.style.display = "block";
            div.innerHTML = "<h3>Your Picks</h3>" + r.picks.map(p =>
              `<div>${p.fight}: ${p.winner} by ${p.method}${p.method==="Decision"?"":` (R${p.round||""})`}</div>`
            ).join("");
          }
        }
      }
      if (lb.status === "fulfilled") {
        const r = lb.value || { scores:{} };
        if (leaderboardEl) {
          const entries = Object.entries(r.scores || {}).sort((a,b)=>b[1]-a[1]);
          leaderboardEl.innerHTML = "<h3>Weekly Leaderboard</h3>" +
            entries.map(([u,s])=>`<div>${u}: ${s} pts</div>`).join("");
        }
      }
      if (hall.status === "fulfilled") {
        window.__hallCache = hall.value || [];
      }
      if (champ.status === "fulfilled") {
        const msg = (champ.value && champ.value.message || "").trim();
        if (champBanner) {
          if (msg) {
            champBanner.innerText = `🏆 ${msg.replace(/^🏆\s*/, "")}`;
            champBanner.style.display = "block";
          }
        }
      }
    } finally {
      setLoadingHint(false);
      refreshBtn.style.display = "inline-block";
    }
  }

  // Auto refresh when tab becomes active again
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshAll();
    }
  });

  // Auto refresh when back online
  window.addEventListener("online", () => {
    refreshAll();
  });

  // -------- Tabs --------
  weeklyTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (leaderboardEl) leaderboardEl.style.display = "block";
    if (allTimeList) allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn?.setAttribute("aria-pressed","false");
  });

  allTimeTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    loadAllTime();
    if (leaderboardEl) leaderboardEl.style.display = "none";
    if (allTimeList) allTimeList.style.display = "block";
    weeklyTabBtn?.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
