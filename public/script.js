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

  // -------- Inline handlers exposed for HTML --------
  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    finalizeLogin(username);
  }
  window.lockUsername = doLogin;

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

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          try { punchSound.play(); } catch(_) {}
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
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
  window.submitPicks = submitPicks;

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
          loadFights();
          submitBtn.style.display = "block";
        }

        loadMyPicks();
        loadLeaderboard();
      });
  }

  // -------- Fights --------
  function loadFights() {
    fetch("/api/fights")
      .then(res => res.json())
      .then(data => {
        fightList.innerHTML = "";
        data.forEach(({ fight, fighter1, fighter2, underdog }) => {
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

        fightList.style.display = "block";
        submitBtn.style.display = "block";
      });
  }

  // -------- My Picks --------
  function loadMyPicks() {
    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(data => {
        const myPicksDiv = document.getElementById("myPicks");
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
        if (!data.success || !data.picks.length) {
          myPicksDiv.innerHTML += "<p>No picks submitted.</p>";
          return;
        }

        fetch("/api/leaderboard", { method: "POST" })
          .then(res => res.json())
          .then(resultData => {
            const fightResults = resultData.fightResults || {};
            data.picks.forEach(({ fight, winner, method, round }) => {
              let score = 0;
              const actual = fightResults[fight] || {};
              const hasResult = actual.winner && actual.method;
              const matchWinner = hasResult && winner === actual.winner;
              const matchMethod = hasResult && method === actual.method;
              const matchRound = hasResult && round == actual.round;
              const isUnderdog = actual.underdog === "Y";

              if (matchWinner) {
                score += 1;
                if (matchMethod) {
                  score += 1;
                  if (method !== "Decision" && matchRound) score += 1;
                }
                if (isUnderdog) score += 2;
              }

              const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "";
              const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "";
              const roundClass = hasResult && matchWinner && matchMethod && method !== "Decision"
                ? (matchRound ? "correct" : "wrong")
                : "";

              const dogIcon = hasResult && matchWinner && isUnderdog ? `<span class="correct">🐶</span>` : "";
              const roundText = method === "Decision"
                ? "(Decision)"
                : `in Round <span class="${roundClass}">${round}</span>`;

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
          });
      });
  }

  // -------- Weekly board --------
  function loadLeaderboard() {
    Promise.all([
      fetch("/api/fights").then(r => r.json()),
      fetch("/api/leaderboard", { method: "POST" }).then(r => r.json())
    ]).then(([fightsData, leaderboardData]) => {
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

        li.className = classes.join(" ");
        li.innerHTML = `<span>#${actualRank}</span> <span>${displayName}</span><span>${score} pts</span>`;
        board.appendChild(li);

        prevScore = score;
        rank++;
      });

      // tie highlight
      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt(lis[0].lastElementChild.textContent, 10);
        lis.forEach(li => {
          const val = parseInt(li.lastElementChild.textContent, 10);
          if (val === topScore) li.classList.add("tied-first");
        });
      }

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

  // =========================
  // ALL-TIME: PRELOAD + RENDER
  // =========================
  let allTimeLoaded = false;
  let allTimeData = [];

  // Fetch with timeout + 1 retry
  function fetchWithTimeout(url, ms = 6000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(t));
  }

  function sortAllTime(rows) {
    return (rows || [])
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

  function renderAllTimeSkeleton(rows = 6, minHeight = 0) {
    allTimeList.style.minHeight = minHeight ? `${minHeight}px` : "";
    allTimeList.innerHTML = "";
    for (let i = 0; i < rows; i++) {
      const li = document.createElement("li");
      li.className = "skeleton";
      li.innerHTML = `
        <span class="sk-block"></span>
        <span class="sk-line"></span>
        <span class="sk-line short"></span>
      `;
      allTimeList.appendChild(li);
    }
  }

  function renderAllTimeHeader() {
    const li = document.createElement("li");
    li.className = "board-header";
    li.innerHTML = `
      <span>#</span>
      <span>Player</span>
      <span class="hdr-right">Rate • Crowns • Events</span>
    `;
    allTimeList.appendChild(li);
  }

  function drawAllTime(data) {
    allTimeList.innerHTML = "";
    if (!data.length) {
      allTimeList.innerHTML = "<li>No All-Time data yet.</li>";
      return;
    }

    // Header
    renderAllTimeHeader();

    // Rows
    const medal = (i) => (i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`);
    const topRate = data[0]?.rate ?? 0;

    data.forEach((row, idx) => {
      const li = document.createElement("li");
      const classes = [];
      if (row.user === username) classes.push("current-user");
      if (row.rate === topRate) classes.push("tied-first");
      li.className = classes.join(" ");

      const pct = (row.rate * 100).toFixed(1) + "%";
      const fill = Math.min(100, Math.max(0, row.rate * 100));

      li.innerHTML = `
        <span class="rank">${medal(idx)}</span>
        <span class="user">
          ${row.user}
          <span class="chips">
            <span class="chip crown">👑 ${row.crowns}</span>
            <span class="chip event">🎟 ${row.events}</span>
          </span>
        </span>
        <span class="right">
          <span class="rate">${pct}</span>
          <span class="meter"><span class="fill" style="width:${fill}%"></span></span>
        </span>
      `;
      allTimeList.appendChild(li);
    });
  }

  function preloadAllTime() {
    // kick off a background fetch so first click is instant
    fetchWithTimeout("/api/hall", 6000)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(rows => {
        allTimeData = sortAllTime(rows);
        allTimeLoaded = true;
      })
      .catch(err => {
        // silent: we’ll retry on tab click
        console.debug("All-Time preload failed:", err?.message || err);
      });
  }

  function loadAllTimeInteractive() {
    // If already loaded, just draw
    if (allTimeLoaded) {
      drawAllTime(allTimeData);
      return;
    }

    // Show skeleton sized to current weekly panel BEFORE we hide it
    const panelHeight = leaderboardEl.offsetHeight || 260;
    renderAllTimeSkeleton(6, panelHeight);

    // Try fetch (timeout + 1 retry)
    fetchWithTimeout("/api/hall", 6000)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(rows => {
        allTimeData = sortAllTime(rows);
        allTimeLoaded = true;
        drawAllTime(allTimeData);
      })
      .catch(() => {
        // retry once
        return fetchWithTimeout("/api/hall", 6000)
          .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
          .then(rows => {
            allTimeData = sortAllTime(rows);
            allTimeLoaded = true;
            drawAllTime(allTimeData);
          })
          .catch(err => {
            allTimeList.style.minHeight = "";
            allTimeList.innerHTML = `<li>All-Time unavailable. ${err?.message ? '('+err.message+')' : ''}</li>`;
          });
      })
      .finally(() => {
        // ensure minHeight cleared after draw
        setTimeout(() => { allTimeList.style.minHeight = ""; }, 0);
      });
  }

  // -------- Tabs (compute height BEFORE swapping) --------
  weeklyTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    leaderboardEl.style.display = "block";
    allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });

  allTimeTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    // draw/fetch first, then swap visibility (prevents “nothing shows” flash)
    loadAllTimeInteractive();
    leaderboardEl.style.display = "none";
    allTimeList.style.display = "block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });

  // -------- Preload All-Time in the background --------
  preloadAllTime();
});
