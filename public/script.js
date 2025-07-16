let username = localStorage.getItem("username");

function lockUsername() {
  const val = document.getElementById("usernameInput").value.trim();
  if(!val) return alert("Enter your name");
  username = val;
  localStorage.setItem("username", username);
  showWelcome();
  checkStatus();
}

function showWelcome() {
  document.getElementById("usernamePrompt").style.display = "none";
  const w = document.getElementById("welcome");
  w.textContent = `Welcome, ${username}!`;
  w.style.display = "block";
}

window.onload = () => {
  if(username) showWelcome(), checkStatus();
};

function checkStatus() {
  fetch("/api/picks", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({username})
  })
  .then(r=>r.json())
  .then(data => {
    if(data.submitted) handleSubmitted(data.picks);
    else loadFights();
    loadLeaderboard();
  });
}

function loadFights() {
  fetch("/api/fights").then(r=>r.json()).then(fights=>{
    const c = document.getElementById("fightList");
    c.innerHTML = "";
    fights.forEach((f,i)=> c.innerHTML += `
      <div class="fight">
        <h3>${f.fighter1} vs ${f.fighter2}</h3>
        <select id="w${i}">
          <option>${f.fighter1}</option><option>${f.fighter2}</option>
        </select>
        <select id="m${i}">${f.method_options.map(m=>`<option>${m}</option>`).join("")}</select>
      </div>`);
    c.style.display="block";
    document.getElementById("submitBtn").style.display="inline-block";
  });
}

function submitPicks() {
  fetch("/api/fights").then(r=>r.json()).then(fights => {
    const picks = {};
    fights.forEach((f,i)=>{
      picks[`${f.fighter1} vs ${f.fighter2}`] = {
        winner: document.getElementById(`w${i}`).value,
        method: document.getElementById(`m${i}`).value
      };
    });
    fetch("/api/submit", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({username, picks})
    })
    .then(r=>r.json()).then(j=>{
      if(j.success) handleSubmitted(picks);
      else alert(j.error);
    });
  });
}

function handleSubmitted(picks) {
  document.getElementById("fightList").style.display="none";
  document.getElementById("submitBtn").style.display="none";
  const c = document.getElementById("myPicks");
  c.innerHTML = "<h3>Your Picks</h3>" + Object.entries(picks).map(([f,p])=>`<div>${f}: ${p.winner} by ${p.method}</div>`).join("");
}

function loadLeaderboard() {
  fetch("/api/leaderboard")
  .then(r=>r.json())
  .then(({scores, champ})=>{
    const lb = document.getElementById("leaderboard"), c=document.getElementById("champ");
    lb.innerHTML=""; c.textContent = champ ? `🏆 Top: ${champ}` : "";
    Object.entries(scores).sort((a,b)=>b[1]-a[1]).forEach(([u,s])=>{
      lb.innerHTML += `<li>${u}: ${s}</li>`;
    });
  });
}
