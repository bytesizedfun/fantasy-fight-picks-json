// public/script.js
// Restores “Your Picks” results + ✓/✗, preserves underdog chips, and keeps original flow.

document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  const withTimeout = (p, ms = 10000) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), ms);
      p.then(
        (v) => { clearTimeout(t); res(v); },
        (e) => { clearTimeout(t); rej(e); }
      );
    });

  // ---------- Normalization (to match GAS result keys safely) ----------
  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

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
  function clearApiModeCache() { localStorage.removeItem("apiMode"); }

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
      const sep = BASE.includes("?") ? "&" : "?";
      return fetch(`${BASE}${sep}action=getChampionBanner`).then(r => r.json());
    },

    getHall() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/hall`).then(r => r.json());
      } else {
        const sep = BASE.includes("?") ? "&" : "?";
        return fetch(`${BASE}${sep}action=getHall`).then(r => r.json());
      }
    },

    resetDetection() { clearApiModeCache(); }
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
  const fotnBlock = document.getElementById("fotnBlock");
  let fotnSelect = null;

  let username = localStorage.getItem("username");

  const fightMeta = new Map();
  const FOTN_POINTS = 3;

  /* ---------- Perf caches ---------- */
  const now = () => Date.now();
  const FIGHTS_TTL = 5 * 60 * 1000;
  const LB_TTL    = 0; // immediate refresh

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
    startApp();
  }

  document.querySelector("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  // (kept) simple scoring rules block
  (function renderScoringRules(){
    const el = document.getElementById("scoringRules");
    if (!el) return;
    el.innerHTML = `
      <ul class="rules-list">
        <li>+3 for winner</li>
        <li>+2 for method <span class="muted">(if winner is correct)</span></li>
        <li>+1 for round <span class="muted">(if winner & method are correct)</span></li>
        <li>Bonus points for underdogs</li>
        <li>Pick the correct FOTN for 3 points</li>
      </ul>
    `;
  })();

  if (username) {
    usernameInput.value = username;
    startApp();
  }

  async function startApp() {
    usernamePrompt.style.display = "none";
    // (kept) welcome line — lives in script.js only per your preference
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${String(username || "").toUpperCase()}!`;
    welcome.style.display = "block";

    await api.init();

    Promise.all([ getFightsCached(), api.getUserPicks(username) ])
      .then(([fightsData, pickData]) => {
        const submitted = pickData.success && Array.isArray(pickData.picks) && pickData.picks.length > 0;
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
      .catch((err) => {
        console.error("Startup error:", err);
        fightList.innerHTML = `<div class="board-hint">Server unavailable. Check API base in index.html (window.API_BASE).</div>`;
        submitBtn.style.display = "none";
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

  /* ---------- Fights ---------- */
  function renderFOTN(fightsData, existingPick = "") {
    fotnBlock.innerHTML = `
      <div class="fotn-title">⭐ Fight of the Night</div>
      <select id="fotnSelect" class="fotn-select"></select>
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

    const fotnPick = fotnSelect?.value || "";

    api.submitPicks({ username, picks, fotnPick })
      .then(data => {
        if (data.success) {
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          fotnBlock.style.display = "none";
          lbCache = { data: null, ts: 0, promise: null }; // refresh scoreboard immediately
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

  /* ---------- RESULTS MERGE HELPERS FOR “YOUR PICKS” ---------- */
  const same = (a, b) => (String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase());

  function judgePickAgainstResult(pick, result) {
    const hasResult = !!(result && result.winner && result.method);
    const winnerOK = hasResult ? same(pick.winner, result.winner) : null;
    const methodOK = hasResult ? (winnerOK ? same(pick.method, result.method) : false) : null;

    let roundOK = null;
    if (hasResult && !/decision/i.test(result.method) && winnerOK && methodOK) {
      roundOK = same(String(pick.round || ""), String(result.round || ""));
    }
    return { hasResult, winnerOK, methodOK, roundOK };
  }

  function resultIcon(ok) {
    if (ok === null) return "";
    return ok ? "✓" : "✗";
  }

  /* ---------- My Picks ---------- */
  function loadMyPicks() {
    api.getUserPicks(username)
      .then(data => {
        const myPicksDiv = document.getElementById("myPicks");
        if (!data.success || !data.picks.length) {
          myPicksDiv.style.display = "none";
          myPicksDiv.innerHTML = "";
          return;
        }

        myPicksDiv.style.display = "grid";
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";

        Promise.all([ getLeaderboardCached(), getFightsCached() ]).then(([resultData, fightsData]) => {
          buildFightMeta(fightsData);

          const fightResultsExact = resultData.fightResults || {};
          const fightResultsNorm = new Map();
          Object.keys(fightResultsExact).forEach(k => {
            fightResultsNorm.set(normKey(k), fightResultsExact[k]);
          });

          const officialFOTN = resultData.officialFOTN || [];
          const myFOTN = data.fotnPick || "";

          if (myFOTN) {
            const gotIt = officialFOTN.length && officialFOTN.includes(myFOTN);
            const badge = gotIt ? `<span class="points">+${FOTN_POINTS} pts</span>` : "";
            myPicksDiv.innerHTML += `
              <div class="scored-pick fotn-strip">
                <div class="fight-name">⭐ Fight of the Night</div>
                <div class="user-pick ${gotIt ? 'correct' : (officialFOTN.length ? 'wrong' : '')}">
                  ${myFOTN} ${badge}
                  ${officialFOTN.length ? `<div class="hint">Official: ${officialFOTN.join(", ")}</div>` : ""}
                </div>
              </div>
            `;
          }

          data.picks.forEach(({ fight, winner, method, round }) => {
            let actual = fightResultsExact[fight];
            if (!actual) actual = fightResultsNorm.get(normKey(fight)) || {};
            const verdict = judgePickAgainstResult({ fight, winner, method, round }, actual);

            const meta = fightMeta.get(fight) || {};
            const dogSide = meta.underdogSide;
            const dogTier = underdogBonusFromOdds(meta.underdogOdds);
            const chosenIsUnderdog =
              (dogSide === "Fighter 1" && winner === meta.f1) ||
              (dogSide === "Fighter 2" && winner === meta.f2);

            const dogChip = (chosenIsUnderdog && dogTier > 0)
              ? `<span class="dog-tag dog-tag--chip">🐶 +${dogTier} pts</span>`
              : "";

            // Score calc (winner 3, method +2 if winnerOK, round +1 if not decision & winner+method OK & round OK)
            let score = 0;
            if (verdict.hasResult && verdict.winnerOK) {
              score += 3;
              if (verdict.methodOK) {
                score += 2;
                if (method !== "Decision" && verdict.roundOK) score += 1;
              }
              // Apply underdog bonus based on your card metadata (don’t rely on GAS flag)
              if (chosenIsUnderdog && dogTier > 0) {
                score += dogTier;
              }
            }

            // Build parts; show green/red only when results exist (your rule)
            const winnerClass = verdict.hasResult ? (verdict.winnerOK ? "correct" : "wrong") : "";
            const methodClass = verdict.hasResult && verdict.winnerOK ? (verdict.methodOK ? "correct" : "wrong") : "";
            const roundClass  = (verdict.hasResult && verdict.winnerOK && verdict.methodOK && method !== "Decision")
              ? (verdict.roundOK ? "correct" : "wrong")
              : "";

            const winIcon = resultIcon(verdict.winnerOK);
            const methIcon = resultIcon(verdict.methodOK);
            const rndIcon = (method !== "Decision") ? resultIcon(verdict.roundOK) : "";

            let winnerHtml, methodHtml, roundHtml;

            if (!verdict.hasResult) {
              // pre-result: never red
              winnerHtml = `<span class="winner-text pre">${winner}</span>`;
              methodHtml = `<span class="method-text pre">${method}</span>`;
              roundHtml  = (method === "Decision") ? "" : `in Round <span class="chip chip-round pre">${round}</span>`;
            } else {
              winnerHtml = `<span class="winner-text ${winnerClass}">${winner} ${winIcon}</span>`;
              methodHtml = `<span class="${methodClass}">${method} ${methIcon}</span>`;
              roundHtml  = (method === "Decision") ? "" : `in Round <span class="chip chip-round ${roundClass}">${round} ${rndIcon}</span>`;
            }

            const pointsChip = verdict.hasResult ? `<span class="points">+${score} pts</span>` : "";

            const earnNote = (!verdict.hasResult && chosenIsUnderdog && dogTier > 0)
              ? `<span class="earn-note">🐶 +${dogTier} potential bonus if correct</span>`
              : (verdict.hasResult && chosenIsUnderdog && dogTier > 0 && verdict.winnerOK)
                ? `<span class="earn-note">🐶 +${dogTier} bonus</span>`
                : "";

            myPicksDiv.innerHTML += `
              <div class="scored-pick">
                <div class="fight-name">${fight}</div>
                <div class="user-pick">
                  ${winnerHtml} ${dogChip}
                  &nbsp;by&nbsp; ${methodHtml} ${roundHtml}
                  ${earnNote}
                </div>
                ${pointsChip}
              </div>`;
          });
        });
      });
  }

  /* ---------- Champion banner + Weekly Leaderboard ---------- */
  function showPreviousChampionBanner() {
    api.getChampionBanner()
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

    Promise.all([ getFightsCached(), getLeaderboardCached() ]).then(([fightsData, leaderboardData]) => {
      const board = leaderboardEl;
      board.classList.add("board","weekly");
      board.innerHTML = "";

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

      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt(lis[0].lastElementChild.textContent, 10);
        lis.forEach(li => {
          const val = parseInt(li.lastElementChild.textContent, 10);
          if (val === topScore) li.classList.add("tied-first");
        });
      }

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
