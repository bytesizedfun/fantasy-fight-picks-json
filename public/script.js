let username = localStorage.getItem("username");

function lockUsername() {
  const input = document.getElementById("usernameInput");
  if (!input.value.trim()) {
    alert("Please enter your name.");
    return;
  }

  username = input.value.trim();
  localStorage.setItem("username", username);

  document.getElementById("usernamePrompt").style.display = "none";
  document.getElementById("welcome").textContent = `Welcome, ${username}!`;
  document.getElementById("welcome").style.display = "block";

  checkSubmissionStatus();
}

if (username) {
  document.getElementById("usernamePrompt").style.display = "none";
  document.getElementById("welcome").textContent = `Welcome, ${username}!`;
  document.getElementById("welcome").style.display = "block";

  checkSubmissionStatus();
}

function checkSubmissionStatus() {
  fetch(`/api/picks/${username}`)
    .then(res => res.json())
    .then(data => {
      if (data.submitted) {
        showMyPicks(data.picks);
        document.getElementById("fightList").style.display = "none";
        document.getElementById("submitBtn").style.display = "none";
      } else {
        loadFights();
        document.getElementById("fightList").style.display = "block";
        document.getElementById("submitBtn").style.display = "inline-block";
      }
      loadLeaderboard();
    });
}

function loadFights() {
  fetch("/api/fights")
    .then((res) => res.json())
    .then((fights) => {
      const container = document.getElementById("fightList");
      container.innerHTML = "";

      fights.forEach((fight, index) => {
        const div = document.createElement("div");
        div.classList.add("fight");
        div.innerHTML = `
          <h3>${fight.fighter1} vs ${fight.fighter2}</h3>
          <label>Pick a Winner:
            <select id="winner-${index}">
              <option value="${fight.fighter1}">${fight.fighter1}</option>
              <option value="${fight.fighter2}">${fight.fighter2}</option>
            </select>
          </label>
          <label>Method:
            <select id="method-${index}">
              ${fight.method_options
                .map((method) => `<option value="${method}">${method}</option>`)
                .join("")}
            </select>
          </label>
          <hr>
        `;
        container.appendChild(div);
      });
    });
}

function submitPicks() {
  fetch("/api/fights")
    .then((res) => res.json())
    .then((fights) => {
      const picks = {};

      fights.forEach((fight, index) => {
        const winner = document.getElementById(`winner-${index}`).value;
        const method = document.getElementById(`method-${index}`).value;
        picks[`${fight.fighter1} vs ${fight.fighter2}`] = {
          winner,
          method,
        };
      });

      fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, picks }),
      })
        .then((res) => res.json())
        .then(() => {
          alert("Picks submitted!");
          showMyPicks(picks);
          document.getElementById("fightList").style.display = "none";
          document.getElementById("submitBtn").style.display = "none";
          loadLeaderboard();
        });
    });
}

function showMyPicks(picks) {
  const container = document.getElementById("myPicks");
  container.innerHTML = "<h2>Your Picks</h2>";

  Object.entries(picks).forEach(([fight, pick]) => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${fight}</strong>: ${pick.winner} by ${pick.method}`;
    container.appendChild(div);
  });
}

function loadLeaderboard() {
  fetch("/api/leaderboard")
    .then((res) => res.json())
    .then((data) => {
      const board = document.getElementById("leaderboard");
      board.innerHTML = "";

      Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, score]) => {
          const li = document.createElement("li");
          li.textContent = `${name}: ${score} points`;
          board.appendChild(li);
        });
    });
}
