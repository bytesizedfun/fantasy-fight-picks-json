document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  const api = {
    async getFights() {
      const r = await fetch(`${BASE}/fights`, { headers: { "Cache-Control": "no-cache" } });
      return r.json();
    },
    submitPicks(payload) {
      return fetch(`${BASE}/submit`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      }).then(r => r.json());
    },
    getUserPicks(username) {
      return fetch(`${BASE}/picks`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username })
      }).then(r => r.json());
    },
    getLeaderboard() {
      return fetch(`${BASE}/leaderboard`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({})
      }).then(r => r.json());
    },
    getChampionBanner() {
      return fetch(`${BASE}/champion`).then(r => r.json());
    },
    getHall() {
      return fetch(`${BASE}/hall`).then(r => r.json());
    }
  };

  // DOM
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const champBanner = document.getElementById("champBanner");
  const leaderboardEl = document.getElementById("leaderboard");
  const allTimeList = document.getElementById("allTimeBoard");
  const weeklyTabBtn = document.getElementById("tabWeekly");
  const allTimeTabBtn = document.getElementById("tabAllTime");

  let username = localStorage.getItem("username");

  // Helpers
  function normalizeAmericanOdds(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === "") return null;
    const m = s.match(/[+-]?\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    return isFinite(n) ? n : null;
  }
  function underdogBonusFromOdds(oddsRaw) {
    const n = normalizeAmericanOdds(oddsRaw);
    if (n == null || n < 100) return 0;
    return 1 + Math.floor((n - 100) / 100);
  }

  // UI
  (function renderScoringRules(){
    const el = document.getElementById("scoringRules");
    if (!el) return;
    el.innerHTML = `
      <ul class="rules-list">
        <li>+3 for winner</li>
        <li>+2 for method <span class="muted">(if winner is correct)</span></li>
        <li>+1 for round <span class="muted">(if winner & method are correct)</span></li>
        <li>Bonus points for underdogs</li>
      </ul>
    `;
  })();

  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    startApp();
  }
  document.querySelector("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  if (username) { usernameInput.value = username; startApp(); }

  async function startApp() {
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${String(username || "").toUpperCase()}!`;
    welcome.style.display = "block";

    try {
      const [ fightsData, pickData ] = await Promise.all([
        api.getFights(),
        api.getUserPicks(username)
      ]);

      renderFightList(fightsData);

      const submitted = pickData.success && Array.isArray(pickData.picks) && pickData.picks.length > 0;
      submitBtn.style.display = submitted ? "none" : "block";
      fightList.style.display = submitted ? "none" : "flex";

      loadMyPicks();        // shows your submitted picks (if any)
      showChampionBanner(); // previous week's champs if applicable
      loadLeaderboard();    // weekly live board (with cache behavior)
      preloadAllTime();
    } catch (e) {
      console.error("Startup error:", e);
      fightList.innerHTML = `<div class="board-hint">Server unavailable. Check API base.</div>`;
      submitBtn.style.display = "none";
    }
  }

  // Build fights list
  function renderFightList(data) {
    fightList.innerHTML = "";
    const fights = Array.isArray(data) ? data : [];
    if (!fights.length) {
      fightList.innerHTML = `<div class="board-hint">No fights found. Check your Google Sheet "fight_list".</div>`;
      return;
    }

    fights.forEach(({ fight, fighter1, fighter2, underdog, underdogOdds }) => {
      const isDog1 = underdog === "Fighter 1";
      const isDog2 = underdog === "Fighter 2";
      const dogTier = underdogBonusFromOdds(underdogOdds);

      const chip1 = (isDog1 && dogTier > 0) ? `<span class="dog-tag dog-tag--plain">🐶 +${dogTier} pts</span>` : "";
      const chip2 = (isDog2 && dogTier > 0) ? `<span class="dog-tag dog-tag--plain">🐶 +${dogTier} pts</span>` : "";

      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <h3>${fight}</h3>

        <div class="options">
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter1}">
            <span class="pick-row">
              <span class="fighter-name ${isDog1 ? 'is-underdog' : ''}">
                ${fighter1} ${chip1}
              </span>
            </span>
          </label>

          <label>
            <input type="radio" name="${fight}-winner" value="${fighter2}">
            <span class="pick-row">
              <span class="fighter-name ${isDog2 ? 'is-underdog' : ''}">
                ${fighter2} ${chip2}
              </span>
            </span>
          </label>
        </div>

        <div class="pick-controls">
          <select name="${fight}-method">
            <option value="Decision">Decision</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
          </select>
          <select name="${fight}-round">
            <option value="">— Round —</option>
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

    // Decision disables round
    document.querySelectorAll(".fight").forEach(fight => {
      const methodSelect = fight.querySelector(`select[name$="-method"]`);
      const roundSelect = fight.querySelector(`select[name$="-round"]`);
      if (!methodSelect || !roundSelect) return;
      function syncRound() {
        const isDecision = methodSelect.value === "Decision";
        roundSelect.disabled = isDecision;
        if (isDecision) roundSelect.value = "";
        else if (!roundSelect.value) roundSelect.value = "1";
      }
      methodSelect.addEventListener("change", syncRound);
      syncRound();
    });
  }

  // Submit picks
  function submitPicks() {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (const fight of fights) {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
      const roundRaw = fight.querySelector(`select[name="${fightName}-round"]`);
      const round = roundRaw && !roundRaw.disabled ? roundRaw.value : "";

      if (!winner || !method || (method !== "Decision" && !round)) {
        alert(`Please complete all picks. Missing data for "${fightName}".`);
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
        return;
      }
      picks.push({ fight: fightName, winner, method, round });
    }

    api.submitPicks({ username, picks })
      .then(data => {
        if (data.success) {
          alert("Picks submitted!");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
          loadLeaderboard(true); // refresh
        } else {
          alert(data.error || "Something went wrong.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Picks";
        }
      })
      .catch(() => {
        alert("Network error submitting picks.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
      });
  }
  submitBtn.addEventListener("click", submitPicks);

  // My Picks (no FOTN)
  function loadMyPicks() {
    api.getUserPicks(username).then(data => {
      const myPicksDiv = document.getElementById("myPicks");
      if (!data.success || !data.picks.length) {
        myPicksDiv.style.display = "none";
        myPicksDiv.innerHTML = "";
        return;
      }

      myPicksDiv.style.display = "grid";
      myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";

      api.getLeaderboard().then(resultData => {
        const fightResults = resultData.fightResults || {};

        data.picks.forEach(({ fight, winner, method, round }) => {
          const actual = fightResults[fight] || {};
          const hasResult = actual.winner && actual.method;

          const matchWinner = hasResult && winner === actual.winner;
          const matchMethod = hasResult && method === actual.method;
          const matchRound  = hasResult && round == actual.round;

          let score = 0;
          if (matchWinner) {
            score += 3;
            if (matchMethod) {
              score += 2;
              if (method !== "Decision" && matchRound) score += 1;
            }
            if (actual.underdog === "Y") {
              // We don’t know if user picked the underdog from this object alone.
              // Score already computed server-side for leaderboard; here we just display base pick summary.
            }
          }

          const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "pre";
          const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "pre";
          const roundClass  = hasResult && matchWinner && matchMethod && method !== "Decision"
            ? (matchRound ? "correct" : "wrong")
            : "pre";

          myPicksDiv.innerHTML += `
            <div class="scored-pick">
              <div class="fight-name">${fight}</div>
              <div class="user-pick">
                <span class="winner-text ${winnerClass}">${winner}</span>
                &nbsp;by&nbsp; <span class="${methodClass}">${method}</span>
                ${method === "Decision" ? "" : `in Round <span class="chip chip-round ${roundClass}">${round}</span>`}
              </div>
              ${hasResult ? `<span class="points">+${score} pts</span>` : ""}
            </div>`;
        });
      });
    });
  }

  function showChampionBanner() {
    api.getChampionBanner()
      .then(data => {
        const msg = (data && typeof data.message === "string") ? data.message.trim() : "";
        if (msg) {
          champBanner.textContent = `🏆 ${msg.replace(/^🏆\s*/,"")}`;
          champBanner.style.display = "block";
        }
      })
      .catch(() => {});
  }

  // Weekly leaderboard (shows cached last week if present)
  function loadLeaderboard(force) {
    api.getLeaderboard().then(leaderboardData => {
      const board = leaderboardEl;
      board.classList.add("board","weekly");
      board.innerHTML = "";

      // GAS will set forceShow=true for cached last week boards
      const forceShow = !!leaderboardData.forceShow;

      const resultsArr = Object.values(leaderboardData.fightResults || {});
      const resultsStarted = resultsArr.some(r => r && r.winner && r.method);

      if (!resultsStarted && !forceShow) {
        const hint = document.createElement("li");
        hint.className = "board-hint";
        hint.textContent = "Weekly standings will appear once results start.";
        board.appendChild(hint);
        return;
      }

      const scores = Object.entries(leaderboardData.scores || {}).sort((a, b) => b[1] - a[1]);

      let rank = 1;
      let prevScore = null;
      let actualRank = 1;

      scores.forEach(([user, score], index) => {
        if (score !== prevScore) actualRank = rank;

        const li = document.createElement("li");
        let displayName = user;
        const classes = [];

        if (leaderboardData.champs?.includes(user)) {
          classes.push("champ-glow");
          displayName = `<span class="crown">👑</span> ${displayName}`;
        }
        if (scores.length >= 3 && index === scores.length - 1) {
          classes.push("loser");
          displayName = `💩 ${displayName}`;
        }
        if (user === username) classes.push("current-user");

        li.className = classes.join(" ");
        li.innerHTML = `<span>#${actualRank}</span> <span>${displayName}</span><span>${score} pts</span>`;
        board.appendChild(li);

        prevScore = score;
        rank++;
      });

      // highlight ties at top
      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt(lis[0].lastElementChild.textContent, 10);
        lis.forEach(li => {
          const val = parseInt(li.lastElementChild.textContent, 10);
          if (val === topScore) li.classList.add("tied-first");
        });
      }

      if (leaderboardData.champMessage) {
        champBanner.textContent = `🏆 ${leaderboardData.champMessage}`;
        champBanner.style.display = "block";
      }
    });
  }

  // All-Time (unchanged)
  let allTimeLoaded = false;
  let allTimeData = [];
  function sortAllTime(rows) {
    const cleaned = (rows || []).filter(r => r && r.username && String(r.username).trim() !== "");
    return cleaned
      .map(r => ({ user: r.username, crowns: +r.crowns || 0, events: +r.events_played || 0, rate: +r.crown_rate || 0 }))
      .sort((a,b) => (b.rate - a.rate) || (b.crowns - a.crowns) || (b.events - a.events) || (a.user || "").localeCompare(b.user || ""));
  }
  function rowsEqual(a, b) { return a && b && a.rate === b.rate && a.crowns === b.crowns && a.events === b.events; }
  function renderAllTimeHeader() {
    const li = document.createElement("li");
    li.className = "board-header at-five";
    li.innerHTML = `
      <span>Rank</span>
      <span>Player</span>
      <span>%</span>
      <span>👑</span>
      <span>Events</span>
    `;
    allTimeList.appendChild(li);
  }
  function drawAllTime(data) {
    allTimeList.innerHTML = "";
    if (!data.length) { allTimeList.innerHTML = "<li>No All-Time data yet.</li>"; return; }
    renderAllTimeHeader();
    let rank = 0, prev = null;
    data.forEach((row, idx) => {
      rank = (idx === 0 || !rowsEqual(row, prev)) ? (idx + 1) : rank;
      const isTop = rank === 1;
      const li = document.createElement("li");
      const classes = [];
      if (row.user === username) classes.push("current-user");
      if (isTop) classes.push("tied-first");
      li.className = classes.join(" ") + " at-five";
      const pct = (row.rate * 100).toFixed(1) + "%";
      li.innerHTML = `
        <span class="rank">${isTop ? "🥇" : `#${rank}`}</span>
        <span class="user" title="${row.user}">${row.user}</span>
        <span class="num rate">${pct}</span>
        <span class="num crowns">${row.crowns}</span>
        <span class="num events">${row.events}</span>
        <span class="mobile-meta" aria-hidden="true">👑 ${row.crowns}/${row.events} events • ${pct}</span>
      `;
      allTimeList.appendChild(li);
      prev = row;
    });
  }
  function preloadAllTime() { api.getHall().then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; }).catch(() => {}); }
  function loadAllTimeInteractive() {
    if (allTimeLoaded) { drawAllTime(allTimeData); return; }
    const keepHeight = leaderboardEl?.offsetHeight || 260;
    allTimeList.style.minHeight = `${keepHeight}px`;
    allTimeList.innerHTML = "";
    api.getHall()
      .then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; drawAllTime(allTimeData); })
      .catch(() => { allTimeList.innerHTML = `<li>All-Time unavailable.</li>`; })
      .finally(() => { allTimeList.style.minHeight = ""; });
  }

  // Tabs
  weeklyTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    leaderboardEl.style.display = "block";
    allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    loadAllTimeInteractive();
    leaderboardEl.style.display = "none";
    allTimeList.style.display = "block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
