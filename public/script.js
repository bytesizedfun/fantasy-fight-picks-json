document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const myPicks = document.getElementById("myPicks");

  let username = localStorage.getItem("username");

  // Hide "Leaderboard" h2 label (2nd h2 on the page)
  document.querySelectorAll("h2")[1].style.display = "none";

  // Add countdown timer
  const countdownEl = document.createElement("div");
  countdownEl.id = "countdown";
  countdownEl.style.textAlign = "center";
  countdownEl.style.marginTop = "10px";
  countdownEl.style.fontSize = "1rem";
  countdownEl.style.color = "#FFD700";
  document.getElementById("app").insertBefore(countdownEl, fightList);

  const eventTime = new Date("2025-07-26T15:00:00"); // 3PM EST
  setInterval(() => {
    const now = new Date();
    const diff = eventTime - now;
    if (diff <= 0) {
      countdownEl.innerText = "🚨 Event has started!";
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    countdownEl.innerText = `⏳ Countdown: ${days}d ${hours}h ${minutes}m ${seconds}s`;
  }, 1000);

  if (username) {
    finalizeLogin(username);
  }

  document.querySelector("button").addEventListener("click", () => {
    const input = document.getElementById("usernameInput").value.trim();
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
    welcome.innerText = `Welcome, ${name}!`;
    welcome.style.display = "block";
    loadFights();
    loadLeaderboard();
    loadMyPicks();
  }

  function loadFights() {
    fetch("/api/fights")
      .then(res => res.json())
      .then(data => {
        fightList.innerHTML = "";
        data.forEach(({ fight, fighter1, fighter2 }) => {
          const div = document.createElement("div");
          div.className = "fight";
          div.innerHTML = `
            <h3>${fight}</h3>
            <label><input type="radio" name="${fight}-winner" value="${fighter1}">${fighter1}</label>
            <label><input type="radio" name="${fight}-winner" value="${fighter2}">${fighter2}</label>
            <select name="${fight}-method">
              <option value="">Method</option>
              <option value="KO/TKO">KO/TKO</option>
              <option value="Submission">Submission</option>
              <option value="Decision">Decision</option>
            </select>
            <select name="${fight}-round">
              <option value="">Round</option>
              <option value="1">Round 1</option>
              <option value="2">Round 2</option>
              <option value="3">Round 3</option>
              <option value="4">Round 4</option>
              <option value="5">Round 5</option>
            </select>
          `;
          fightList.appendChild(div);
        });
        fightList.style.display = "block";
        submitBtn.style.display = "block";
      });
  }

  window.submitPicks = () => {
    const picks = [];
    const fights = document.querySelectorAll(".fight");
    for (let fight of fights) {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`);
      const method = fight.querySelector(`select[name="${fightName}-method"]`).value;
      const round = fight.querySelector(`select[name="${fightName}-round"]`).value;

      if (!winner || !method || !round) {
        alert("Please complete all picks before submitting.");
        return;
      }

      picks.push({
        fight: fightName,
        winner: winner.value,
        method,
        round
      });
    }

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
        } else {
          alert("Picks submitted!");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
        }
      });
  };

  function loadMyPicks() {
    fetch("/api/getUserPicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(picks => {
        myPicks.innerHTML = "<h3>Your Picks:</h3>";
        picks.forEach(p => {
          const pEl = document.createElement("p");
          pEl.textContent = `${p.fight}: ${p.winner} by ${p.method} in Round ${p.round}`;
          myPicks.appendChild(pEl);
        });
      });
  }

  function loadLeaderboard() {
    fetch("/api/getLeaderboard")
      .then(res => res.json())
      .then(scores => {
        const leaderboard = document.getElementById("leaderboard");
        leaderboard.innerHTML = "";
        scores.forEach(entry => {
          const li = document.createElement("li");
          li.textContent = `${entry.username}: ${entry.score} pts`;
          leaderboard.appendChild(li);
        });
      });
  }
});
