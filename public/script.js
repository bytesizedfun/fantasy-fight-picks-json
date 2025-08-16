document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     API CLIENT — matches your Apps Script routing
     ========================= */
  const API_BASE = "/api"; // keep your reverse-proxy; change to Web App URL if needed

  const apiGet = (action) =>
    fetch(`${API_BASE}?action=${encodeURIComponent(action)}`).then(r => r.json());

  const apiPost = (action, payload = {}) =>
    fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    }).then(r => r.json());

  /* =========================
     DOM refs
     ========================= */
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
  const fotnBlock = document.getElementById("fotnBlock");
  let fotnSelect = null;

  let username = localStorage.getItem("username");

  // odds / underdog cache
  const fightMeta = new Map(); // fight -> { f1, f2, f1Odds, f2Odds, underdogSide, underdogOdds }
  const FOTN_POINTS = 3;

  /* ---------- Tiny response caches (performance only; no logic change) ---------- */
  const now = () => Date.now();
  const FIGHTS_TTL = 5 * 60 * 1000; // 5 minutes
  const LB_TTL    = 8 * 1000;       // 8 seconds

  let fightsCache = { data: null, ts: 0, promise: null };
  let lbCache     = { data: null, ts: 0, promise: null };

  function getFights() {
    const fresh = fightsCache.data && (now() - fightsCache.ts < FIGHTS_TTL);
    if (fresh) return Promise.resolve(fightsCache.data);
    if (fightsCache.promise) return fightsCache.promise;

    fightsCache.promise = apiGet("getFights")
      .then(data => {
        fightsCache = { data, ts: now(), promise: null };
        buildFightMeta(data);
        return data;
      })
      .catch(err => { fightsCache.promise = null; throw err; });

    return fightsCache.promise;
  }

  function getLeaderboard() {
    const fresh = lbCache.data && (now() - lbCache.ts < LB_TTL);
    if (fresh) return Promise.resolve(lbCache.data);
    if (lbCache.promise) return lbCache.promise;

    lbCache.promise = apiPost("getLeaderboard")
      .then(data => { lbCache = { data, ts: now(), promise: null }; return data; })
      .catch(err => { lbCache.promise = null; throw err; });

    return lbCache.promise;
  }

  /* ---------- Helpers ---------- */
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
    if (n == null || n < 100) return 0; // only +100 and above
    return 1 + Math.floor((n - 100) / 100); // +100–199=+1, +200–299=+2, ...
  }

  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    finalizeLogin(username);
  }

  // Attach robust listeners (click + Enter)
  const loginBtn = document.querySelector("#usernamePrompt button");
  if (loginBtn) loginBtn.addEventListener("click", doLogin);
  if (usernameInput) {
    usernameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
  }

  // Populate scoring rules (collapsed by default)
  (function renderScoringRules(){
    const el = document.getElementById("scoringRules");
    if (!el) return;
    el.innerHTML = `
      <div class="rules-title">Scoring</div>
      <ul class="rules-list">
        <li>+3 for correct winner</li>
        <li>+2 for correct method <span class="muted">(if winner is correct)</span></li>
        <li>+1 for round <span class="muted">(if winner & method are both correct)</span></li>
        <li>Bonus points for underdogs</li>
        <li>Pick the correct FOTN for 3 points</li>
      </ul>
    `;
  })();

  if (username) {
    usernameInput.value = username;
    finalizeLogin(username);
  }

  function finalizeLogin(name) {
    // Hide prompt immediately
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${name.toUpperCase()}!`;
    welcome.style.display = "block";

    Promise.all([
      getFights(),
      apiPost("getUserPicks", { username: name })
    ])
    .then(([fightsData, pickData]) => {
      const submitted = pickData.success && pickData.picks.length > 0;
      if (submitted) {
        localStorage.setItem("submitted", "true");
        fightList.style.display = "none";
        submitBtn.style.display = "none";
        fotnBlock.style.display = "none";
      } else {
        localStorage.removeItem("submitted");
        renderFightList(fightsData);
        renderFOTN(fightsData, pickData.fotnPick);
        submitBtn.style.display = "block";
      }

      leaderboardEl.classList.add("board","weekly");
      loadMyPicks();
      loadLeaderboard();
      preloadAllTime();
    })
    .catch(err => {
      console.error(err);
      // Fallback
      loadFights();
      leaderboardEl.classList.add("board","weekly");
      loadMyPicks();
      loadLeaderboard();
      preloadAllTime();
    });
  }

  function buildFightMeta(data) {
    fightMeta.clear();
    (data || []).forEach(({ fight, fighter1, fighter2, underdog, underdogOdds, f1Odds, f2Odds }) => {
      fightMeta.set(fight, {
        f1: fighter1,
        f2: fighter2,
        f1Odds: f1Odds || "",
        f2Odds: f2Odds || "",
        underdogSide: underdog || "",
        underdogOdds: underdogOdds || ""
      });
    });
  }

  /* ---------- Fights ---------- */
  function loadFights() {
    getFights()
      .then(data => {
        renderFightList(data);
        renderFOTN(data);
      })
      .catch(() => {/* silent */});
  }

  function renderFOTN(fightsData, existingPick = "") {
    fotnBlock.innerHTML = `
      <div class="fotn-title">⭐ Fight of the Night</div>
      <select id="fotnSelect"></select>
      <div class="hint">+3 pts if correct</div>
    `;
    fotnSelect = document.getElementById("fotnSelect");

    const names = (fightsData || []).map(f => f.fight);
    if (!names.length) { fotnBlock.style.display = "none"; return; }
    fotnSelect.innerHTML = `<option value="">— Select your FOTN —</option>` +
      names.map(n => `<option value="${n}">${n}</option>`).join("");
    if (existingPick) fotnSelect.value = existingPick;
    fotnBlock.style.display = "flex";
  }

  function renderFightList(data) {
    fightList.innerHTML = "";
    (data || []).forEach(({ fight, fighter1, fighter2 }) => {
      const meta = fightMeta.get(fight) || {};
      const dogSide = meta.underdogSide;
      const dogTier = underdogBonusFromOdds(meta.underdogOdds);

      const isDog1 = dogSide === "Fighter 1";
      const isDog2 = dogSide === "Fighter 2";

      const dog1 = (isDog1 && dogTier > 0) ? `🐶 +${dogTier} pts` : "";
      const dog2 = (isDog2 && dogTier > 0) ? `🐶 +${dogTier} pts` : "";

      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <h3>${fight}</h3>

        <div class="options">
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter1}">
            <span class="pick-row">
              <span class="fighter-name ${isDog1 ? 'is-underdog' : ''}">${fighter1}</span>
              <span class="fighter-right">${dog1 ? `<span class="dog-tag">${dog1}</span>` : ""}</span>
            </span>
          </label>

          <label>
            <input type="radio" name="${fight}-winner" value="${fighter2}">
            <span class="pick-row">
              <span class="fighter-name ${isDog2 ? 'is-underdog' : ''}">${fighter2}</span>
              <span class="fighter-right">${dog2 ? `<span class="dog-tag">${dog2}</span>` : ""}</span>
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
        roundSelect.value = isDecision ? "" : (roundSelect.value || "1");
      }
      methodSelect.addEventListener("change", syncRound);
      syncRound();
    });

    fightList.style.display = "flex";
    submitBtn.style.display = "block";
  }

  /* ---------- Submit picks ---------- */
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

      if (!winner || !method) {
        alert(`Please complete all picks. Missing data for "${fightName}".`);
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
        return;
      }
      picks.push({ fight: fightName, winner, method, round });
    }

    const fotnPick = fotnSelect?.value || "";

    apiPost("submitPicks", { username, picks, fotnPick })
      .then(data => {
        if (data.success) {
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          fotnBlock.style.display = "none";
          // ensure next leaderboard fetch isn't served from cache
          lbCache = { data: null, ts: 0, promise: null };
          loadMyPicks();
          loadLeaderboard();
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
  window.submitPicks = submitPicks;

  /* ---------- My Picks (with underdog chip always shown if you picked the dog) ---------- */
  function loadMyPicks() {
    apiPost("getUserPicks", { username })
      .then(data => {
        const myPicksDiv = document.getElementById("myPicks");
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
        if (!data.success || !data.picks.length) {
          myPicksDiv.innerHTML += "<p>No picks submitted.</p>";
          return;
        }

        Promise.all([ getLeaderboard(), getFights() ]).then(([resultData, fightsData]) => {
          buildFightMeta(fightsData);

          const fightResults = resultData.fightResults || {};
          const officialFOTN = resultData.officialFOTN || [];
          const myFOTN = data.fotnPick || "";

          // FOTN strip
          if (myFOTN) {
            const gotIt = officialFOTN.length && officialFOTN.includes(myFOTN);
            const badge = gotIt ? `<span class="points">+${FOTN_POINTS} pts</span>` : "";
            myPicksDiv.innerHTML += `
              <div class="scored-pick fotn-strip">
                <div class="fight-name">FOTN Pick</div>
                <div class="user-pick ${gotIt ? 'correct' : (officialFOTN.length ? 'wrong' : '')}">
                  ${myFOTN} ${badge}
                  ${officialFOTN.length ? `<div class="hint">Official: ${officialFOTN.join(", ")}</div>` : ""}
                </div>
              </div>
            `;
          }

          // Each fight pick row
          data.picks.forEach(({ fight, winner, method, round }) => {
            const actual = fightResults[fight] || {};
            const hasResult = actual.winner && actual.method;

            const matchWinner = hasResult && winner === actual.winner;
            const matchMethod = hasResult && method === actual.method;
            const matchRound = hasResult && round == actual.round;

            const meta = fightMeta.get(fight) || {};
            const dogSide = meta.underdogSide;
            const dogTier = underdogBonusFromOdds(meta.underdogOdds);
            const chosenIsUnderdog =
              (dogSide === "Fighter 1" && winner === meta.f1) ||
              (dogSide === "Fighter 2" && winner === meta.f2);

            const dogChip = (chosenIsUnderdog && dogTier > 0)
              ? `<span class="dog-tag">🐶 +${dogTier} pts</span>`
              : "";

            const earnedBonus = (hasResult && matchWinner && actual.underdog === "Y" && chosenIsUnderdog) ? dogTier : 0;

            let score = 0;
            if (matchWinner) {
              score += 3;
              if (matchMethod) {
                score += 2;
                if (method !== "Decision" && matchRound) score += 1;
              }
              if (hasResult && actual.underdog === "Y") score += dogTier;
            }

            const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "";
            const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "";
            const roundClass = hasResult && matchWinner && matchMethod && method !== "Decision"
              ? (matchRound ? "correct" : "wrong")
              : "";

            const roundText = (method === "Decision")
              ? ""  // no "(Decision)"
              : `in Round <span class="${roundClass}">${round}</span>`;
            const pointsChip = hasResult ? `<span class="points">+${score} pts</span>` : "";

            const earnNote = (earnedBonus > 0 && hasResult)
              ? `<span class="earn-note">🐶 +${earnedBonus} bonus points</span>`
              : "";
            const potentialNote = (!hasResult && chosenIsUnderdog && dogTier > 0)
              ? `<span class="earn-note">🐶 +${dogTier} potential bonus if correct</span>`
              : "";

            myPicksDiv.innerHTML += `
              <div class="scored-pick">
                <div class="fight-name">${fight}</div>
                <div class="user-pick">
                  <span class="${winnerClass}">${winner}</span> ${dogChip}
                  by <span class="${methodClass}">${method}</span> ${roundText}
                  ${earnNote || potentialNote}
                </div>
                ${pointsChip}
              </div>`;
          });
        });
      });
  }

  /* ---------- Champion banner + Weekly Leaderboard ---------- */

  function showPreviousChampionBanner() {
    apiGet("getChampionBanner")
      .then(data => {
        const msg = (data && typeof data.message === "string") ? data.message.trim() : "";
        if (msg) {
          champBanner.textContent = `🏆 ${msg.replace(/^🏆\s*/,"")}`;
          champBanner.style.display = "block";
        }
      })
      .catch(() => { /* silent */ });
  }

  function loadLeaderboard() {
    showPreviousChampionBanner();

    Promise.all([ getFights(), getLeaderboard() ]).then(([fightsData, leaderboardData]) => {
      const board = leaderboardEl;
      board.classList.add("board","weekly");
      board.innerHTML = "";

      // Hide users until results have started
      const resultsArr = Object.values(leaderboardData.fightResults || {});
      const resultsStarted = resultsArr.some(r => r && r.winner && r.method);

      if (!resultsStarted) {
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

      // glow ties for #1
      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt(lis[0].lastElementChild.textContent, 10);
        lis.forEach(li => {
          const val = parseInt(li.lastElementChild.textContent, 10);
          if (val === topScore) li.classList.add("tied-first");
        });
      }

      // If event concluded, override with current champ(s)
      const totalFights = (fightsData || []).length;
      const completedResults = resultsArr.filter(res => res.winner && res.method && (res.method === "Decision" || (res.round && res.round !== "N/A"))).length;

      if (leaderboardData.champMessage && totalFights > 0 && completedResults === totalFights) {
        champBanner.textContent = `🏆 ${leaderboardData.champMessage}`;
        champBanner.style.display = "block";
      }
    });
  }

  /* ---------- All-Time Leaderboard ---------- */
  let allTimeLoaded = false;
  let allTimeData = [];

  function fetchWithTimeout(url, ms = 6000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(t));
  }

  function sortAllTime(rows) {
    const cleaned = (rows || []).filter(r => r && r.username && String(r.username).trim() !== "");
    return cleaned
      .map(r => ({
        user: r.username,
        crowns: Number(r.crowns) || 0,
        events: Number(r.events_played) || 0,
        rate: Number(r.crown_rate) || 0
      }))
      .sort((a,b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;
        if (b.crowns !== a.crowns) return b.crowns - a.crowns;
        if (b.events !== a.events) return b.events - a.events;
        return (a.user || "").localeCompare(b.user || "");
      });
  }

  function rowsEqual(a, b) {
    return a && b && a.rate === b.rate && a.crowns === b.crowns && a.events === b.events;
  }

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
    if (!data.length) {
      allTimeList.innerHTML = "<li>No All-Time data yet.</li>";
      return;
    }

    renderAllTimeHeader();

    let rank = 0;
    let prev = null;

    data.forEach((row, idx) => {
      rank = (idx === 0 || !rowsEqual(row, prev)) ? (idx + 1) : rank;
      const isTop = rank === 1;

      const li = document.createElement("li");
      const classes = [];
      if (row.user === username) classes.push("current-user");
      if (isTop) classes.push("tied-first");
      li.className = classes.join(" ") + " at-five";

      const rankLabel = isTop ? "🥇" : `#${rank}`;
      const pct = (row.rate * 100).toFixed(1) + "%";

      li.innerHTML = `
        <span class="rank">${rankLabel}</span>
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

  function preloadAllTime() {
    // Keep as-is (your /api/hall is likely reverse-proxied to GAS getHall)
    fetchWithTimeout("/api/hall", 6000)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; })
      .catch(() => {});
  }

  function loadAllTimeInteractive() {
    if (allTimeLoaded) { drawAllTime(allTimeData); return; }
    const keepHeight = leaderboardEl?.offsetHeight || 260;
    allTimeList.style.minHeight = `${keepHeight}px`;
    allTimeList.innerHTML = "";

    fetchWithTimeout("/api/hall", 6000)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; drawAllTime(allTimeData); })
      .catch(err => { allTimeList.innerHTML = `<li>All-Time unavailable. ${err?.message ? '('+err.message+')' : ''}</li>`; })
      .finally(() => { allTimeList.style.minHeight = ""; });
  }

  /* ---------- Tabs ---------- */
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
