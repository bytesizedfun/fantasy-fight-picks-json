document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const punchSound = document.getElementById("punchSound");
  const submitNote = document.getElementById("submitNote");
  const yourPicks = document.getElementById("yourPicks");
  const userPicksList = document.getElementById("userPicksList");
  const leaderboard = document.getElementById("leaderboard");
  const leaderboardList = document.getElementById("leaderboardList");
  const championDiv = document.getElementById("champion");
  const countdown = document.getElementById("countdown");

  let username = localStorage.getItem("username") || "";

  function updateCountdown() {
    const eventTime = new Date("2025-07-26T15:00:00-04:00").getTime();
    const now = new Date().getTime();
    const distance = eventTime - now;

    if (distance <= 0) {
      countdown.textContent = "🔒 Picks are now locked.";
      return;
    }

    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    countdown.textContent = `⏳ Picks lock in: ${hours}h ${minutes}m ${seconds}s`;

    setTimeout(updateCountdown, 1000);
  }

  updateCountdown();

  if (username) {
    finalizeLogin(username);
  }

  document.querySelector("button").addEventListener("click", () => {
    const input = usernameInput.value.trim();
    if (!input) {
      alert("Please enter your name.");
      return;
    }
    username = input;
    localStorage.setItem("username", username);
    finalizeLogin(username);
  });

  function finalizeLogin(name) {
    usernamePrompt.style.display = "none";
    welcome.innerHTML = `🎤 IIIIIIIIIIIIT'S ${name.toUpperCase()}!`;
    fetchFights();
    fetchUserPicks();
    fetchLeaderboard();
    checkLockout();
  }

  function fetchFights() {
    fetch("/api/fights")
      .then(res => res.json())
      .then(data => {
        data.forEach(f => {
          const container = document.createElement("div");
          container.className = "fight";

          const title = document.createElement("h3");
          title.textContent = f.fight;
          container.appendChild(title);

          const fighterSelect = document.createElement("select");
          fighterSelect.innerHTML = `
            <option value="">Pick winner</option>
            <option value="${f.fighter1}">${f.fighter1}</option>
            <option value="${f.fighter2}">${f.fighter2}</option>
          `;
          container.appendChild(fighterSelect);

          const methodSelect = document.createElement("select");
          methodSelect.innerHTML = `
            <option value="">Pick method</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
            <option value="Decision">Decision</option>
          `;
          container.appendChild(methodSelect);

          const roundSelect = document.createElement("select");
          roundSelect.innerHTML = `
            <option value="">Pick round</option>
            <option value="1">Round 1</option>
            <option value="2">Round 2</option>
            <option value="3">Round 3</option>
            <option value="4">Round 4</option>
            <option value="5">Round 5</option>
          `;
          container.appendChild(roundSelect);

          methodSelect.addEventListener("change", () => {
            roundSelect.disabled = methodSelect.value === "Decision";
          });

          fightList.appendChild(container);
        });

        submitBtn.style.display = "block";
      });
  }

  function fetchUserPicks() {
    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.picks.length) return;

        fightList.style.display = "none";
        submitBtn.style.display = "none";
        yourPicks.style.display = "block";

        data.picks.forEach(p => {
          const div = document.createElement("div");
          div.innerHTML = `<div class="fight-name">${p.fight}</div><div class="user-pick">✅ ${p.winner} | ${p.method} | ${p.round}</div>`;
          userPicksList.appendChild(div);
        });
      });
  }

  function fetchLeaderboard() {
    fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
      .then(res => res.json())
      .then(data => {
        leaderboard.style.display = "block";
        leaderboardList.innerHTML = "";

        const champs = data.champs || [];

        (data.leaderboard || Object.entries(data.scores).map(([username, score]) => ({ username, score })))
          .sort((a, b) => b.score - a.score)
          .forEach(entry => {
            const li = document.createElement("li");
            const isChamp = champs.includes(entry.username);
            li.innerHTML = `${isChamp ? "👑 " : ""}${entry.username}: ${entry.score} pts`;
            leaderboardList.appendChild(li);
          });

        if (data.champMessage) {
          championDiv.style.display = "block";
          championDiv.textContent = data.champMessage;
        }
      });
  }

  function checkLockout() {
    fetch("/api/lockout")
      .then(res => res.json())
      .then(data => {
        if (data.locked) {
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          submitNote.textContent = "🔒 Picks are now locked.";
        } else {
          submitBtn.addEventListener("click", submitPicks);
        }
      });
  }

  function submitPicks() {
    const fightDivs = document.querySelectorAll(".fight");
    const picks = [];

    for (let div of fightDivs) {
      const [fightEl, fighterSelect, methodSelect, roundSelect] = div.children;
      const fight = fightEl.textContent;
      const winner = fighterSelect.value;
      const method = methodSelect.value;
      const round = roundSelect.value;

      if (!winner || !method || (method !== "Decision" && !round)) {
        alert("Make sure all picks are filled out.");
        return;
      }

      picks.push({ fight, winner, method, round });
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
          location.reload();
        } else {
          alert(data.error || "Error submitting picks.");
        }
      });
  }
});
