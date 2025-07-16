const welcome = document.getElementById("welcome");
const fightList = document.getElementById("fightList");
const submitBtn = document.getElementById("submitBtn");

let username = localStorage.getItem("username");

if (username) {
  finalizeLogin(username);
}

function lockUsername() {
  const input = document.getElementById("usernameInput").value.trim();
  if (!input) return alert("Please enter your name.");
  localStorage.setItem("username", input);
  finalizeLogin(input);
}

function finalizeLogin(name) {
  username = name;
  document.getElementById("usernamePrompt").style.display = "none";
  welcome.innerText = `Welcome, ${username}!`;
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
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter1}" />
            ${fighter1}
          </label>
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter2}" />
            ${fighter2}
          </label>
          <select name="${fight}-method">
            <option value="Decision">Decision</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
          </select>
        `;
        fightList.appendChild(div);
      });
      fightList.style.display = "block";
      submitBtn.style.display = "block";
    });
}

function submitPicks() {
  const picks = {};
  const fights = document.querySelectorAll(".fight");
  fights.forEach(fight => {
    const fightName = fight.querySelector("h3").innerText;
    const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
    const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
    if (winner && method) {
      picks[fightName] = { winner, method };
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

function loadMyPicks() {
  fetch("/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.submitted) return;
      const myPicksDiv = document.getElementById("myPicks");
      myPicksDiv.innerHTML = "<h3>Your
