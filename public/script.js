document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const punchSound = new Audio("https://www.fesliyanstudios.com/play-mp3/387");

  let username = localStorage.getItem("username");

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
            <label><input type="radio" name="${fight}-winner" value="${fighter1}"> ${fighter1}</label>
            <label><input type="radio" name="${fight}-winner" value="${fighter2}"> ${fighter2}</label>
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

        // Disable round if Decision is selected
        document.querySelectorAll("select[name$='-method']").forEach(methodSelect => {
          methodSelect.addEventListener("change", () => {
            const fight = methodSelect.name.split("-method")[0];
            const roundSelect = document.querySelector(`select[name='${fight}-round']`);
            if (methodSelect.value === "Decision") {
              roundSelect.value = "";
              roundSelect.disabled = true;
            } else {
              roundSelect.disabled = false;
            }
          });
        });
      });
  }

  submitBtn.addEventListener("click", () => {
    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (let fightDiv of fights) {
      const fight = fightDiv.querySelector("h3").innerText;
      const winner = fightDiv.querySelector(`input[name="${fight}-winner"]:checked`)?.value;
      const method = fightDiv.querySelector(`select[name="${fight}-method"]`)?.value;
      const round = fightDiv.querySelector(`select[name="${fight}-round"]`)?.value;

      if (!winner || !method || (!round && method !== "Decision")) {
        alert(`Please complete all picks, including round (except for Decisions)`);
        return;
      }

      picks.push({ fight, winner, method, round: method === "Decision" ? "N/A" : round });
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
          alert("Picks submitted!");
          submitBtn.disabled = true;
          loadLeaderboard();
          loadMyPicks();
        } else {
          alert("Submission failed: " + (data.error || "Unknown error"));
        }
      });
  });

  function loadLeaderboard() {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(data => {
        const leaderboard = document.getElementById("leaderboard");
        leaderboard.innerHTML = ""; // ✅ Clear previous content
        const title = document.createElement("h2");
        title.innerText = "🏆 Leaderboard";
        leaderboard.appendChild(title);

        const scores = data.scores;
        for (let user in scores) {
          const score = scores[user];
          const line = document.createElement("p");
          line.innerText = `${user}: ${score} pts`;
          if (user === data.champ) line.style.fontWeight = "bold";
          leaderboard.appendChild(line);
        }
      });
  }

  function loadMyPicks() {
    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.picks.length > 0) {
          submitBtn.disabled = true;
          const myPicks = document.getElementById("myPicks");
          myPicks.innerHTML = "<h2>📋 Your Picks</h2>";
          data.picks.forEach(({ fight, winner, method, round }) => {
            const p = document.createElement("p");
            p.innerText = `${fight}: ${winner} via ${method} (${round})`;
            myPicks.appendChild(p);
          });
        }
      });
  }
});
