document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const punchSound = new Audio("punch.mp3");
  const submitNote = document.getElementById("submitNote");
  const eventStatus = document.getElementById("eventStatus");

  punchSound.volume = 1.0;

  let username = localStorage.getItem("username") || "";

  fetch("/api/eventStatus")
    .then((res) => res.json())
    .then((data) => {
      if (data.status === "locked") {
        eventStatus.innerText = "🔒 Picks are now locked.";
      } else if (data.status === "upcoming") {
        const lockTime = new Date(data.eventStart).getTime();
        const updateCountdown = () => {
          const now = new Date().getTime();
          const distance = lockTime - now;
          if (distance <= 0) {
            eventStatus.innerText = "🔒 Picks are now locked.";
            clearInterval(timer);
          } else {
            const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((distance % (1000 * 60)) / 1000);
            eventStatus.innerText = `⏳ Picks lock in ${mins}m ${secs}s`;
          }
        };
        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
      } else {
        eventStatus.innerText = "⚠️ Unknown event status";
      }
    });

  if (username) finalizeLogin(username);

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
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${name.toUpperCase()}!`;
    welcome.style.display = "block";
    document.getElementById("scoringRules").style.display = "block";

    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.picks.length > 0) {
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
        } else {
          localStorage.removeItem("submitted");
          loadFights();
          submitBtn.style.display = "block";
        }
        loadLeaderboard();
      });
  }

  function loadFights() {
    fetch("/api/fights")
      .then((res) => res.json())
      .then((data) => {
        fightList.innerHTML = "";
        data.forEach(({ fight, fighter1, fighter2, underdog }) => {
          const isDog1 = underdog === fighter1;
          const isDog2 = underdog === fighter2;
          const dog1 = isDog1 ? " 🐶" : "";
          const dog2 = isDog2 ? " 🐶" : "";

          const div = document.createElement("div");
          div.className = "fight";
          div.innerHTML = `
            <h3>${fight}</h3>
            <label><input type="radio" name="${fight}-winner" value="${fighter1}">${fighter1}${dog1}</label>
            <label><input type="radio" name="${fight}-winner" value="${fighter2}">${fighter2}${dog2}</label>
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

        document.querySelectorAll(".fight").forEach((fight) => {
          const methodSelect = fight.querySelector('select[name$="-method"]');
          const roundSelect = fight.querySelector('select[name$="-round"]');

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
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting…";

    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (const fight of fights) {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
      const roundEl = fight.querySelector(`select[name="${fightName}-round"]`);
      const round = roundEl && !roundEl.disabled ? roundEl.value : "";

      if (!winner || !method) {
        alert(`Missing pick for "${fightName}"`);
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Picks";
        return;
      }

      picks.push({ fight: fightName, winner, method, round });
    }

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, picks })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          punchSound.play();
          submitBtn.innerText = "✅ Picks Submitted!";
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
        } else {
          alert(data.error || "Something went wrong.");
          submitBtn.disabled = false;
          submitBtn.innerText = "Submit Picks";
        }
      })
      .catch(() => {
        alert("Network error.");
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Picks";
      });
  }

  submitBtn.addEventListener("click", submitPicks);

  function loadMyPicks() {
    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then((res) => res.json())
      .then((data) => {
        const myPicksDiv = document.getElementById("myPicks");
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
        if (!data.success || !data.picks.length) {
          myPicksDiv.innerHTML += "<p>No picks submitted.</p>";
          return;
        }
        data.picks.forEach(({ fight, winner, method, round }) => {
          const roundText = method === "Decision" ? "(Decision)" : `in Round ${round}`;
          myPicksDiv.innerHTML += `<p><span class="fight-name">${fight}</span><span class="user-pick">${winner} by ${method} ${roundText}</span></p>`;
        });
      });
  }

  function loadLeaderboard() {
    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => {
        const board = document.getElementById("leaderboard");
        board.innerHTML = "";

        const scores = Object.entries(data.scores || {});
        scores.sort((a, b) => b[1] - a[1]);

        scores.forEach(([user, score]) => {
          const li = document.createElement("li");
          li.textContent = `${user}: ${score} pts`;
          board.appendChild(li);
        });

        if (data.champMessage) {
          document.getElementById("champion").innerHTML = `<p style="color: gold; font-weight: bold;">${data.champMessage}</p>`;
        }
      });
  }
});
