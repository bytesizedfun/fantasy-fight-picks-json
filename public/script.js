let username = localStorage.getItem("username");

function lockUsername() {
  const input = document.getElementById("usernameInput").value.trim();
  if (input) {
    username = input;
    localStorage.setItem("username", username);
    document.getElementById("usernamePrompt").style.display = "none";
    loadFights();
  }
}

function loadFights() {
  fetch("/api/fights")
    .then((res) => res.json())
    .then((fights) => {
      const container = document.getElementById("fightList");
      container.innerHTML = "";
      fights.forEach((fight, i) => {
        container.innerHTML += `
          <div>
            <strong>${fight.fighter1}</strong> vs <strong>${fight.fighter2}</strong><br />
            Pick: 
            <select id="fight-${i}-winner">
              <option value="${fight.fighter1}">${fight.fighter1}</option>
              <option value="${fight.fighter2}">${fight.fighter2}</option>
            </select>
            Method:
            <select id="fight-${i}-method">
              ${fight.method_options.map((m) => `<option value="${m}">${m}</option>`).join("")}
            </select>
          </div><hr />
        `;
      });
      container.style.display = "block";
      document.getElementById("submitBtn").style.display = "block";
    });
}

function submitPicks() {
  const picks = {};
  fetch("/api/fights")
    .then((res) => res.json())
    .then((fights) => {
      fights.forEach((fight, i) => {
        picks[i] = {
          winner: document.getElementById(`fight-${i}-winner`).value,
          method: document.getElementById(`fight-${i}-method`).value,
        };
      });
      fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, picks }),
      }).then(() => {
        alert("Picks submitted!");
        loadLeaderboard();
      });
    });
}

function loadLeaderboard() {
  fetch("/api/leaderboard")
    .then((res) => res.json())
    .then((data) => {
      const board = document.getElementById("leaderboard");
      board.innerHTML = "";
      Object.entries(data).forEach(([user, score]) => {
        board.innerHTML += `<li>${user}: ${score}</li>`;
      });
    });
}

if (username) {
  document.getElementById("usernamePrompt").style.display = "none";
  loadFights();
  loadLeaderboard();
}
