document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  const withTimeout = (p, ms = 10000) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), ms);
      p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });

  async function detectApiMode() {
    const cached = localStorage.getItem("apiMode");
    if (cached === "path" || cached === "action") return cached;

    try {
      const r = await withTimeout(fetch(`${BASE.replace(/\/$/,"")}/fights`, { method: "GET" }), 7000);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) { localStorage.setItem("apiMode", "path"); return "path"; }
      }
    } catch (_) {}

    try {
      const sep = BASE.includes("?") ? "&" : "?";
      const r = await withTimeout(fetch(`${BASE}${sep}action=getFights`, { method: "GET" }), 7000);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) { localStorage.setItem("apiMode", "action"); return "action"; }
      }
    } catch (_) {}

    localStorage.setItem("apiMode", "path");
    return "path";
  }

  const api = {
    mode: "path",
    async init() { this.mode = await detectApiMode(); },

    getFights() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/fights`).then(r => r.json());
      } else {
        const sep = BASE.includes("?") ? "&" : "?";
        return fetch(`${BASE}${sep}action=getFights`).then(r => r.json());
      }
    },

    getUserPicks(username) {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/picks`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ username })
        }).then(r => r.json());
      } else {
        return fetch(BASE, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ action:"getUserPicks", username })
        }).then(r => r.json());
      }
    },

    submitPicks(payload) {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/submit`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        return fetch(BASE, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ action:"submitPicks", ...payload })
        }).then(r => r.json());
      }
    },

    getLeaderboard() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/leaderboard`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({})
        }).then(r => r.json());
      } else {
        return fetch(BASE, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ action:"getLeaderboard" })
        }).then(r => r.json());
      }
    },

    getChampionBanner() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/champion`).then(r => r.json());
      } else {
        const sep = BASE.includes("?") ? "&" : "?";
        return fetch(`${BASE}${sep}action=getChampionBanner`).then(r => r.json());
      }
    },

    getHall() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/hall`).then(r => r.json());
      } else {
        const sep = BASE.includes("?") ? "&" : "?";
        return fetch(`${BASE}${sep}action=getHall`).then(r => r.json());
      }
    }
  };

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
  const myPicksDiv = document.getElementById("myPicks");

  let username = localStorage.getItem("username");
  const fightMeta = new Map();

  /* ---------- Perf caches ---------- */
  const now = () => Date.now();
  const FIGHTS_TTL = 5 * 60 * 1000;
  const LB_TTL    = 30 * 1000;

  let fightsCache = { data: null, ts: 0, promise: null };
  let lbCache     = { data: null, ts: 0, promise: null };

  function getFightsCached() {
    const fresh = fightsCache.data && (now() - fightsCache.ts < FIGHTS_TTL);
    if (fresh) return Promise.resolve(fightsCache.data);
    if (fightsCache.promise) return fightsCache.promise;

    fightsCache.promise = api.getFights()
      .then(data => {
        fightsCache = { data, ts: now(), promise: null };
        buildFightMeta(data);
        return data;
      })
      .catch(err => { fightsCache.promise = null; throw err; });

    return fightsCache.promise;
  }
  function getLeaderboardCached() {
    const fresh = lbCache.data && (now() - lbCache.ts < LB_TTL);
    if (fresh) return Promise.resolve(lbCache.data);
    if (lbCache.promise) return lbCache.promise;

    lbCache.promise = api.getLeaderboard()
      .then(data => { lbCache = { data, ts: now(), promise: null }; return data; })
      .catch(err => { lbCache.promise = null; throw err; });

    return lbCache.promise;
  }

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

  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    usernamePrompt.style.display = "none";
    startApp();
  }
  document.querySelector("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

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

  if (username) {
    usernameInput.value = username;
    usernamePrompt.style.display = "none";
    startApp();
  } else {
    usernamePrompt.style.display = "flex";
  }

  /* ---------- Polling gate ---------- */
  let pollTimer = null;
  function setPolling(on) {
    if (on) {
      if (!pollTimer) pollTimer = setInterval(() => {
        loadLeaderboard().then(() => loadMyPicks());
      }, 30000);
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* ---------- App ---------- */
  async function startApp() {
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${String(username || "").toUpperCase()}!`;
    welcome.style.display = "block";

    await api.init();

    Promise.allSettled([ getFightsCached(), api.getUserPicks(username) ])
      .then(async (results) => {
        const fightsData = results[0].status === "fulfilled" ? results[0].value : [];
        const pickData   = results[1].status === "fulfilled" ? results[1].value : { success:false, picks:[] };

        const submitted = !!(pickData && pickData.success === true && Array.isArray(pickData.picks) && pickData.picks.length > 0);
        if (submitted) {
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
        } else {
          localStorage.removeItem("submitted");
          renderFightList(fightsData);
          submitBtn.style.display = "block";
        }

        leaderboardEl.classList.add("board","weekly");

        await loadLeaderboard();
        await loadMyPicks();
        preloadAllTime();
      })
      .catch((err) => {
        console.error("Startup error:", err);
        fightList.innerHTML = `<div class="board-hint">Server unavailable. Check API base in index.html (window.API_BASE).</div>`;
        submitBtn.style.display = "none";
        loadLeaderboard().catch(()=>{});
      });
  }

  function buildFightMeta(data) {
    fightMeta.clear();
    (data || []).forEach(({ fight, fighter1, fighter2, underdog, underdogOdds, f1Odds, f2Odds }) => {
      fightMeta.set(fight, {
        f1: fighter1, f2: fighter2,
        f1Odds: f1Odds || "", f2Odds: f2Odds || "",
        underdogSide: underdog || "", underdogOdds: underdogOdds || ""
      });
    });
  }

  /* ---------- Fights (pick form) ---------- */
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

      const chip1 = dog1 ? `<span class="dog-tag dog-tag--plain">${dog1}</span>` : "";
      const chip2 = dog2 ? `<span class="dog-tag dog-tag--plain">${dog2}</span>` : "";

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

    api.submitPicks({ username, picks })
      .then(data => {
        if (data.success) {
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          lbCache = { data: null, ts: 0, promise: null };
          loadLeaderboard().then(() => loadMyPicks());
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

  /* ---------- Helpers for "Your Picks" ---------- */
  function shortMethod(m) {
    if (!m) return "";
    const s = String(m).toUpperCase();
    if (s.includes("DECISION")) return "Dec";
    if (s.includes("SUB")) return "Sub";
    if (s.includes("KO") || s.includes("TKO")) return "KO/TKO";
    return m;
  }

  /* ---------- My Picks (betslip, consistent ✓/✗) ---------- */
  function loadMyPicks() {
    return api.getUserPicks(username)
      .then(data => {
        if (!data || data.success !== true || !Array.isArray(data.picks) || data.picks.length === 0) {
          myPicksDiv.style.display = "none";
          myPicksDiv.innerHTML = "";
          return;
        }

        myPicksDiv.style.display = "grid";
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";

        return Promise.all([ getLeaderboardCached(), getFightsCached() ]).then(([resultData, fightsData]) => {
          buildFightMeta(fightsData);

          const fightResults = (resultData && resultData.fightResults) || {};
          const resultsArr = Object.values(fightResults || {});
          const resultsStarted = resultsArr.some(r => r && r.winner && r.method);
          const totalFights = (fightsData || []).length;
          const completed = resultsArr.filter(res => res && res.winner && res.method && (res.method === "Decision" || (res.round && res.round !== "N/A"))).length;
          const shouldPoll = resultsStarted && completed < totalFights;
          setPolling(shouldPoll);

          data.picks.forEach(({ fight, winner, method, round }) => {
            const actual = fightResults[fight] || {};
            const hasResult = !!(actual.winner && actual.method);

            const matchWinner = hasResult && winner === actual.winner;
            const matchMethod = hasResult && method === actual.method;
            const matchRound  = hasResult && round == actual.round;

            const meta = fightMeta.get(fight) || {};
            const f1 = meta.f1 || (String(fight).split(" vs ")[0] || "");
            const f2 = meta.f2 || (String(fight).split(" vs ")[1] || "");

            const dogSide = meta.underdogSide;
            const dogTier = (function(oddsRaw){
              const n = normalizeAmericanOdds(oddsRaw);
              if (n == null || n < 100) return 0;
              return 1 + Math.floor((n - 100) / 100);
            })(meta.underdogOdds);

            const chosenIsUnderdog =
              (dogSide === "Fighter 1" && winner === meta.f1) ||
              (dogSide === "Fighter 2" && winner === meta.f2);

            // Score calc (unchanged)
            let score = 0;
            if (matchWinner) {
              score += 3;
              if (matchMethod) {
                score += 2;
                if (method !== "Decision" && matchRound) score += 1;
              }
              if (hasResult && actual.underdog === "Y" && chosenIsUnderdog && dogTier > 0) {
                score += dogTier;
              }
            }

            // Icons logic — consistent:
            // before results: • for all
            // after results: ✓ or ✗
            // if winner wrong => method & round auto-✗
            const pre = !hasResult;

            const icoWinnerChar = pre ? "•" : (matchWinner ? "✓" : "✗");
            const icoWinnerCls  = pre ? "dot" : (matchWinner ? "ok" : "x");

            let icoMethodChar, icoMethodCls, methodVal;
            if (pre) {
              icoMethodChar = "•"; icoMethodCls = "dot"; methodVal = shortMethod(method);
            } else if (!matchWinner) {
              icoMethodChar = "✗"; icoMethodCls = "x"; methodVal = shortMethod(method);
            } else {
              icoMethodChar = matchMethod ? "✓" : "✗";
              icoMethodCls = matchMethod ? "ok" : "x";
              methodVal = shortMethod(method);
            }

            let icoRoundChar = "", icoRoundCls = "", roundVal = "";
            if (method && method.toUpperCase().includes("DECISION")) {
              // N/A for Decision — keep neutral even after results
              if (pre) { icoRoundChar = "•"; icoRoundCls = "dot"; }
              else { icoRoundChar = "•"; icoRoundCls = "dot"; }
              roundVal = "—";
            } else {
              const label = round ? `RD ${round}` : "";
              if (pre) {
                icoRoundChar = "•"; icoRoundCls = "dot"; roundVal = label || "—";
              } else if (!matchWinner) {
                icoRoundChar = "✗"; icoRoundCls = "x"; roundVal = label || "—";
              } else {
                icoRoundChar = matchRound ? "✓" : "✗";
                icoRoundCls = matchRound ? "ok" : "x";
                roundVal = label || "—";
              }
            }

            const pointsBadge = hasResult
              ? `<span class="points-badge">${score}</span>`
              : `<span class="points-badge points-muted">—</span>`;

            const dogBonus = (hasResult && matchWinner && actual.underdog === "Y" && chosenIsUnderdog && dogTier > 0)
              ? `<span class="dog">🐶 +${dogTier}</span>`
              : "";

            const f1Picked = winner === f1;
            const f2Picked = winner === f2;

            myPicksDiv.innerHTML += `
              <div class="scored-pick">
                <div class="ticket-fight">
                  <span class="fighter ${f1Picked ? 'picked' : ''}">${f1}</span>
                  <span class="vs">vs</span>
                  <span class="fighter ${f2Picked ? 'picked' : ''}">${f2}</span>
                </div>

                <div class="ticket-grid">
                  <div class="cell cell-pick">
                    <span class="ico ${icoWinnerCls}">${icoWinnerChar}</span>
                    <span class="label">PICK</span>
                    <span class="value">${winner}</span>
                  </div>

                  <div class="cell cell-method">
                    <span class="ico ${icoMethodCls}">${icoMethodChar}</span>
                    <span class="label">METHOD</span>
                    <span class="value">${methodVal}</span>
                  </div>

                  <div class="cell cell-round">
                    <span class="ico ${icoRoundCls}">${icoRoundChar}</span>
                    <span class="label">ROUND</span>
                    <span class="value">${roundVal}</span>
                  </div>

                  <div class="cell cell-points">
                    <span class="label">PTS</span>
                    ${pointsBadge}
                    ${dogBonus}
                  </div>
                </div>
              </div>`;
          });
        });
      })
      .catch(err => {
        console.error("loadMyPicks error:", err);
      });
  }

  /* ---------- Champion banner + Weekly Leaderboard ---------- */
  function showChampionBannerOnce() {
    if (showChampionBannerOnce.done) return;
    showChampionBannerOnce.done = true;
    api.getChampionBanner()
      .then(data => {
        const msg = (data && typeof data.message === "string") ? data.message.trim() : "";
        if (msg) {
          champBanner.textContent = `🏆 ${msg.replace(/^🏆\s*/,"")}`;
          champBanner.style.display = "block";
        }
      })
      .catch(()=>{});
  }

  function loadLeaderboard() {
    showChampionBannerOnce();

    return Promise.all([ getFightsCached(), getLeaderboardCached() ]).then(([fightsData, leaderboardData]) => {
      const board = leaderboardEl;
      board.classList.add("board","weekly");
      board.innerHTML = "";

      const resultsArr = Object.values((leaderboardData && leaderboardData.fightResults) || {});
      const resultsStarted = resultsArr.some(r => r && r.winner && r.method);

      if (!resultsStarted) {
        const hint = document.createElement("li");
        hint.className = "board-hint";
        hint.textContent = "Weekly standings will appear once results start.";
        board.appendChild(hint);
      } else {
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

        const lis = board.querySelectorAll("li");
        if (lis.length > 0) {
          const topScore = parseInt(lis[0].lastElementChild.textContent, 10);
          lis.forEach(li => {
            const val = parseInt(li.lastElementChild.textContent, 10);
            if (val === topScore) li.classList.add("tied-first");
          });
        }
      }

      const totalFights = (fightsData || []).length;
      const completed = resultsArr.filter(res => res && res.winner && res.method && (res.method === "Decision" || (res.round && res.round !== "N/A"))).length;
      const shouldPoll = resultsStarted && completed < totalFights;
      setPolling(shouldPoll);
    })
    .catch(err => {
      console.error("loadLeaderboard error:", err);
    });
  }

  /* ---------- All-Time Leaderboard ---------- */
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
    api.getHall().then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; }).catch(() => {});
  }

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
