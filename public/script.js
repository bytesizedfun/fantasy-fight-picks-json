document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const submitNotice = document.getElementById("submitNotice");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");

  let username = localStorage.getItem("username") || "";

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
    welcome.innerText = `Welcome, ${name}!`;
    welcome.style.display = "block";
    fightList.style.display = "block";
    submitBtn.style.display = "block";
    submitNotice.style.display = "block";
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
            <label>Method:
              <select name="${fight}-method">
                <option value="">Select</option>
                <option value="KO/TKO">KO/TKO</option>
                <option value="Submission">Submission</option>
                <option value="Decision">Decision</option>
              </select>
            </label>
            <label>Round:
              <select name="${fight}-round">
                <option value="">Select</option>
                <option value="1">Round 1</option>
                <option value="2">Round 2</option>
                <option value="3">Round 3</option>
              </select>
            </label>
          `;
          fightList.appendChild(div);

          const methodSelect = div.querySelector(`select[name="${fight}-method"]`);
          const roundSelect = div.querySelector(`select[name="${fight}-round"]`);

          methodSelect.addEventListener("change", () => {
            if (methodSelect.value === "Decision") {
              roundSelect.disabled = true;
              roundSelect.value = "";
            } else {
              roundSelect.disabled = false;
            }
          });
        });
      });
  }

  function submitPicks() {
    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (let fightDiv of fights) {
      const fight = fightDiv.querySelector("h3").innerText;
      const winner = fightDiv.querySelector(`input[name="${fight}-winner"]:checked`);
      const method = fightDiv.querySelector(`select[name="${fight}-method"]`);
      const round = fightDiv.querySelector(`select[name="${fight}-round"]`);

      if (!winner || !method.value || (method.value !== "Decision" && !round.value)) {
        alert("Please complete all picks before submitting.");
        return;
      }

      picks.push({
        fight,
        winner: winner.value,
        method: method.value,
        round: method.value === "Decision" ? "N/A" : round.value
      });
    }

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const punchSound = document.getElementById("punchSound");
          if (punchSound) punchSound.play();
          alert("Picks submitted!");
          loadMyPicks();
          loadLeaderboard();
        } else {
          alert(data.error || "Failed to submit picks.");
        }
      });
  }

  function loadLeaderboard() {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(data => {
        const leaderboard = document.getElementById("leaderboard");
        leaderboard.innerHTML = "";
        data.forEach(entry => {
          const li = document.createElement("li");
          li.textContent = `${entry.username}: ${entry.points} pts`;
          leaderboard.appendChild(li);
        });
      });
  }

  function loadMyPicks() {
    fetch("/api/picks")
      .then(res => res.json())
      .then(data => {
        const picks = data[username];
        const myPicks = document.getElementById("myPicks");
        myPicks.innerHTML = "";

        if (!picks || picks.length === 0) {
          myPicks.innerHTML = "<p>You haven't submitted picks yet.</p>";
          return;
        }

        myPicks.innerHTML = "<h3>Your Picks:</h3>";
        picks.forEach(({ fight, winner, method, round }) => {
          const roundText = method === "Decision" ? "" : ` in Round ${round}`;
          myPicks.innerHTML += `
            <p>
              <span class="fight-name">${fight}:</span>
              <span class="user-pick">${winner} by ${method}${roundText}</span>
            </p>
          `;
        });
      });
  }

  window.submitPicks = submitPicks;
});
