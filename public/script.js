document.addEventListener("DOMContentLoaded", async () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const myPicks = document.getElementById("myPicks");
  const leaderboard = document.getElementById("leaderboard");
  const champBanner = document.getElementById("champBanner");
  const scoringRules = document.getElementById("scoringRules");

  let username = localStorage.getItem("username");
  let submitted = localStorage.getItem("submitted") === "true";
  let allFights = [];

  const showTip = (text) => {
    const tipBox = document.getElementById("tipDisplay");
    tipBox.textContent = text;
    tipBox.style.display = "block";
  };

  document.querySelectorAll(".clickable").forEach(el => {
    el.addEventListener("click", () => showTip(el.dataset.tip));
  });

  async function fetchChampionBanner() {
    try {
      const res = await fetch("/api/championBanner");
      const data = await res.json();
      if (data.success && data.message) {
        champBanner.innerHTML = `<marquee behavior="scroll" direction="left">${data.message}</marquee>`;
        champBanner.style.display = "block";
      }
    } catch (err) {
      console.error("Champion banner error:", err);
    }
  }

  async function fetchFights() {
    const res = await fetch("/api/fights");
    allFights = await res.json();
    renderFights();
  }

  function renderFights() {
    fightList.innerHTML = "";
    allFights.forEach(({ fight, fighter1, fighter2, underdog }) => {
      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <h3>${fight}</h3>
        <label>Winner:
          <select data-fight="${fight}" data-type="winner">
            <option value="">Pick Winner</option>
            <option value="${fighter1}">${fighter1}${underdog === "Fighter 1" ? " 🐶" : ""}</option>
            <option value="${fighter2}">${fighter2}${underdog === "Fighter 2" ? " 🐶" : ""}</option>
          </select>
        </label>
        <label>Method:
          <select data-fight="${fight}" data-type="method">
            <option value="">Pick Method</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
            <option value="Decision">Decision</option>
          </select>
        </label>
        <label>Round:
          <select data-fight="${fight}" data-type="round">
            <option value="">Pick Round</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
      `;
      fightList.appendChild(div);
    });
  }

  function lockUsername() {
    username = usernameInput.value.trim();
    if (username) {
      localStorage.setItem("username", username);
      location.reload();
    }
  }

  async function fetchLeaderboard() {
    const res = await fetch("/api/leaderboard", { method: "POST" });
    const data = await res.json();
    const entries = Object.entries(data.scores || {}).sort((a, b) => b[1] - a[1]);

    const ranks = {};
    let currentRank = 1;
    let lastScore = null;
    let displayedRank = 0;

    leaderboard.innerHTML = "";

    entries.forEach(([user, score], index) => {
      if (score !== lastScore) {
        displayedRank = currentRank;
      }
      ranks[user] = displayedRank;
      lastScore = score;
      currentRank++;

      const li = document.createElement("li");
      li.innerHTML = `<span class="rank">#${ranks[user]}</span> ${user} - ${score} pts`;

      if (data.champs && data.champs.includes(user)) {
        li.classList.add("champion");
        li.innerHTML = `<span class="crown">👑</span> ${li.innerHTML}`;
      }

      if (user === username) {
        li.classList.add("current-user");
      }

      leaderboard.appendChild(li);
    });

    if (entries.length > 0) {
      const lowestScore = entries[entries.length - 1][1];
      entries.forEach(([user, score]) => {
        if (score === lowestScore) {
          const loser = leaderboard.querySelector(`li:contains('${user}')`);
          if (loser) loser.innerHTML += " 💩";
        }
      });
    }
  }

  async function fetchUserPicks() {
    if (!username) return;
    const res = await fetch("/api/picks", {
      method: "POST",
      body: JSON.stringify({ username }),
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();

    if (data.success && data.picks.length > 0) {
      submitted = true;
      localStorage.setItem("submitted", "true");
      renderSubmittedPicks(data.picks);
    } else {
      submitted = false;
      localStorage.setItem("submitted", "false");
    }
  }

  function renderSubmittedPicks(picks) {
    myPicks.innerHTML = "<h3>Your Picks</h3>";
    picks.forEach(({ fight, winner, method, round }) => {
      const div = document.createElement("div");
      div.className = "pick";
      div.innerHTML = `
        <strong>${fight}</strong><br>
        🥊 Winner: <span>${winner}</span><br>
        🧠 Method: <span>${method}</span><br>
        ⏱️ Round: <span>${round}</span>
      `;
      myPicks.appendChild(div);
    });
  }

  async function submitPicks() {
    const picks = [];
    allFights.forEach(({ fight }) => {
      const winner = document.querySelector(`[data-fight="${fight}"][data-type="winner"]`).value;
      const method = document.querySelector(`[data-fight="${fight}"][data-type="method"]`).value;
      const round = document.querySelector(`[data-fight="${fight}"][data-type="round"]`).value;
      if (winner && method) {
        picks.push({ fight, winner, method, round });
      }
    });

    if (picks.length === 0) {
      alert("Please make at least one pick.");
      return;
    }

    const res = await fetch("/api/submit", {
      method: "POST",
      body: JSON.stringify({ username, picks }),
      headers: { "Content-Type": "application/json" }
    });

    const result = await res.json();
    if (result.success) {
      localStorage.setItem("submitted", "true");
      alert("Picks submitted!");
      location.reload();
    } else {
      alert(result.error || "Error submitting picks.");
    }
  }

  // Init
  if (username) {
    usernamePrompt.style.display = "none";
    welcome.textContent = `🎤 IT'S TIME ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    scoringRules.style.display = "block";

    await fetchChampionBanner();
    await fetchFights();
    await fetchUserPicks();
    await fetchLeaderboard();

    if (!submitted) {
      fightList.style.display = "block";
      submitBtn.style.display = "block";
    }
  } else {
    usernamePrompt.style.display = "block";
  }

  window.lockUsername = lockUsername;
  window.submitPicks = submitPicks;
});
