document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const lockBtn = document.getElementById("lockBtn"); // <-- new
  const champBanner = document.getElementById("champBanner");
  const punchSound = new Audio("punch.mp3");

  // Escape helper
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Kill any <a href="#"> default nav anywhere
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="#"]');
    if (a) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // --- All-Time cache (refetched on tab click for freshness) ---
  let allTimeByUser = null;

  // --- Build "Weekly | All-Time" tabs ---
  const leaderboardEl = document.getElementById("leaderboard");

  let tabsBar = document.getElementById("boardTabs");
  const tabsHtml = `
    <button type="button" id="tabWeekly"  class="tab-btn" aria-pressed="true">Weekly</button>
    <button type="button" id="tabAllTime" class="tab-btn" aria-pressed="false">All-Time</button>
  `;
  if (!tabsBar) {
    tabsBar = document.createElement("div");
    tabsBar.id = "boardTabs";
    tabsBar.style.display = "flex";
    tabsBar.style.gap = "8px";
    tabsBar.style.margin = "12px 0";
    tabsBar.innerHTML = tabsHtml;
    if (leaderboardEl) leaderboardEl.before(tabsBar);
  } else {
    tabsBar.innerHTML = tabsHtml;
  }

  // All-Time list container
  let allTimeList = document.getElementById("allTimeBoard") || document.getElementById("hallBoard");
  if (!allTimeList) {
    allTimeList = document.createElement("ul");
    allTimeList.id = "allTimeBoard";
    allTimeList.style.display = "none";
    allTimeList.style.listStyle = "none";
    allTimeList.style.padding = "0";
    if (leaderboardEl) leaderboardEl.after(allTimeList);
  } else {
    allTimeList.id = "allTimeBoard";
    allTimeList.style.display = "none";
  }

  function setTabs(showAllTime) {
    const y = window.scrollY; // preserve scroll
    const weeklyBtn  = document.getElementById("tabWeekly");
    const allTimeBtn = document.getElementById("tabAllTime");

    if (showAllTime) {
      leaderboardEl.style.display = "none";
      allTimeList.style.display = "block";
      weeklyBtn?.setAttribute("aria-pressed", "false");
      allTimeBtn?.setAttribute("aria-pressed", "true");
      allTimeByUser = null; // force refresh
      loadAllTime();
    } else {
      leaderboardEl.style.display = "block";
      allTimeList.style.display = "none";
      weeklyBtn?.setAttribute("aria-pressed", "true");
      allTimeBtn?.setAttribute("aria-pressed", "false");
    }

    requestAnimationFrame(() => {
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, y);
      html.style.scrollBehavior = prev || "";
    });
  }

  // Tab listeners (no delegation; stop everything)
  document.getElementById("tabWeekly")?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopImmediatePropagation(); e.currentTarget.blur();
    setTabs(false);
  });
  document.getElementById("tabAllTime")?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopImmediatePropagation(); e.currentTarget.blur();
    setTabs(true);
  });

  // --- Login / username (localStorage) ---
  let username = localStorage.getItem("username");

  if (lockBtn) {
    lockBtn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      const input = usernameInput.value.trim();
      if (!input) return alert("Please enter your name.");
      username = input;
      localStorage.setItem("username", username);
      finalizeLogin(username);
    });
  }

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

          const nameKey = `${esc(fight)}-winner`;
          div.innerHTML = `
            <h3>${esc(fight)}</h3>
            <label><input type="radio" name="${nameKey}" value="${esc(fighter1)}">${esc(fighter1)} ${dog1}</label>
            <label><input type="radio" name="${nameKey}" value="${esc(fighter2)}">${esc(fighter2)} ${dog2}</label>
            <select name="${esc(fight)}-method">
              <option value="Decision">Decision</option>
              <option value="KO/TKO">KO/TKO</option>
              <option value="Submission">Submission</option>
            </select>
            <select name="${esc(fight)}-round">
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

        });

        fightList.style.display = "block";
        submitBtn.style.display = "block";
      });
  }

  function submitPicks() {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (const fight of fights) {
      const fightName = fight.querySelector("h3").innerText;
      const nameKey = `${fightName}-winner`.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
      const winner = fight.querySelector(`input[name="${nameKey}"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${esc(fightName)}-method"]`)?.value;
      const roundRaw = fight.querySelector(`select[name="${esc(fightName)}-round"]`);
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
          try { punchSound.play(); } catch (_) {}
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

  submitBtn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopImmediatePropagation();
    submitPicks();
  });

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
                  if (method !== "Decision" && matchRound) {
                    score += 1;
                  }
                }
                if (isUnderdog) score += 2;
              }

              const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "";
              const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "";
              const roundClass = hasResult && matchWinner && matchMethod && method !== "Decision"
                ? (matchRound ? "correct" : "wrong")
                : "";

              const dogIcon = hasResult && matchWinner && isUnderdog ? `<span class="correct">🐶</span>` : "";
              const roundText = method === "Decision" ? "(Decision)" : `in Round <span class="${roundClass}">${round}</span>`;
              const pointsChip = hasResult ? `<span class="points">+${score} pts</span>` : "";

              myPicksDiv.innerHTML += `
                <div class="scored-pick">
                  <div class="fight-name">${esc(fight)}</div>
                  <div class="user-pick">
                    <span class="${winnerClass}">${esc(winner)}</span> ${dogIcon} by
                    <span class="${methodClass}">${esc(method)}</span> ${roundText}
                  </div>
                  ${pointsChip}
                </div>`;
            });
          });
      });
  }

  function loadLeaderboard() {
    Promise.all([
      fetch("/api/fights").then(r => r.json()),
      fetch("/api/leaderboard", { method: "POST" }).then(r => r.json())
    ]).then(([fightsData, leaderboardData]) => {
      const board = document.getElementById("leaderboard");
      board.innerHTML = "";

      const scores = Object.entries(leaderboardData.scores || {}).sort((a, b) => b[1] - a[1]);

      let rank = 1;
      let prevScore = null;
      let actualRank = 1;

      scores.forEach(([user, score], index) => {
        if (score !== prevScore) actualRank = rank;

        const li = document.createElement("li");
        let displayName = esc(user);
        let classes = [];

        if (leaderboardData.champs?.includes(user)) {
          classes.push("champ-glow");
          displayName = `<span class="crown">👑</span> ${esc(user)}`;
        }

        if (index === scores.length - 1) {
          classes.push("loser");
          displayName = `💩 ${displayName}`;
        }

        if (user === username) {
          classes.push("current-user");
        }

        li.className = classes.join(" ");
        li.innerHTML = `<span>#${actualRank}</span> <span>${displayName}</span><span>${score} pts</span>`;
        board.appendChild(li);

        prevScore = score;
        rank++;
      });

      // Glow all tied #1 entries
      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt(lis[0].lastElementCh
