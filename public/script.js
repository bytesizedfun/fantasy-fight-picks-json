document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  // -------- API (calls your Node server's path endpoints) --------
  const api = {
    getFights() {
      return fetch(`${BASE.replace(/\/$/, "")}/fights`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" }
      })
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
    },

    getUserPicks(username) {
      return fetch(`${BASE.replace(/\/$/, "")}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      })
        .then(r => (r.ok ? r.json() : { success: false, picks: [] }))
        .catch(() => ({ success: false, picks: [] }));
    },

    submitPicks(payload) {
      return fetch(`${BASE.replace(/\/$/, "")}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(r => (r.ok ? r.json() : { success: false, error: "Server error" }))
        .catch(() => ({ success: false, error: "Network error" }));
    },

    getLeaderboard() {
      return fetch(`${BASE.replace(/\/$/, "")}/leaderboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
        .then(r => (r.ok ? r.json() : { scores: {}, fightResults: {} }))
        .catch(() => ({ scores: {}, fightResults: {} }));
    },

    getChampionBanner() {
      return fetch(`${BASE.replace(/\/$/, "")}/champion`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" }
      })
        .then(r => (r.ok ? r.json() : { message: "" }))
        .catch(() => ({ message: "" }));
    },

    getHall() {
      return fetch(`${BASE.replace(/\/$/, "")}/hall`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" }
      })
        .then(r => (r.ok ? r.json() : []))
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

    const [fights, picks] = await Promise.all([
      api.getFights(),
      api.getUserPicks(username)
    ]);

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

    api.submitPicks({ username, picks }).then(r => {
      if (r.success) {
        alert("Picks submitted!");
        if (fightList) fightList.style.display = "none";
        if (submitBtn) submitBtn.style.display = "none";
        loadMyPicks();
        loadLeaderboard();
      } else {
        alert(r.error || "Submission failed.");
      }
    }).catch(() => alert("Network error submitting picks."));
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
    });
  }

  // -------- Weekly leaderboard --------
  function loadLeaderboard() {
    api.getLeaderboard().then(r => {
      if (!leaderboardEl) return;
      const scores = r.scores || {};
      const entries = Object.entries(scores).sort((a,b) => b[1]-a[1]);
      leaderboardEl.innerHTML = "<h3>Weekly Leaderboard</h3>" +
        entries.map(([u,s]) => `<div>${u}: ${s} pts</div>`).join("");
    });
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
    });
  }

  // -------- All-Time leaderboard (getHall) --------
  let allTimeLoaded = false;
  let allTimeData = [];

  function preloadAllTime() {
    api.getHall().then(rows => { allTimeData = rows || []; allTimeLoaded = true; }).catch(() => {});
  }

  function loadAllTime() {
    if (!allTimeList) return;
    if (!allTimeLoaded) { allTimeList.innerHTML = "<li>Loading…</li>"; return; }
    if (!allTimeData.length) { allTimeList.innerHTML = "<li>No All-Time data yet.</li>"; return; }

    allTimeList.innerHTML = "<h3>All-Time Leaderboard</h3>" +
      allTimeData.map(r => {
        const pct = (Number(r.crown_rate || 0) * 100).toFixed(1) + "%";
        return `<div>${r.username}: 👑 ${r.crowns} • Events: ${r.events_played} • Rate: ${pct}</div>`;
      }).join("");
  }

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
