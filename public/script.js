document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const champBanner = document.getElementById("champBanner");
  const punchSound = new Audio("punch.mp3");

  // --- lightweight Hall cache ---
  let hallByUser = null; // { username: {crowns, crown_rate, events_played} }

  // --- Create a simple toggle for Weekly vs Hall (no HTML changes needed) ---
  const leaderboardWrap = document.getElementById("leaderboard")?.parentElement || document.body;
  let tabsBar = document.getElementById("boardTabs");
  if (!tabsBar) {
    tabsBar = document.createElement("div");
    tabsBar.id = "boardTabs";
    tabsBar.style.display = "flex";
    tabsBar.style.gap = "8px";
    tabsBar.style.margin = "12px 0";
    tabsBar.innerHTML = `
      <button id="tabWeekly" class="tab-btn" aria-pressed="true">This Week</button>
      <button id="tabHall" class="tab-btn" aria-pressed="false">Hall</button>
    `;
    // Insert just above the leaderboard list
    const boardEl = document.getElementById("leaderboard");
    if (boardEl) boardEl.before(tabsBar);
  }
  // Create Hall list holder
  let hallList = document.getElementById("hallBoard");
  if (!hallList) {
    hallList = document.createElement("ul");
    hallList.id = "hallBoard";
    hallList.style.display = "none";
    hallList.style.listStyle = "none";
    hallList.style.padding = "0";
    const boardEl = document.getElementById("leaderboard");
    if (boardEl) boardEl.after(hallList);
  }

  function setTabs(showHall) {
    const weeklyBtn = document.getElementById("tabWeekly");
    const hallBtn = document.getElementById("tabHall");
    const weeklyList = document.getElementById("leaderboard");

    if (showHall) {
      weeklyList.style.display = "none";
      hallList.style.display = "block";
      weeklyBtn.setAttribute("aria-pressed", "false");
      hallBtn.setAttribute("aria-pressed", "true");
      loadHall(); // ensure it's filled
    } else {
      weeklyList.style.display = "block";
      hallList.style.display = "none";
      weeklyBtn.setAttribute("aria-pressed", "true");
      hallBtn.setAttribute("aria-pressed", "false");
    }
  }

  tabsBar?.addEventListener("click", (e) => {
    if (e.target.id === "tabWeekly") setTabs(false);
    if (e.target.id === "tabHall") setTabs(true);
  });

  let username = localStorage.getItem("username");

  if (username) {
    usernameInput.value = username;
    finalizeLogin(username);
  }

  document.querySelector("button").addEventListener("click", () => {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    finalizeLogin(username);
  });

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

        // Pull Hall once early so we can show chips on weekly board
        fetchHall().finally(() => {
          loadMyPicks();
          loadLeaderboard();
        });
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
          punchSound.play();
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
          // Refresh Hall & board in case submissions affect later views
          fetchHall().finally(loadLeaderboard);
        } else {
          alert(data.error || "Something went wrong.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Picks";
        }
      });
  }

  submitBtn.addEventListener("click", submitPicks);

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

              const dogIcon = hasResult && matchWinner && isUnderdog
                ? `<span class="correct">🐶</span>`
                : "";
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

  function fetchHall() {
    if (hallByUser) return Promise.resolve(hallByUser);
    // GET /api/hall → code.gs doGet?action=getHall
    return fetch("/api/hall")
      .then(r => r.json())
      .then(rows => {
        hallByUser = {};
        (rows || []).forEach(r => {
          hallByUser[r.username] = {
            crowns: Number(r.crowns) || 0,
            crown_rate: Number(r.crown_rate) || 0,
            events_played: Number(r.events_played) || 0
          };
        });
        return hallByUser;
      })
      .catch(() => {
        hallByUser = {};
        return hallByUser;
      });
  }

  function hallChipFor(user) {
    if (!hallByUser || !hallByUser[user]) return "";
    const h = hallByUser[user];
    const pct = Math.round((h.crown_rate || 0) * 100);
    const crowns = h.crowns || 0;
    const ev = h.events_played || 0;
    // Compact, readable chip
    return `<span class="hall-chip"> • 👑 x${crowns} • ${pct}% • ${ev} events</span>`;
  }

  function loadLeaderboard() {
    Promise.all([
      fetch("/api/fights").then(r => r.json()),
      fetch("/api/leaderboard", { method: "POST" }).then(r => r.json()),
      fetchHall() // ensure hallByUser is ready for chips
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
        let displayName = user;
        let classes = [];

        if (leaderboardData.champs?.includes(user)) {
          classes.push("champ-glow");
          displayName = `<span class="crown">👑</span> ${displayName}`;
        }

        if (index === scores.length - 1) {
          classes.push("loser");
          displayName = `💩 ${displayName}`; // (visual only; no tracking)
        }

        if (user === username) {
          classes.push("current-user");
        }

        li.className = classes.join(" ");
        li.innerHTML = `<span>#${actualRank}</span> <span>${displayName}${hallChipFor(user)}</span><span>${score} pts</span>`;
        board.appendChild(li);

        prevScore = score;
        rank++;
      });

      // Glow all tied #1 entries (keep crowns as-is)
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

      if (
        leaderboardData.champMessage &&
        totalFights > 0 &&
        completedResults === totalFights
      ) {
        champBanner.textContent = `🏆 ${leaderboardData.champMessage}`;
        champBanner.style.display = "block";
      } else {
        champBanner.style.display = "none";
      }
    });
  }

  function loadHall() {
    fetchHall().then(() => {
      const rows = Object.entries(hallByUser)
        .map(([user, h]) => ({ user, ...h }))
        .sort((a, b) => {
          // mirror server sorting: crown_rate desc, crowns desc, events desc, name asc
          if (b.crown_rate !== a.crown_rate) return b.crown_rate - a.crown_rate;
          if (b.crowns !== a.crowns) return b.crowns - a.crowns;
          if (b.events_played !== a.events_played) return b.events_played - a.events_played;
          return (a.user || "").localeCompare(b.user || "");
        });

      hallList.innerHTML = "";
      let r = 1;
      rows.forEach(row => {
        const li = document.createElement("li");
        const pct = Math.round((row.crown_rate || 0) * 100);
        li.innerHTML = `<span>#${r}</span> <span>${row.user} • 👑 x${row.crowns} • ${pct}% • ${row.events_played} events</span>`;
        hallList.appendChild(li);
        r++;
      });
    });
  }
});
