document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const punchSound = new Audio("punch.mp3");
  const submitNote = document.getElementById("submitNote");

  punchSound.volume = 1.0;

  let username = localStorage.getItem("username") || "";

  if (username) {
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    document.getElementById("scoringRules").style.display = "block";
    fetchFights();
    fetchLeaderboard();
    fetchUserPicks();
  }

  document.querySelector("button").addEventListener("click", () => {
    const input = usernameInput.value.trim();
    if (!input) {
      alert("Please enter your name.");
      return;
    }
    username = input;
    localStorage.setItem("username", username);
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display = "block";
    document.getElementById("scoringRules").style.display = "block";
    fetchFights();
    fetchLeaderboard();
    fetchUserPicks();
  });

  async function fetchFights() {
    const response = await fetch("/api/fights");
    const fights = await response.json();
    fightList.innerHTML = "";
    fights.forEach(({ fight, fighter1, fighter2 }) => {
      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <div class="fight-name">${fight}</div>
        <label>Winner:
          <select>
            <option value="">--</option>
            <option value="${fighter1}">${fighter1}</option>
            <option value="${fighter2}">${fighter2}</option>
          </select>
        </label>
        <label>Method:
          <select>
            <option value="">--</option>
            <option value="KO">KO</option>
            <option value="Sub">Sub</option>
            <option value="Decision">Decision</option>
          </select>
        </label>
        <label>Round:
          <select>
            <option value="">--</option>
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
    fightList.style.display = "block";
    submitBtn.style.display = "block";
  }

  async function submitPicks() {
    const picks = [];
    const fights = document.querySelectorAll(".fight");
    for (const fightDiv of fights) {
      const fight = fightDiv.querySelector(".fight-name").innerText;
      const winner = fightDiv.querySelector("select:nth-of-type(1)").value;
      const method = fightDiv.querySelector("select:nth-of-type(2)").value;
      const round = fightDiv.querySelector("select:nth-of-type(3)").value;
      if (!winner || !method) {
        alert("Please complete all picks before submitting.");
        return;
      }
      picks.push({ fight, winner, method, round });
    }

    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks }),
    });

    const result = await response.json();
    if (result.success) {
      punchSound.play();
      alert("Picks submitted!");
      fetchUserPicks();
    } else {
      alert(result.error || "Submission failed.");
    }
  }

  async function fetchUserPicks() {
    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    const myPicks = document.getElementById("myPicks");
    myPicks.innerHTML = `<h3 style="color:#fff">Your Picks:</h3>`;
    data.picks.forEach(({ fight, winner, method, round }) => {
      myPicks.innerHTML += `
        <div class="user-pick"><span class="fight-name">${fight}:</span> ${winner} by ${method} (Round ${round})</div>
      `;
    });
  }

  async function fetchLeaderboard() {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    const list = document.getElementById("leaderboard");
    const champMsg = document.getElementById("champion");
    list.innerHTML = "";
    let topScore = data.length ? data[0].score : 0;
    data.forEach(({ name, score }) => {
      const li = document.createElement("li");
      li.innerHTML = name + ": " + score + " pts" + (score === topScore ? " 👑" : "");
      list.appendChild(li);
    });
    if (data.some(user => user.score === topScore && topScore > 0)) {
      const champs = data.filter(u => u.score === topScore).map(u => u.name).join(", ");
      champMsg.innerHTML = `👑 Champion${champs.includes(",") ? "s" : ""} of the Week: ${champs}`;
      champMsg.style.display = "block";
    }
  }
});
