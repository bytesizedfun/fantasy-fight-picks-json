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

  let username = localStorage.getItem("username");

  // ---- Local state for odds & FOTN ----
  const fightOdds = new Map();       // fightName -> underdogOdds (e.g. "+240")
  let fotnSelect;                    // created dynamically
  let fotnBlock;                     // wrapper for FOTN UI

  /* ---------- Login ---------- */
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
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${name.toUpperCase()}!`;
    welcome.style.display = "block";
    document.getElementById("scoringRules").style.display = "block";

    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.picks.length > 0) {
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
        } else {
          localStorage.removeItem("submitted");
          loadFights();                 // builds fight cards + FOTN UI from fight_list
          submitBtn.style.display = "block";
        }

        loadMyPicks();
        loadLeaderboard();
      });

    preloadAllTime();
  }

  /* ---------- Helpers ---------- */
  function computeUnderdogBonusClient(odds) {
    if (odds == null || odds === "") return 0;
    let n = odds;
    if (typeof n === "string") {
      n = parseInt(n.replace("+", "").trim(), 10);
    }
    if (!Number.isFinite(n) || n < 100) return 0;
    return 1 + Math.floor((n - 100) / 100);
  }

  function buildFotnUI(fightNames) {
    // wrapper
    fotnBlock = document.createElement("div");
    fotnBlock.id = "fotnBlock";
    fotnBlock.style.margin = "18px 0 6px";

    const label = document.createElement("label");
    label.textContent = "Fight of the Night:";
    label.style.display = "block";
    label.style.marginBottom = "6px";

    fotnSelect = document.createElement("select");
    fotnSelect.id = "fotnSelect";
    fotnSelect.style.width = "100%";
    fotnSelect.style.padding = "8px";
    fotnSelect.style.borderRadius = "10px";

    // placeholder option
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "-- select a fight --";
    fotnSelect.appendChild(ph);

    fightNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      fotnSelect.appendChild(opt);
    });

    fotnBlock.appendChild(label);
    fotnBlock.appendChild(fotnSelect);

    // insert FOTN block just before submit button
    submitBtn.parentNode.insertBefore(fotnBlock, submitBtn);
  }

  /* ---------- Fights ---------- */
  function loadFights() {
    fetch("/api/fights")
      .then(res => res.json())
      .then(data => {
        // keep odds map fresh for per-fight scoring display
        fightOdds.clear();

        fightList.innerHTML = "";
        const fightNamesForFotn = [];

        data.forEach(({ fight, fighter1, fighter2, underdog, underdogOdds }) => {
          fightNamesForFotn.push(fight);
          if (underdogOdds != null) fightOdds.set(fight, underdogOdds);

          const dog1 = underdog === "Fighter 1" ? "🐶" : "";
          const dog2 = underdog === "Fighter 2" ? "🐶" : "";

          const div = document.createElement("div");
          div.className = "fight";
          div.innerHTML = `
            <h3>${fight}</h3>
            <label><input type="radio" name="${fight}-winner" value="${fighter1}">${fighter1} ${dog1}</label>
            <label><input type="radio" name="${fight}-winner" value="${fighter2}">${fighter2} ${dog2}</label>
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
          `;
          fightList.appendChild(div);
        });

        // method/round gating
        document.querySelectorAll(".fight").forEach(fight => {
          const methodSelect = fight.querySelector(`select[name$="-method"]`);
          const roundSelect = fight.querySelector(`select[name$="-round"]`);

          methodSelect.addEventListener("change", () => {
            roundSelect.disabled = methodSelect.value === "Decision";
            if (roundSelect.disabled) roundSelect.value = "";
            else roundSelect.value = "1";
          });

          if (methodSelect.value === "Decision") {
            roundSelect.disabled = true;
            roundSelect.value = "";
          }
        });

        // Build/refresh FOTN block
        if (fotnBlock) fotnBlock.remove();
        buildFotnUI(fightNamesForFotn);

        fightList.style.display = "block";
        submitBtn.style.display = "block";
      });
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

    // Require FOTN selection (cleaner UX)
    const fotnPick = document.getElementById("fotnSelect")?.value || "";
    if (!fotnPick) {
      alert("Pick your Fight of the Night.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Picks";
      return;
    }

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks, fotnPick })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          try { punchSound.play(); } catch(_) {}
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          if (fotnBlock) fotnBlock.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
          loadLeaderboard();
        } else {
          alert(data.error || "Something went wrong.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Picks";
        }
      });
  }
  submitBtn.addEventListener("click", submitPicks);
  window.submitPicks = submitPicks;

  /* ---------- My Picks (green/red + points + FOTN panel) ---------- */
  function loadMyPicks() {
    // we need fights for underdog odds to compute bonus locally
    const fightsPromise = fetch("/api/fights").then(r => r.json()).catch(() => []);
    const picksPromise = fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    }).then(r => r.json());

    Promise.all([fightsPromise, picksPromise]).then(([fightsData, data]) => {
      // refresh local odds map
      fightOdds.clear();
      (fightsData || []).forEach(f => {
        if (f && f.fight) fightOdds.set(f.fight, f.underdogOdds);
      });

      const myPicksDiv = document.getElementById("myPicks");
      myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
      if (!data.success || !data.picks.length) {
        myPicksDiv.innerHTML += "<p>No picks submitted.</p>";
        return;
      }

      // fetch results + FOTN to show both displays
      fetch("/api/leaderboard", { method: "POST" })
        .then(res => res.json())
        .then(resultData => {
          const fightResults = resultData.fightResults || {};
          const officialFOTN = resultData.officialFOTN || [];
          const myFotn = data.fotnPick || "";
          const gotFotn = (myFotn && officialFOTN.includes(myFotn));

          // per-fight rows with 3/2/1 & uncapped dog bonus
          data.picks.forEach(({ fight, winner, method, round }) => {
            let score = 0;
            const actual = fightResults[fight] || {};
            const hasResult = actual.winner && actual.method;
            const matchWinner = hasResult && winner === actual.winner;
            const matchMethod = hasResult && method === actual.method;
            const finished = hasResult && actual.method !== "Decision";
            const matchRound = finished && hasResult && round == actual.round;

            // 3/2/1 base
            if (matchWinner) {
              score += 3;
              if (matchMethod) {
                score += 2;
                if (finished && matchRound) score += 1;
              }
              // underdog bonus when you picked the winner AND the actual winner was the underdog
              if (actual.underdog === "Y") {
                const odds = fightOdds.get(fight); // e.g. "+240"
                score += computeUnderdogBonusClient(odds);
              }
            }

            const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "";
            const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "";
            const roundClass = hasResult && matchWinner && matchMethod && method !== "Decision"
              ? (matchRound ? "correct" : "wrong")
              : "";

            const dogIcon = hasResult && matchWinner && actual.underdog === "Y" ? `<span class="correct">🐶</span>` : "";
            const roundText = method === "Decision" ? "(Decision)" : `in Round <span class="${roundClass}">${round}</span>`;
            const pointsChip = hasResult ? `<span class="points">+${score} pts</span>` : "";

            myPicksDiv.innerHTML += `
              <div class="scored-pick">
                <div class="fight-name">${fight}</div>
                <div class="user-pick">
                  <span class="${winnerClass}">${winner}</span> ${dogIcon} by
                  <span class="${methodClass}">${method}</span> ${roundText}
                </div>
                ${pointsChip}
              </div>`;
          });

          // FOTN summary strip
          const fotnWrap = document.createElement("div");
          fotnWrap.className = "fotn-strip";
          fotnWrap.style.marginTop = "10px";

          const yourPick = myFotn ? myFotn : "—";
          const official = officialFOTN.length ? officialFOTN.join(", ") : "—";
          const fotnPts = gotFotn ? `<span class="points">+3 FOTN</span>` : "";

          fotnWrap.innerHTML = `
            <div class="scored-pick">
              <div class="fight-name">Fight of the Night</div>
              <div class="user-pick">
                You picked: <strong>${yourPick}</strong><br/>
                Official: <strong>${official}</strong>
              </div>
              ${fotnPts}
            </div>
          `;
          myPicksDiv.appendChild(fotnWrap);
        });
    });
  }

  /* ---------- Weekly Leaderboard ---------- */
  function loadLeaderboard() {
    Promise.all([
      fetch("/api/fights").then(r => r.json()),
      fetch("/api/leaderboard", { method: "POST" }).then(r => r.json())
    ]).then(([fightsData, leaderboardData]) => {
      // keep odds map current for any later use
      fightOdds.clear();
      (fightsData || []).forEach(f => {
        if (f && f.fight) fightOdds.set(f.fight, f.underdogOdds);
      });

      const board = leaderboardEl;
      board.innerHTML = "";

      const scores = Object.entries(leaderboardData.scores || {}).sort((a, b) => b[1] - a[1]);

      let rank = 1;
      let prevScore = null;
      let actualRank = 1;

      scores.forEach(([user, score], index) => {
        if (score !== prevScore) actualRank = rank;

        const li = document.createElement("li");
        let displayName = user;
        let classes = [];

        if (leaderboardData.champs?.includes(user)) {
          classes.push("champ-glow");
          displayName = `<span class="crown">👑</span> ${displayName}`;
        }
        if (index === scores.length - 1) {
          classes.push("loser");
          displayName = `💩 ${displayName}`;
        }
        if (user === username) classes.push("current-user");

        // add FOTN +3 tag if user hit it
        let scoreSuffix = `${score} pts`;
        if (leaderboardData.fotnPoints && leaderboardData.fotnPoints[user] === 3) {
          scoreSuffix += ` (+3 FOTN)`;
        }

        li.className = classes.join(" ");
        li.innerHTML = `<span>#${actualRank}</span> <span>${displayName}</span><span>${scoreSuffix}</span>`;
        board.appendChild(li);

        prevScore = score;
        rank++;
      });

      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt((lis[0].lastElementChild.textContent || "0").replace(/\D+/g,""), 10);
        lis.forEach(li => {
          const val = parseInt((li.lastElementChild.textContent || "0").replace(/\D+/g,""), 10);
          if (val === topScore) li.classList.add("tied-first");
        });
      }

      // champ banner only after all results complete
      const totalFights = fightsData.length;
      const completedResults = Object.values(leaderboardData.fightResults || {}).filter(
        res => res.winner && res.method
      ).length;

      if (leaderboardData.champMessage && totalFights > 0 && completedResults === totalFights) {
        champBanner.textContent = `🏆 ${leaderboardData.champMessage}`;
        champBanner.style.display = "block";
      } else {
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

    // competition ranking 1,1,1,4...
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
      .then(rows => {
        allTimeData = sortAllTime(rows);
        allTimeLoaded = true;
      })
      .catch(() => {});
  }

  function loadAllTimeInteractive() {
    if (allTimeLoaded) { drawAllTime(allTimeData); return; }
    const keepHeight = leaderboardEl.offsetHeight || 260;
    allTimeList.style.minHeight = `${keepHeight}px`;
    allTimeList.innerHTML = "";

    fetchWithTimeout("/api/hall", 6000)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(rows => {
        allTimeData = sortAllTime(rows);
        allTimeLoaded = true;
        drawAllTime(allTimeData);
      })
      .catch(err => {
        allTimeList.innerHTML = `<li>All-Time unavailable. ${err?.message ? '('+err.message+')' : ''}</li>`;
      })
      .finally(() => { allTimeList.style.minHeight = ""; });
  }

  /* Tabs */
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
