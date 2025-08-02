document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const leaderboard = document.getElementById("leaderboard");
  const champBanner = document.getElementById("champBanner");
  const myPicks = document.getElementById("myPicks");
  const scoringRules = document.getElementById("scoringRules");
  const tipDisplay = document.getElementById("tipDisplay");

  let username = localStorage.getItem("username");
  if (username) {
    usernamePrompt.style.display = "none";
    welcome.textContent = `🎤 IT’S TIME, ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    init();
  }

  document.querySelectorAll(".clickable").forEach(el => {
    el.addEventListener("click", () => {
      tipDisplay.textContent = el.dataset.tip;
      tipDisplay.style.display = "block";
    });
  });

  async function init() {
    showChampionBanner();
    await loadFights();
    await loadLeaderboard();
    await loadMyPicks();
  }

  window.lockUsername = () => {
    const input = usernameInput.value.trim();
    if (!input) return;
    username = input;
    localStorage.setItem("username", username);
    usernamePrompt.style.display = "none";
    welcome.textContent = `🎤 IT’S TIME, ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    init();
  };

  async function showChampionBanner() {
    try {
      const res = await fetch("/api?action=getChampionBanner");
      const data = await res.json();
      if (data.message) {
        champBanner.innerHTML = `<marquee>${data.message}</marquee>`;
        champBanner.style.display = "block";
      }
    } catch (e) {
      console.error("Error fetching champ banner", e);
    }
  }

  async function loadFights() {
    const res = await fetch("/api?action=getFights");
    const fights = await res.json();
    const picksRes = await fetch("/api", {
      method: "POST",
      body: JSON.stringify({ action: "getUserPicks", username }),
    });
    const picksData = await picksRes.json();
    const submitted = picksData.success && picksData.picks.length > 0;

    if (!submitted) {
      localStorage.removeItem("submitted");
    }

    if (!submitted && !localStorage.getItem("submitted")) {
      scoringRules.style.display = "block";
      fightList.innerHTML = fights.map((f, i) => `
        <div class="fight-pick">
          <div class="fight-title">🧠 ${f.fight}</div>
          <select data-fight="${f.fight}" class="pick-winner">
            <option value="">-- Pick Winner --</option>
            <option value="${f.fighter1}">${f.fighter1}${f.underdog === 'Fighter 1' ? ' 🐶' : ''}</option>
            <option value="${f.fighter2}">${f.fighter2}${f.underdog === 'Fighter 2' ? ' 🐶' : ''}</option>
          </select>
          <select data-fight="${f.fight}" class="pick-method">
            <option value="">-- Method --</option>
            <option>KO/TKO</option>
            <option>Submission</option>
            <option>Decision</option>
          </select>
          <select data-fight="${f.fight}" class="pick-round">
            <option value="">-- Round --</option>
            <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>
          </select>
        </div>
      `).join("");
      fightList.style.display = "block";
      submitBtn.style.display = "block";
    }
  }

  window.submitPicks = async () => {
    const fightDivs = document.querySelectorAll(".fight-pick");
    const picks = [];
    for (let div of fightDivs) {
      const fight = div.querySelector(".pick-winner").dataset.fight;
      const winner = div.querySelector(".pick-winner").value;
      const method = div.querySelector(".pick-method").value;
      const round = div.querySelector(".pick-round").value;
      if (!winner || !method) return alert("Please complete all picks.");
      picks.push({ fight, winner, method, round });
    }

    const res = await fetch("/api", {
      method: "POST",
      body: JSON.stringify({ action: "submitPicks", username, picks }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem("submitted", "true");
      alert("Picks submitted!");
      location.reload();
    } else {
      alert("Submission failed: " + (data.error || "Unknown error"));
    }
  };

  async function loadLeaderboard() {
    const res = await fetch("/api", {
      method: "POST",
      body: JSON.stringify({ action: "getLeaderboard" }),
    });
    const data = await res.json();
    const scores = data.scores || {};
    const champs = data.champs || [];
    const entries = Object.entries(scores);
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);

    // Calculate ranks (with ties)
    let rank = 1;
    let lastScore = null;
    let displayRank = 1;
    const ranks = {};
    for (let [i, [user, score]] of sorted.entries()) {
      if (score !== lastScore) displayRank = rank;
      ranks[user] = displayRank;
      lastScore = score;
      rank++;
    }

    leaderboard.innerHTML = sorted.map(([user, score], idx) => {
      const isChamp = champs.includes(user);
      const isCurrent = user === username;
      const isLast = idx === sorted.length - 1;
      const rankNum = ranks[user];
      return `
        <li class="${isCurrent ? "current-user" : ""}">
          ${isChamp ? '👑' : ''} <strong>${rankNum}.</strong> 
          <span class="${isChamp ? 'champion-glow' : ''}">
            ${user} ${isLast ? '💩' : ''}
          </span> - ${score}
        </li>
      `;
    }).join("");
  }

  async function loadMyPicks() {
    const res = await fetch("/api", {
      method: "POST",
      body: JSON.stringify({ action: "getUserPicks", username }),
    });
    const picksData = await res.json();
    if (!picksData.success || picksData.picks.length === 0) return;

    const leaderboardRes = await fetch("/api", {
      method: "POST",
      body: JSON.stringify({ action: "getLeaderboard" }),
    });
    const leaderboardData = await leaderboardRes.json();
    const fightResults = leaderboardData.fightResults || {};

    myPicks.innerHTML = `<h3>Your Picks</h3>` + picksData.picks.map(p => {
      const result = fightResults[p.fight];
      if (!result) {
        return `<div class="pick-line"><strong>${p.fight}:</strong> ${p.winner} (${p.method}, R${p.round})</div>`;
      }

      let points = 0;
      const winnerCorrect = p.winner === result.winner;
      const methodCorrect = p.method === result.method;
      const roundCorrect = p.round == result.round && result.method !== "Decision";
      const underdogWin = result.underdog === "Y";

      if (winnerCorrect) {
        points += 1;
        if (methodCorrect) {
          points += 1;
          if (roundCorrect) points += 1;
        }
        if (underdogWin) points += 2;
      }

      const parts = [];
      parts.push(winnerCorrect ? `<span class="correct">${p.winner}</span>` : `<span class="wrong">${p.winner}</span>`);
      parts.push(methodCorrect ? `<span class="correct">${p.method}</span>` : `<span class="wrong">${p.method}</span>`);
      if (p.method !== "Decision") {
        parts.push(roundCorrect ? `<span class="correct">R${p.round}</span>` : `<span class="wrong">R${p.round}</span>`);
      }

      return `<div class="pick-line"><strong>${p.fight}:</strong> ${parts.join(" ")} <span class="points">+${points}</span></div>`;
    }).join("");
  }
});
