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
            <input type="number" name="${fight}-round" min="1" max="5" placeholder="Round" />
          `;
          fightList.appendChild(div);

          // Disable round input if method is "Decision"
          const methodSelect = div.querySelector(`select[name="${fight}-method"]`);
          const roundInput = div.querySelector(`input[name="${fight}-round"]`);
          methodSelect.addEventListener("change", () => {
            roundInput.disabled = methodSelect.value === "Decision";
            if (roundInput.disabled) roundInput.value = "";
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
      const round = fight.querySelector(`input[name="${fightName}-round"]`)?.value || "";

      if (winner && method) {
        picks.push({ fight: fightName, winner, method, round });
      }
    });

    if (!username) {
      alert("Please enter your name first.");
      return;
    }

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

  function loadMyPicks() {
    if (!username) return;

    fetch("/api/picks", {
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
          const roundInfo = method === "Decision" ? "(Round N/A)" : `(Round ${round || "?"})`;
          myPicksDiv.innerHTML += `<p><strong>${fight}</strong>: ${winner} by ${method} ${roundInfo}</p>`;
        });
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

  submitBtn.addEventListener("click", submitPicks);
});
