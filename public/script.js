document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");

  let username = "";

  document.querySelector("button").addEventListener("click", () => {
    const input = usernameInput.value.trim();
    if (!input) {
      alert("Please enter your name.");
      return;
    }
    username = input;
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
            if (methodSelect.value === "Decision") {
              roundSelect.disabled = true;
              roundSelect.value = "";
            } else {
              roundSelect.disabled = false;
              roundSelect.value = "1";
            }
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
    const picks = [];
    document.querySelectorAll(".fight").forEach(fight => {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
      const roundDropdown = fight.querySelector(`select[name="${fightName}-round"]`);
      const round = roundDropdown && !roundDropdown.disabled ? roundDropdown.value : "";

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
          fightList.innerHTML = "";
          submitBtn.style.display = "none";
          loadMyPicks();
        } else {
          alert(data.error || "Failed to submit picks.");
        }
      });
  }

  function loadMyPicks() {
    fetch("/api/getUserPicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.picks) return;
        const myPicksDiv = document.getElementById("myPicks");
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
        data.picks.forEach(({ fight, winner, method, round }) => {
          const roundText = method === "Decision" ? "(Decision)" : `in Round ${round}`;
          myPicksDiv.innerHTML += `<p><strong>${fight}</strong>: ${winner} by ${method} ${roundText}</p>`;
        });
      });
  }

  function loadLeaderboard() {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(data => {
        const board = document.getElementById("leaderboard");
        board.innerHTML = "<h3>🏆 Leaderboard</h3>";
        Object.entries(data.scores).forEach(([user, score]) => {
          board.innerHTML += `<li>${user}: ${score} pts</li>`;
        });
        if (data.champ) {
          board.innerHTML += `<li><strong>Champion of the Week: ${data.champ}</strong></li>`;
        }
      });
  }

  submitBtn.addEventListener("click", submitPicks);
});
