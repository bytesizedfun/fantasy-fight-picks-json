let username = localStorage.getItem("username");

if (!username) {
  username = prompt("Enter your username:");
  if (username) {
    localStorage.setItem("username", username);
  }
}

document.getElementById("username").textContent = `Welcome, ${username}!`;

fetch("/api/fights")
  .then((res) => res.json())
  .then((fights) => {
    const container = document.getElementById("fights");
    fights.forEach((fight, index) => {
      const div = document.createElement("div");
      div.classList.add("fight");
      div.innerHTML = `
        <h3>${fight.fighter1} vs ${fight.fighter2}</h3>
        <label>Pick a Winner:
          <select id="winner-${index}">
            <option value="${fight.fighter1}">${fight.fighter1}</option>
            <option value="${fight.fighter2}">${fight.fighter2}</option>
          </select>
        </label>
        <label>Method:
          <select id="method-${index}">
            ${fight.method_options
              .map((method) => `<option value="${method}">${method}</option>`)
              .join("")}
          </select>
        </label>
        <hr>
      `;
      container.appendChild(div);
    });
  });

document.getElementById("submit").addEventListener("click", () => {
  fetch("/api/fights")
    .then((res) => res.json())
    .then((fights) => {
      const picks = {};
      fights.forEach((fight, index) => {
        const winner = document.getElementById(`winner-${index}`).value;
        const method = document.getElementById(`method-${index}`).value;
        picks[`${fight.fighter1} vs ${fight.fighter2}`] = {
          winner,
          method
        };
      });

      fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, picks })
      })
        .then((res) => res.json())
        .then(() => {
          alert("Picks submitted!");
          showMyPicks(picks);
        });
    });
});

function showMyPicks(picks) {
  const container = document.getElementById("myPicks");
  container.innerHTML = "<h2>Your Picks</h2>";
  Object.entries(picks).forEach(([fight, pick]) => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${fight}</strong>: ${pick.winner} by ${pick.method}`;
    container.appendChild(div);
  });
}
