document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  let username = localStorage.getItem("username");

  if (username) {
    finalizeLogin(username);
  }

  document.querySelector("button").addEventListener("click", () => {
    const input = document.getElementById("usernameInput").value.trim();
    if (!input) return alert("Please enter your name.");
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
        fightList.innerHTML = ""; // 🧼 Always reset fight list

        data.forEach(({ fight, fighter1, fighter2 }) => {
          const div = document.createElement("div");
          div.className = "fight";
          const fightId = fight.replace(/\s+/g, "-");
          div.innerHTML = `
            <h3>${fight}</h3>
            <label><input type="radio" name="${fight}-winner" value="${fighter1}">${fighter1}</label>
            <label><input type="radio" name="${fight}-winner" value="${fighter2}">${fighter2}</label>
            <select name="${fight}-method" class="method">
              <option value="Decision">Decision</option>
              <option value="KO/TKO">KO/TKO</option>
              <option value="Submission">Submission</option>
            </select>
            <select name="${fight}-round" class="round">
              <option value="">Round</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          `;
          fightList.appendChild(div);

          const methodSelect = div.querySelector(`select[name="${fight}-method"]`);
          const roundSelect = div.querySelector(`select[name="${fight}-round"]`);

          methodSelect.addEventListener("change", () => {
            if (methodSelect.value === "Decision") {
              roundSelect.setAttribute("disabled", "disabled");
              roundSelect.value = "";
            } else {
              roundSelect.removeAttribute("disabled");
            }
          });
        });

        fightList.style.display = "block";
        submitBtn.style.display = "block";
      });
  }

  function submitPicks() {
    const picks = [];
    const fights = document.querySelectorAll(".fight");
    fights.forEach(fight => {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
      const round = fight.querySelector(`select[name="${fightName}-round"]`)?.value || "";
      if (winner && method) {
        picks.push({ fight: fightName, winner, method, round });
      }
    });

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert("Picks submitted!");
          loadMyPicks();
          fightList.innerHTML = "";
          submitBtn.style.display = "none";
        } else {
          alert(data.error || "Something went wrong.");
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
        myPicksDiv.innerHTML = ""; // Reset display every time

        if (!data.success || !data.picks) return;

        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
        data.picks.forEach(({ fight, winner, method, round }) => {
          const roundText = method === "Decision" ? "(Decision - no round)" : `Round ${round}`;
          myPicksDiv.innerHTML += `<p><strong>${fight}</strong>: ${winner} by ${method} ${roundText}</p>`;
        });

        // Optionally hide pick form if already submitted
        fightList.style.display = "none";
        submitBtn.style.display = "none";
      });
  }

  function loadLeaderboard() {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(data => {
        const board = document.getElementById("leaderboard");
        board.innerHTML = "";
        Object.entries(data.scores).forEach(([user, score]) => {
          board.innerHTML += `<li>${user}: ${score} pts</li>`;
        });
        if (data.champ) {
          board.innerHTML += `<li><strong>🏆 Champion of the Week: ${data.champ}</strong></li>`;
        }
      });
  }
});
