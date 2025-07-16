let username = localStorage.getItem("username");

async function fetchFights() {
  const res = await fetch("/api/fights");
  const fights = await res.json();
  const container = document.getElementById("fights");
  container.innerHTML = "";

  fights.forEach(fight => {
    const div = document.createElement("div");
    div.innerHTML = `
      <strong>${fight.fighter1}</strong> vs <strong>${fight.fighter2}</strong><br>
      <label>Pick Winner:</label>
      <select id="winner-${fight.id}">
        <option>${fight.fighter1}</option>
        <option>${fight.fighter2}</option>
      </select>
      <label>Method:</label>
      <select id="method-${fight.id}">
        ${fight.method_options.map(opt => `<option>${opt}</option>`).join("")}
      </select>
      <hr>
    `;
    container.appendChild(div);
  });
}

async function submitPicks() {
  const res = await fetch("/api/fights");
  const fights = await res.json();

  const picks = {};
  fights.forEach(fight => {
    picks[fight.id] = {
      winner: document.getElementById(`winner-${fight.id}`).value,
      method: document.getElementById(`method-${fight.id}`).value
    };
  });

  await fetch("/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, picks })
  });

  document.getElementById("yourPicks").textContent = JSON.stringify(picks, null, 2);
  loadLeaderboard();
}

function lockName() {
  const input = document.getElementById("username").value;
  if (!input) return alert("Enter a name");
  localStorage.setItem("username", input);
  location.reload();
}

async function loadLeaderboard() {
  const res = await fetch("/api/leaderboard");
  const data = await res.json();
  const list = document.getElementById("leaderboard");
  list.innerHTML = "";
  data.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = `${entry.username} — ${entry.score} pts`;
    list.appendChild(li);
  });
}

async function loadPicks() {
  const res = await fetch(`/api/picks/${username}`);
  const data = await res.json();
  if (Object.keys(data).length) {
    document.getElementById("yourPicks").textContent = JSON.stringify(data, null, 2);
  }
}

window.onload = () => {
  if (username) {
    document.getElementById("login").style.display = "none";
    document.getElementById("main").style.display = "block";
    document.getElementById("welcome").textContent = `Welcome, ${username}`;
    fetchFights();
    loadLeaderboard();
    loadPicks();
  }
};
