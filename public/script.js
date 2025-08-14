document.addEventListener("DOMContentLoaded", () => {
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
  const punchSound = new Audio("punch.mp3");

  const fotnBlock = document.getElementById("fotnBlock");
  const fotnSelect = document.getElementById("fotnSelect");

  let username = localStorage.getItem("username");

  // odds / underdog cache
  const fightMeta = new Map(); // fight -> { f1, f2, f1Odds, f2Odds, underdogSide, underdogOdds }
  const FOTN_POINTS = 3;

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
  window.lockUsername = doLogin;
  const loginBtn = document.querySelector("#usernamePrompt button");
  if (loginBtn) loginBtn.addEventListener("click", doLogin);

  if (username) {
    usernameInput.value = username;
    finalizeLogin(username);
  }

  function finalizeLogin(name) {
    if (usernamePrompt) usernamePrompt.style.display = "none";
    if (welcome) {
      welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${name.toUpperCase()}!`;
      welcome.style.display = "block";
    }
    const scoring = document.getElementById("scoringRules");
    if (scoring) scoring.style.display = "block";

    Promise.all([
      fetch("/api/fights").then(r => r.json()).then(data => { buildFightMeta(data); return data; }),
      fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name })
      }).then(r => r.json())
    ])
    .then(([fightsData, pickData]) => {
      const submitted = pickData.success && pickData.picks.length > 0;
      if (submitted) {
        localStorage.setItem("submitted", "true");
        if (fightList) fightList.style.display = "none";
        if (submitBtn) submitBtn.style.display = "none";
        if (fotnBlock) fotnBlock.style.display = "none";
      } else {
        localStorage.removeItem("submitted");
        renderFightList(fightsData);
        renderFOTN(fightsData, pickData.fotnPick);
        if (submitBtn) submitBtn.style.display = "block";
      }

      if (leaderboardEl) leaderboardEl.classList.add("board","weekly"); // OG styles
      loadMyPicks();
      loadLeaderboard();
      preloadAllTime();
    })
    .catch(err => {
      console.error(err);
      loadFights();
      if (leaderboardEl) leaderboardEl.classList.add("board","weekly");
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
    fetch("/api/fights")
      .then(res => res.json())
      .then(data => {
        buildFightMeta(data);
        renderFightList(data);
        renderFOTN(data);
      });
  }

  function renderFOTN(fightsData, existingPick = "") {
    if (!fotnBlock || !fotnSelect) return;
    if (!fotnBlock.querySelector(".fotn-title")) {
      const title = document.createElement("div");
      title.className = "fotn-title";
      title.textContent = "⭐ Fight of the Night";
      fotnBlock.prepend(title);
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "+3 pts if correct";
      fotnBlock.appendChild(hint);
    }
    const names = (fightsData || []).map(f => f.fight);
    if (!names.length) { fotnBlock.style.display = "none"; return; }
    fotnSelect.innerHTML = `<option value="">— Select your FOTN —</option>` +
      names.map(n => `<option value="${n}">${n}</option>`).join("");
    if (existingPick) fotnSelect.value = existingPick;
    fotnBlock.style.display = "block";
  }

  function renderFightList(data) {
    if (!fightList) return;
    fightList.innerHTML = "";
    (data || []).forEach(({ fight, fighter1, fighter2 }) => {
      const meta = fightMeta.get(fight) || {};
      const dogSide = meta.underdogSide;                           // "Fighter 1" | "Fighter 2" | ""
      const dogTier = underdogBonusFromOdds(meta.underdogOdds);    // 0,1,2,...

      const isDog1 = dogSide === "Fighter 1";
      const isDog2 = dogSide === "Fighter 2";

      const name1Cls = `fighter-name${isDog1 ? " is-underdog" : ""}`;
      const name2Cls = `fighter-name${isDog2 ? " is-underdog" : ""}`;

      const chip1 = (isDog1 && dogTier > 0)
        ? `<span class="bonus-chip" title="+${dogTier} bonus if ${fighter1} wins"><span class="icon">⚡</span>+${dogTier} Bonus</span>`
        : "";
      const chip2 = (isDog2 && dogTier > 0)
        ? `<span class="bonus-chip" title="+${dogTier} bonus if ${fighter2} wins"><span class="icon">⚡</span>+${dogTier} Bonus</span>`
        : "";

      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <h3>${fight}</h3>

        <label>
          <input type="radio" name="${fight}-winner" value="${fighter1}">
          <span class="fighter-line">
            <span class="${name1Cls}">${fighter1}</span>
            <span class="fighter-right">${chip1}</span>
          </span>
        </label>

        <label>
          <input type="radio" name="${fight}-winner" value="${fighter2}">
          <span class="fighter-line">
            <span class="${name2Cls}">${fighter2}</span>
            <span class="fighter-right">${chip2}</span>
          </span>
        </label>

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

    fightList.style.display = "block";
    if (submitBtn) submitBtn.style.display = "block";
  }

  /* ---------- Submit picks ---------- */
  function submitPicks() {
    if (!submitBtn) return;
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

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks, fotnPick })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        try { punchSound.play(); } catch (_) {}
        alert("Picks submitted!");
        localStorage.setItem("submitted", "true");
        if (fightList) fightList.style.display = "none";
        if (submitBtn) submitBtn.style.display = "none";
        if (fotnBlock) fotnBlock.style.display = "none";
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
  if (submitBtn) {
    submitBtn.addEventListener("click", submitPicks);
    window.submitPicks = submitPicks;
  }

  /* ---------- My Picks ---------- */
  function loadMyPicks() {
    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
    .then(res => res.json())
    .then(data => {
      const myPicksDiv = document.getElementById("myPicks");
      if (!myPicksDiv) return;
      myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
      if (!data.success || !data.picks.length) {
        myPicksDiv.innerHTML += "<p>No picks submitted.</p>";
        return;
      }

      Promise.all([
        fetch("/api/leaderboard", { method: "POST" }).then(res => res.json()),
        fetch("/api/fights").then(r => r.json())
      ]).then(([resultData, fightsData]) => {
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

          // Underdog bonus chip (only if chosen fighter is the true underdog)
          const meta = fightMeta.get(fight) || {};
          const dogSide = meta.underdogSide;
          const dogTier = underdogBonusFromOdds(meta.underdogOdds);
          const chosenIsUnderdog =
            (dogSide === "Fighter 1" && winner === meta.f1) ||
            (dogSide === "Fighter 2" && winner === meta.f2);

          const bonusChip = (chosenIsUnderdog && dogTier > 0)
            ? `<span class="bonus-chip" title="+${dogTier} bonus if underdog won"><span class="icon">⚡</span>+${dogTier} Bonus</span>`
            : "";

          let score = 0;
          if (matchWinner) {
            score += 3;
            if (matchMethod) {
              score += 2;
              if (method !== "Decision" && matchRound) score += 1;
            }
            if (hasResult && actual.underdog === "Y") score += dogTier; // same tiering as backend
          }

          const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "";
          const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "";
          const roundClass = hasResult && matchWinner && matchMethod && method !== "Decision"
            ? (matchRound ? "correct" : "wrong")
            : "";

          const roundText = method === "Decision" ? "(Decision)"
            : `in Round <span class="${roundClass}">${round}</span>`;
          const pointsChip = hasResult ? `<span class="points">+${score} pts</span>` : "";

          myPicksDiv.innerHTML += `
            <div class="scored-pick">
              <div class="fight-name">${fight}</div>
              <div class="user-pick">
                <span class="${winnerClass}">${winner}</span> ${bonusChip} by
                <span class="${methodClass}">${method}</span> ${roundText}
              </div>
              ${pointsChip}
            </div>`;
        });
      });
    });
  }

  /* ---------- Weekly Leaderboard ---------- */
  function loadLeaderboard() {
    Promise.all([
      fetch("/api/fights").then(r => r.json()),
      fetch("/api/leaderboard", { method: "POST" }).then(r => r.json())
    ]).then(([fightsData, leaderboardData]) => {
      const board = leaderboardEl;
      if (!board) return;
      board.classList.add("board","weekly");
      board.innerHTML = "";

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
        if (index === scores.length - 1) {
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

      // champ banner only when event concluded
      const totalFights = (fightsData || []).length;
      const completedResults = Object.values(leaderboardData.fightResults || {}).filter(
        res => res.winner && res.method
      ).length;

      if (leaderboardData.champMessage && totalFights > 0 && completedResults === totalFights) {
        champBanner.textContent = `🏆 ${leaderboardData.champMessage}`;
        champBanner.style.display = "block";
      } else if (champBanner) {
        champBanner.style.display = "none";
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
    if (leaderboardEl) leaderboardEl.style.display = "block";
    if (allTimeList) allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });

  allTimeTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    loadAllTimeInteractive();
    if (leaderboardEl) leaderboardEl.style.display = "none";
    if (allTimeList) allTimeList.style.display = "block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
