/* ===== Fantasy Fight Picks — your structure preserved, tiny fixes applied ===== */

document.addEventListener("DOMContentLoaded", () => {
  const BASE = (window.API_BASE || "/api").replace(/\/$/, "");

  // ---- Tiny helpers ----
  function $(sel){ return document.querySelector(sel); }
  function el(tag, cls, html){ const e = document.createElement(tag); if (cls) e.className = cls; if (html!=null) e.innerHTML = html; return e; }

  function normalizeAmericanOdds(raw){
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === "") return null;
    const m = s.match(/[+-]?\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    return isFinite(n) ? n : null;
  }
  function underdogBonusFromOdds(oddsRaw){
    const n = normalizeAmericanOdds(oddsRaw);
    if (n == null || n < 100) return 0;
    return 1 + Math.floor((n - 100) / 100);
  }
  const checkIcon = ok => `<span class="check ${ok ? 'good' : 'bad'}">${ok ? '✓' : '✕'}</span>`;

  // ---- API (path-only, no autodetect) ----
  const api = {
    async getFights(){ const r = await fetch(`${BASE}/fights`, { headers: { "Cache-Control":"no-cache" }}); return r.json(); },
    async getUserPicks(username){ const r = await fetch(`${BASE}/picks`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ username })}); return r.json(); },
    async submitPicks(payload){ const r = await fetch(`${BASE}/submit`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)}); return r.json(); },
    async getLeaderboard(){ const r = await fetch(`${BASE}/leaderboard`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({})}); return r.json(); },
    async getHall(){ const r = await fetch(`${BASE}/hall`, { headers: { "Cache-Control":"no-cache" }}); return r.json(); }
  };

  // ---- DOM refs ----
  const welcome = $("#welcome");
  const fightList = $("#fightList");
  const submitBtn = $("#submitBtn");
  const usernamePrompt = $("#usernamePrompt");
  const usernameInput = $("#usernameInput");
  const champBanner = $("#champBanner");
  const leaderboardEl = $("#leaderboard");
  const allTimeList = $("#allTimeBoard");
  const weeklyTabBtn = $("#tabWeekly");
  const allTimeTabBtn = $("#tabAllTime");

  let username = localStorage.getItem("username") || "";

  // caches
  const fightMeta = new Map();
  let fightsCache = null;
  let leaderboardCache = null;
  let allTimeCache = null;

  function buildFightMeta(rows){
    fightMeta.clear();
    (rows||[]).forEach(r => {
      fightMeta.set(r.fight, {
        f1: r.fighter1,
        f2: r.fighter2,
        underdogSide: r.underdog || "",
        underdogOdds: r.underdogOdds || ""
      });
    });
  }

  // ---- Scoring rules ----
  (function renderRules(){
    const elRules = $("#scoringRules");
    elRules.innerHTML = `
      <ul class="rules-list">
        <li>+3 for correct winner</li>
        <li>+2 for correct method <span class="muted">(only if winner is correct)</span></li>
        <li>+1 for correct round <span class="muted">(only if winner & method correct and not Decision)</span></li>
        <li>🐶 Underdog bonus if the underdog actually wins</li>
      </ul>
    `;
  })();

  // ---- Login flow ----
  function doLogin(){
    const v = usernameInput.value.trim();
    if (!v) return alert("Please enter your name.");
    username = v;
    localStorage.setItem("username", username);
    start();
  }
  $("#usernamePrompt button").addEventListener("click", doLogin);
  usernameInput.addEventListener("keydown", e => { if (e.key==="Enter") doLogin(); });

  if (username) { usernameInput.value = username; start(); }

  // ---- App start ----
  async function start(){
    usernamePrompt.style.display = "none";
    // Keep your exact string; font is handled via CSS (Orbitron lock in style.css)
    welcome.textContent = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display = "block";

    try {
      const [fights, myPicks] = await Promise.all([ api.getFights(), api.getUserPicks(username) ]);
      fightsCache = fights || [];
      buildFightMeta(fightsCache);

      if (myPicks && myPicks.success && Array.isArray(myPicks.picks) && myPicks.picks.length){
        fightList.style.display = "none";
        submitBtn.style.display = "none";
      } else {
        renderFightList(fightsCache);
        submitBtn.style.display = "inline-block";
      }

      await loadMyPicks();
      await loadLeaderboard();
      preloadAllTime();
    } catch (e) {
      console.error(e);
      fightList.innerHTML = `<div class="board-hint">Server unavailable. Check API base</div>`;
      submitBtn.style.display = "none";
    }
  }

  // ---- Fights picking UI ----
  function renderFightList(rows){
    fightList.innerHTML = "";
    (rows||[]).forEach(({ fight, fighter1, fighter2 }) => {
      const meta = fightMeta.get(fight) || {};
      const dogTier1 = (meta.underdogSide==="Fighter 1") ? underdogBonusFromOdds(meta.underdogOdds) : 0;
      const dogTier2 = (meta.underdogSide==="Fighter 2") ? underdogBonusFromOdds(meta.underdogOdds) : 0;

      const card = el("div","fight");
      card.innerHTML = `
        <h3>${fight}</h3>
        <div class="options">
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter1}">
            <span class="pick-row">
              <span class="fighter-name ${dogTier1>0?'is-underdog':''}">${fighter1}</span>
              ${dogTier1>0?`<span class="dog-tag">🐶 +${dogTier1} pts</span>`:""}
            </span>
          </label>
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter2}">
            <span class="pick-row">
              <span class="fighter-name ${dogTier2>0?'is-underdog':''}">${fighter2}</span>
              ${dogTier2>0?`<span class="dog-tag">🐶 +${dogTier2} pts</span>`:""}
            </span>
          </label>
        </div>
        <div class="pick-controls">
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
        </div>
      `;
      fightList.appendChild(card);
    });

    // disable round if Decision
    fightList.querySelectorAll(".fight").forEach(card=>{
      const mSel = card.querySelector(`select[name$="-method"]`);
      const rSel = card.querySelector(`select[name$="-round"]`);
      const sync = () => {
        const dec = mSel.value === "Decision";
        rSel.disabled = dec;
        if (dec) rSel.value = "";
        else if (!rSel.value) rSel.value = "1";
      };
      mSel.addEventListener("change", sync);
      sync();
    });

    fightList.style.display = "grid";
  }

  // Submit picks
  async function submitPicks(){
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    const picks = [];
    fightList.querySelectorAll(".fight").forEach(card=>{
      const fight = card.querySelector("h3").textContent;
      const winner = card.querySelector(`input[name="${fight}-winner"]:checked`)?.value || "";
      const method = card.querySelector(`select[name="${fight}-method"]`)?.value || "";
      const rSel = card.querySelector(`select[name="${fight}-round"]`);
      const round = rSel && !rSel.disabled ? (rSel.value || "") : "";

      if (!winner || !method) return;
      picks.push({ fight, winner, method, round });
    });

    if (!picks.length){
      alert("Make at least one pick.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Picks";
      return;
    }

    try{
      const res = await api.submitPicks({ username, picks });
      if (res && res.success){
        alert("Picks submitted!");
        fightList.style.display = "none";
        submitBtn.style.display = "none";
        leaderboardCache = null;
        await loadMyPicks();
        await loadLeaderboard();
      }else{
        alert(res?.error || "Submit failed.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
      }
    }catch(e){
      alert("Network error submitting picks.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Picks";
    }
  }
  submitBtn.addEventListener("click", submitPicks);

  // ---- My Picks (✓ ✕ + underdog bonus + total) ----
  async function loadMyPicks(){
    const my = await api.getUserPicks(username);
    const wrap = $("#myPicks");
    wrap.innerHTML = "";
    if (!my || !my.success || !Array.isArray(my.picks) || !my.picks.length){
      wrap.style.display = "none";
      return;
    }

    if (!leaderboardCache) leaderboardCache = await api.getLeaderboard();
    const fr = (leaderboardCache && leaderboardCache.fightResults) || {};

    const header = el("div","header", `<div><strong>Your Picks</strong></div><div class="total-points" id="totalPoints">Total: 0 pts</div>`);
    wrap.appendChild(header);

    let total = 0;

    my.picks.forEach(({ fight, winner, method, round }) => {
      const actual = fr[fight] || {};
      const hasResult = !!(actual.winner && actual.method);

      const mWinner = hasResult && (winner === actual.winner);
      const mMethod = hasResult && mWinner && (method === actual.method);
      const mRound  = hasResult && mWinner && mMethod && method !== "Decision" && (String(round) === String(actual.round));

      // underdog chip
      const meta = fightMeta.get(fight) || {};
      const dogSide = meta.underdogSide;
      const dogTier = underdogBonusFromOdds(meta.underdogOdds);
      const chosenIsUnderdog =
        (dogSide === "Fighter 1" && winner === meta.f1) ||
        (dogSide === "Fighter 2" && winner === meta.f2);

      // score
      let score = 0;
      if (mWinner){
        score += 3;
        if (mMethod){
          score += 2;
          if (mRound) score += 1;
        }
        if (hasResult && actual.underdog === "Y" && chosenIsUnderdog && dogTier > 0){
          score += dogTier;
        }
      }
      total += score;

      const metaLine = hasResult
        ? [
            `<span class="badge ${mWinner?'good':'bad'}">${checkIcon(mWinner)} Winner</span>`,
            `<span class="badge ${mMethod?'good':'bad'}">${checkIcon(mMethod)} ${method}</span>`,
            method !== "Decision" ? `<span class="chip-round ${mRound?'good':'bad'}">${checkIcon(mRound)} R${round}</span>` : ""
          ].filter(Boolean).join(" ")
        : `<span class="badge">Pending</span>`;

      const dogChip = chosenIsUnderdog && dogTier>0
        ? `<span class="badge ${hasResult && actual.underdog==='Y' ? 'good' : ''}">🐶 +${dogTier}</span>` : "";

      const row = el("div","scored-pick", `
        <div>
          <div class="fight-name">${fight}</div>
          <div class="meta">
            <span>Your pick:</span> <strong>${winner}</strong> by <strong>${method}</strong>
            ${method!=="Decision" && round ? `in <strong>R${round}</strong>` : ""}
            ${dogChip}
          </div>
          <div class="meta">${metaLine}</div>
        </div>
        <div class="points"><span class="points ${score===0?'zero':''}">+${score} pts</span></div>
      `);
      wrap.appendChild(row);
    });

    const totalEl = $("#totalPoints");
    if (totalEl) totalEl.textContent = `Total: ${total} pts`;

    wrap.style.display = "grid";
  }

  // ---- Leaderboard (weekly; champ banner when complete) ----
  async function loadLeaderboard(){
    const [fights, lb] = await Promise.all([
      fightsCache ? Promise.resolve(fightsCache) : api.getFights(),
      leaderboardCache ? Promise.resolve(leaderboardCache) : api.getLeaderboard()
    ]);
    fightsCache = fights;
    leaderboardCache = lb;

    const board = leaderboardEl;
    board.innerHTML = "";

    const resultsArr = Object.values(lb.fightResults || {});
    const resultsStarted = resultsArr.some(r => r && r.winner && r.method);

    // ✅ NEW: Render scores if present, even if results haven't "started" yet
    const scores = Object.entries(lb.scores || {}).sort((a,b)=> b[1]-a[1]);

    if (!resultsStarted && scores.length === 0){
      const hint = el("li","board-hint","Weekly standings will appear once results start.");
      board.appendChild(hint);
      champBanner.style.display = "none";
      return;
    }

    let rank=1, prev=null, shown=1;
    scores.forEach(([user, pts], idx) => {
      if (pts !== prev) shown = rank;
      const li = el("li","", `<span>#${shown}</span><span>${user}</span><span>${pts} pts</span>`);
      if (lb.champs?.includes(user)) li.classList.add("champ-glow");
      if (user === username) li.classList.add("current-user");
      if (scores.length>=3 && idx===scores.length-1) li.classList.add("loser");
      board.appendChild(li);
      prev = pts; rank++;
    });

    const totalFights = (fights || []).length;
    const completed = resultsArr.filter(r => r.winner && r.method && (r.method==="Decision" || (r.round && r.round!=="N/A"))).length;

    // ✅ NEW: show banner after all fights if we have champMessage OR champs[]
    const haveMsg = typeof lb.champMessage === "string" && lb.champMessage.trim() !== "";
    const haveChamps = Array.isArray(lb.champs) && lb.champs.length > 0;

    if (totalFights > 0 && completed === totalFights && (haveMsg || haveChamps)){
      const msg = haveMsg ? lb.champMessage.trim() : `Champion${lb.champs.length>1?'s':''}: ${lb.champs.join(', ')}`;
      // If you want the marquee effect with your CSS, use innerHTML + .scroll:
      // champBanner.innerHTML = `<div class="scroll"><span class="crown">👑</span> <span class="champ-name">${msg}</span> &nbsp;&nbsp;—&nbsp;&nbsp; <span class="crown">👑</span> <span class="champ-name">${msg}</span></div>`;
      // champBanner.style.display = "block";
      champBanner.textContent = `🏆 ${msg}`;
      champBanner.style.display = "block";
    } else {
      champBanner.style.display = "none";
    }
  }

  // ---- All-time ----
  function sortAllTime(rows){
    const cleaned = (rows||[]).filter(r=>r && r.username && String(r.username).trim()!=="");
    return cleaned.map(r => ({
      user:r.username,
      crowns:+r.crowns||0, events:+r.events_played||0, rate:+r.crown_rate||0
    })).sort((a,b)=> (b.rate-a.rate)||(b.crowns-a.crowns)||(b.events-a.events)||a.user.localeCompare(b.user));
  }
  function renderAllTimeHeader(){
    const li = el("li","board-header at-five", `
      <span>Rank</span><span>Player</span><span>%</span><span>👑</span><span>Events</span>
    `);
    allTimeList.appendChild(li);
  }
  function drawAllTime(data){
    allTimeList.innerHTML = "";
    if (!data.length){ allTimeList.innerHTML = "<li>No All-Time data yet.</li>"; return; }
    renderAllTimeHeader();
    let shown=0, prev=null;
    data.forEach((r, idx)=>{
      shown = (!prev || r.rate!==prev.rate || r.crowns!==prev.crowns || r.events!==prev.events) ? (idx+1) : shown;
      const li = el("li", "at-five" + (r.user===username?" current-user":"") + (shown===1?" tied-first":""), `
        <span class="rank">${shown===1?"🥇":`#${shown}`}</span>
        <span class="user" title="${r.user}">${r.user}</span>
        <span class="num rate">${(r.rate*100).toFixed(1)}%</span>
        <span class="num crowns">${r.crowns}</span>
        <span class="num events">${r.events}</span>
        <span class="mobile-meta" aria-hidden="true">👑 ${r.crowns}/${r.events} • ${(r.rate*100).toFixed(1)}%</span>
      `);
      allTimeList.appendChild(li);
      prev = r;
    });
  }
  async function preloadAllTime(){
    try{ allTimeCache = sortAllTime(await api.getHall()); }catch(_){}
  }
  weeklyTabBtn.addEventListener("click", e => {
    e.preventDefault();
    leaderboardEl.style.display = "block";
    allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn.addEventListener("click", async e => {
    e.preventDefault();
    if (!allTimeCache){ try{ allTimeCache = sortAllTime(await api.getHall()); }catch(_){} }
    drawAllTime(allTimeCache || []);
    leaderboardEl.style.display = "none";
    allTimeList.style.display = "block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
