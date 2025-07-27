document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const punchSound = new Audio("punch.mp3");
  const lockedMessage = document.getElementById("lockedMessage");
  const countdown = document.getElementById("countdown");

  punchSound.volume = 1.0;

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
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${name.toUpperCase()}!`;
    welcome.style.display = "block";

    fetch("/api/lockout")
      .then(res => res.json())
      .then(data => {
        if (data.locked) {
          lockedMessage.style.display = "block";
        } else {
          loadFights();
          submitBtn.style.display = "block";
        }
      });

    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.picks.length > 0) {
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
        } else {
          localStorage.removeItem("submitted");
        }

        loadMyPicks();
        loadLeaderboard();
      });

    startCountdown();
  }

  function loadFights() {
    fetch("/api/fights")
      .then(res => res.json())
      .then(data => {
        fightList.innerHTML = "";
        data.forEach(({ fight, fighter1, fighter2, underdog }) => {
          const isUnderdog1 = underdog === fighter1 ? "🐶" : "";
          const isUnderdog2 = underdog === fighter2 ? "🐶" : "";

          const div = document.createElement("div");
          div.className = "fight";
          div.innerHTML = `
            <h3>${fight}</h3>
            <label><input type="radio" name="${fight}-winner" value="${fighter1}">${fighter1} ${isUnderdog1}</label>
            <label><input type="radio" name="${fight}-winner" value="${fighter2}">${fighter2} ${isUnderdog2}</label>
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
      });
  }

  submitBtn.addEventListener("click", () => {
    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (const fight of fights) {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
      const roundRaw = fight.querySelector(`select[name="${fightName}-round"]`);
      const round = roundRaw && !roundRaw.disabled ? roundRaw.value : "";

      if (!winner || !method) {
        alert(`Please complete all picks. Missing data for "${fightName}".`);
        return;
      }

      picks.push({ fight: fightName, winner, method, round });
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
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          loadMyPicks();
        } else {
          alert(data.error || "Something went wrong.");
        }
      });
  });

  function loadMyPicks() {
    fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    })
      .then(res => res.json())
      .then(data => {
        const myPicksDiv = document.getElementById("myPicks");
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";
        if (!data.success || !data.picks.length) {
          myPicksDiv.innerHTML += "<p>No picks submitted.</p>";
          return;
        }
        data.picks.forEach(({ fight, winner, method, round }) => {
          const roundText = method === "Decision" ? "(Decision)" : `in Round ${round}`;
          myPicksDiv.innerHTML += `<p><strong class="fight-name">${fight}</strong><span class="user-pick">${winner} by ${method} ${roundText}</span></p>`;
        });
      });
  }

  function loadLeaderboard() {
    fetch("/api/leaderboard", {
      method: "POST"
    })
      .then(res => res.json())
      .then(data => {
        const board = document.getElementById("leaderboard");
        const scores = data.scores || {};
        const max = Math.max(...Object.values(scores));
        const min = Math.min(...Object.values(scores));

        board.innerHTML = "<ul>";
        Object.entries(scores).forEach(([user, score]) => {
          const isFirst = score === max;
          const isLast = score === min && Object.values(scores).length > 1;
          const crown = isFirst ? `<span class="crown">👑</span>` : "";
          const poop = isLast ? `<span class="poop">💩</span>` : "";
          const className = isFirst ? "first-place" : isLast ? "last-place" : "";
          board.innerHTML += `<li class="${className}">${user}: ${score} pts ${crown}${poop}</li>`;
        });
        board.innerHTML += "</ul>";

        if (data.champMessage) {
          document.getElementById("champion").innerText = data.champMessage;
        }
      });
  }

  function startCountdown() {
    const eventTime = new Date("2025-07-26T15:00:00-04:00").getTime();

    function updateCountdown() {
      const now = new Date().getTime();
      const distance = eventTime - now;

      if (distance <= 0) {
        countdown.innerText = "⏳ Picks are now locked.";
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      countdown.innerText = `⏳ Time until lock: ${hours}h ${minutes}m ${seconds}s`;
      setTimeout(updateCountdown, 1000);
    }

    updateCountdown();
  }
});
