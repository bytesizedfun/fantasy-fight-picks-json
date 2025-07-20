document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const myPicksDiv = document.getElementById("myPicks");

  let username = "";

  window.lockUsername = () => {
    const input = usernameInput.value.trim();
    if (!input) {
      alert("Please enter your name.");
      return;
    }
    username = input;

    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.picks.length > 0) {
          displayPicksOnly(data.picks);
        } else {
          finalizeLogin();
        }
      });
  };

  function finalizeLogin() {
    usernamePrompt.style.display = "none";
    welcome.innerText = `Welcome, ${username}!`;
    welcome.style.display = "block";
    loadFights();
    loadLeaderboard();
  }

  function displayPicksOnly(picks) {
    usernamePrompt.style.display = "none";
    welcome.innerText = `Welcome back, ${username}!`;
    welcome.style.display = "block";

    fightList.style.display = "none";
    submitBtn.style.display = "none";

    myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
    picks.forEach(({ fight, winner, method, round }) => {
      const showRound = method !== "Decision" ? ` in Round ${round}` : "";
      myPicksDiv.innerHTML += `<p><strong>${fight}</strong>: ${winner} by ${method}${showRound}</p>`;
    });

    loadLeaderboard();
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
            <select name="${fight}-method" class="method">
              <option value="Decision">Decision</option>
              <option value="KO/TKO">KO/TKO</option>
              <option value="Submission">Submission</option>
            </select>
            <select name="${fight}-round" class="round">
              <option value="1">Round 1</option>
              <option value="2">Round 2</option>
              <option value="3">Round 3</option>
              <option value="4">Round 4</option>
              <option value="5">Round 5</option>
            </select>
          `;
          fightList.appendChild(div);
        });

        const fights = document.querySelectorAll(".fight");
        fights.forEach(fight => {
          const methodSelect = fight.querySelector(".method");
          const roundSelect = fight.querySelector(".round");

          methodSelect.addEventListener("change", () => {
            if (methodSelect.value === "Decision") {
              roundSelect.disabled = true;
              roundSelect.value = "3";
            } else {
              roundSelect.disabled = false;
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
      const round = fight.querySelector(`select[name="${fightName}-round"]`)?.value;

      if (winner && method && round) {
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
          displayPicksOnly(picks);
        } else {
          alert(data.error || "Something went wrong.");
        }
      });
  }

  submitBtn.addEventListener("click", submitPicks);

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
