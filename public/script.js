document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  // API (aligned with code.gs actions)
  const api = {
    getFights() {
      return fetch(`${BASE}?action=getFights`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []);
    },
    getUserPicks(username) {
      return fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getUserPicks", username })
      }).then(r => r.ok ? r.json() : { success: false, picks: [] })
        .catch(() => ({ success: false, picks: [] }));
    },
    submitPicks(payload) {
      return fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submitPicks", ...payload })
      }).then(r => r.ok ? r.json() : { success: false, error: "Server error" })
        .catch(() => ({ success: false, error: "Network error" }));
    },
    getLeaderboard() {
      return fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getLeaderboard" })
      }).then(r => r.ok ? r.json() : { scores: {}, fightResults: {} })
        .catch(() => ({ scores: {}, fightResults: {} }));
    },
    getChampionBanner() {
      return fetch(`${BASE}?action=getChampionBanner`)
        .then(r => r.ok ? r.json() : { message: "" })
        .catch(() => ({ message: "" }));
    },
    getHall() {
      return fetch(`${BASE}?action=getHall`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []);
    }
  };

  // DOM refs
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
  const fightMeta = new Map();

  // ===== Login
  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    startApp();
  }
  document.querySelector("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  // ===== Startup
  if (username) {
    usernameInput.value = username;
    startApp();
  }

  async function startApp() {
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display = "block";

    // show champ banner immediately (from champions sheet)
    showChampionBanner();

    const [fights, picks] = await Promise.all([
      api.getFights(), api.getUserPicks(username)
    ]);

    if (picks.success && picks.picks.length) {
      localStorage.setItem("submitted","true");
      fightList.style.display = "none";
      submitBtn.style.display = "none";
    } else {
      renderFightList(fights);
      submitBtn.style.display = "block";
    }

    loadMyPicks();
    loadLeaderboard();
    preloadAllTime();
  }

  // ===== Fight list
  function renderFightList(data) {
    fightList.innerHTML = "";
    data.forEach(({ fight, fighter1, fighter2 }) => {
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

  // ===== Submit picks
  submitBtn?.addEventListener("click", () => {
    const picks = [];
    document.querySelectorAll(".fight").forEach(f => {
      const fight = f.querySelector("h3").innerText;
      const winner = f.querySelector(`input[name="${fight}-winner"]:checked`)?.value;
      const method = f.querySelector(`select[name="${fight}-method"]`).value;
      const round = f.querySelector(`select[name="${fight}-round"]`).value;
      if (winner) picks.push({ fight, winner, method, round });
    });
    api.submitPicks({ username, picks }).then(r => {
      if (r.success) {
        alert("Picks submitted!");
        fightList.style.display = "none";
        submitBtn.style.display = "none";
        loadMyPicks(); loadLeaderboard();
      } else alert(r.error);
    });
  });

  // ===== My picks
  function loadMyPicks() {
    api.getUserPicks(username).then(r => {
      const div = document.getElementById("myPicks");
      if (!r.success || !r.picks.length) { div.style.display="none"; return; }
      div.innerHTML = "<h3>Your Picks</h3>" + r.picks.map(p =>
        `<div>${p.fight}: ${p.winner} by ${p.method} ${p.round}</div>`
      ).join("");
      div.style.display="block";
    });
  }

  // ===== Weekly Leaderboard
  function loadLeaderboard() {
    api.getLeaderboard().then(r => {
      const scores = r.scores || {};
      leaderboardEl.innerHTML = "<h3>Weekly Leaderboard</h3>" +
        Object.entries(scores).map(([u,s])=>`<div>${u}: ${s} pts</div>`).join("");
    });
  }

  // ===== Champion Banner
  function showChampionBanner() {
    api.getChampionBanner().then(r => {
      if (r.message) {
        champBanner.innerText = `🏆 ${r.message}`;
        champBanner.style.display = "block";
      }
    });
  }

  // ===== All-Time Leaderboard
  let allTimeLoaded = false, allTimeData = [];
  function preloadAllTime() {
    api.getHall().then(rows => { allTimeData = rows; allTimeLoaded = true; });
  }
  function loadAllTime() {
    if (!allTimeList) return;
    if (!allTimeData.length) { allTimeList.innerHTML = "<li>No All-Time data yet.</li>"; return; }
    allTimeList.innerHTML = "<h3>All-Time Leaderboard</h3>" +
      allTimeData.map(r =>
        `<div>${r.username}: 👑 ${r.crowns} | Events: ${r.events_played} | Rate: ${(r.crown_rate*100).toFixed(1)}%</div>`
      ).join("");
  }

  // ===== Tabs
  weeklyTabBtn?.addEventListener("click", e => {
    e.preventDefault();
    leaderboardEl.style.display = "block";
    allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn?.addEventListener("click", e => {
    e.preventDefault();
    loadAllTime();
    leaderboardEl.style.display = "none";
    allTimeList.style.display = "block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
