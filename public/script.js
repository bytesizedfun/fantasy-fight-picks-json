document.addEventListener("DOMContentLoaded", async () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const leaderboard = document.getElementById("leaderboard");
  const myPicks = document.getElementById("myPicks");
  const champBanner = document.getElementById("champBanner");
  const tipDisplay = document.getElementById("tipDisplay");
  const scoringRules = document.getElementById("scoringRules");

  let username = localStorage.getItem("username");
  let fights = [];

  const tooltips = {
    "Winner": "+1 for choosing the winner",
    "Method": "+1 for correct method if winner is also correct",
    "Round": "+1 for correct round if Winner & Method are correct, and the fight did NOT go to Decision",
    "Underdog": "+2 bonus for underdog win"
  };

  document.querySelectorAll(".clickable").forEach(el => {
    el.addEventListener("click", () => {
      tipDisplay.innerText = el.dataset.tip || "";
      tipDisplay.style.display = "block";
    });
  });

  if (username) {
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IT'S TIME, ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    scoringRules.style.display = "block";
    loadFights();
    loadPicks();
    loadLeaderboard();
    loadChampionBanner();
  }

  window.lockUsername = () => {
    const input = usernameInput.value.trim();
    if (!input) return;
    username = input;
    localStorage.setItem("username", username);
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IT'S TIME, ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    scoringRules.style.display = "block";
    loadFights();
    loadPicks();
    loadLeaderboard();
    loadChampionBanner();
  };

  async function loadFights() {
    const res = await fetch("/api/fights");
    fights = await res.json();

    fightList.innerHTML = "";
    fights.forEach(fight => {
      const div = document.createElement("div");
      div.className = "fight-pick";

      const underdog = fight.underdog === "Fighter 1" ? fight.fighter1 : fight.underdog === "Fighter 2" ? fight.fighter2 : "";
      const isUnderdog = fighter => fighter === underdog ? " 🐶" : "";

      div.innerHTML = `
        <h3>${fight.fight}</h3>
        <select class="winner">
          <option value="">Pick Winner</option>
          <option value="${fight.fighter1}">${fight.fighter1}${isUnderdog(fight.fighter1)}</option>
          <option value="${fight.fighter2}">${fight.fighter2}${isUnderdog(fight.fighter2)}</option>
        </select>
        <select class="method">
          <option value="">Pick Method</option>
          <option value="KO/TKO">KO/TKO</option>
          <option value="Submission">Submission</option>
          <option value="Decision">Decision</option>
        </select>
        <select class="round">
          <option value="">Pick Round</option>
          <option value="1">1️⃣</option>
          <option value="2">2️⃣</option>
          <option value="3">3️⃣</option>
          <option value="4">4️⃣</option>
          <option value="5">5️⃣</option>
        </select>
      `;

      fightList.appendChild(div);
    });

    submitBtn.style.display = "block";
  }

  window.submitPicks = async () => {
    const picks = [];
    const pickDivs = document.querySelectorAll(".fight-pick");
    pickDivs.forEach((div, i) => {
      const winner = div.querySelector(".winner").value;
      const method = div.querySelector(".method").value;
      const round = div.querySelector(".round").value;
      if (winner && method) {
        picks.push({
          fight: fights[i].fight,
          winner,
          method,
          round
        });
      }
    });

    if (picks.length !== fights.length) {
      alert("Please complete all picks!");
      return;
    }

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks })
    });

    const data = await res.json();
    if (data.success) {
      alert("Picks submitted!");
      location.reload();
    } else {
      alert(data.error || "Error submitting picks.");
    }
  };

  async function loadPicks() {
    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const data = await res.json();
    if (!data.success) return;

    const res2 = await fetch("/api/leaderboard");
    const results = await res2.json();

    myPicks.innerHTML = "<h3>Your Picks</h3>";
    data.picks.forEach(pick => {
      const fight = pick.fight;
      const result = results.fightResults?.[fight];
      const points = result ? getPoints(pick, result) : 0;
      const winColor = pick.winner === result?.winner ? "green" : "red";
      const methodColor = pick.method === result?.method ? "green" : "red";
      const roundColor = pick.round === result?.round ? "green" : "red";

      const dogEmoji = result?.underdog === "Y" && pick.winner === result?.winner ? " 🐶" : "";

      myPicks.innerHTML += `
        <div class="pick-result">
          <strong>${fight}</strong><br>
          <span style="color:${winColor}">Winner: ${pick.winner}${dogEmoji}</span> |
          <span style="color:${methodColor}">Method: ${pick.method}</span> |
          <span style="color:${roundColor}">Round: ${pick.round}</span>
          <span style="color:gold">(+${points})</span>
        </div>
      `;
    });
  }

  function getPoints(pick, result) {
    let pts = 0;
    const isCorrectWinner = pick.winner === result.winner;
    const isCorrectMethod = pick.method === result.method;
    const isCorrectRound = pick.round === result.round;
    const isUnderdog = result.underdog === "Y" && isCorrectWinner;

    if (isCorrectWinner) {
      pts += 1;
      if (isCorrectMethod) {
        pts += 1;
        if (result.method !== "Decision" && isCorrectRound) {
          pts += 1;
        }
      }
      if (isUnderdog) {
        pts += 2;
      }
    }
    return pts;
  }

  async function loadLeaderboard() {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    if (!data || !data.scores) return;

    const entries = Object.entries(data.scores).sort((a, b) => b[1] - a[1]);
    leaderboard.innerHTML = "";

    let rank = 1;
    let prevScore = null;
    let actualRank = 0;
    const crownHolders = new Set(data.champs || []);

    entries.forEach(([user, score], i) => {
      if (score !== prevScore) actualRank = rank;
      prevScore = score;
      rank++;

      const crown = crownHolders.has(user) ? " 👑" : "";
      const poop = i === entries.length - 1 ? " 💩" : "";
      const highlight = user === username ? "font-weight:bold;" : "";
      const glow = crown ? "text-shadow: 0 0 6px gold;" : "";

      leaderboard.innerHTML += `<li style="${highlight} ${glow}">${actualRank}. ${user}${crown}${poop} — ${score} pts</li>`;
    });
  }

  async function loadChampionBanner() {
    try {
      const res = await fetch("/api/champions");
      const data = await res.json();
      if (data?.length) {
        const latestDate = data[data.length - 1]?.date;
        const latest = data.filter(d => d.date === latestDate);
        const names = latest.map(c => c.username).join(", ");
        champBanner.innerHTML = `🏆 Champion${latest.length > 1 ? "s" : ""} of the Week: ${names}`;
        champBanner.style.display = "block";
      }
    } catch (err) {
      console.error("Failed to load champ banner:", err);
    }
  }
});
