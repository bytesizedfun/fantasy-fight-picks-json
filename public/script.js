/* App script — normalized fight matching (✓ / ✕ now show), all-time works, decisions disable round */

document.addEventListener("DOMContentLoaded", () => {
  const BASE = (window.API_BASE || "/api").replace(/\/$/, "");

  // ---------- helpers
  const $ = s => document.querySelector(s);
  const el = (t,c,h) => { const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e; };
  const esc = s => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function normalizeAmericanOdds(raw){ const m=String(raw??"").trim().match(/[+-]?\d+/); if(!m) return null; const n=+m[0]; return Number.isFinite(n)?n:null; }
  function underdogBonusFromOdds(odds){ const n=normalizeAmericanOdds(odds); if(n==null || n<100) return 0; return 1+Math.floor((n-100)/100); }
  const checkIcon = ok => `<span class="check ${ok?'good':'bad'}" aria-hidden="true">${ok?'✓':'✕'}</span>`;

  // *** EXACTLY the same normalization as server (GAS) ***
  const normKey = (s) => String(s||"")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ")
    .trim();

  // ---------- API
  const api = {
    async getFights(){ const r=await fetch(`${BASE}/fights`,{headers:{'Cache-Control':'no-cache'}}); return r.json(); },
    async getUserPicks(username){ const r=await fetch(`${BASE}/picks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})}); return r.json(); },
    async submitPicks(payload){ const r=await fetch(`${BASE}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); return r.json(); },
    async getLeaderboardFresh(){ const r=await fetch(`${BASE}/leaderboard`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); return r.json(); },
    async getHall(){ const r=await fetch(`${BASE}/hall`,{headers:{'Cache-Control':'no-cache'}}); return r.json(); }
  };

  // ---------- DOM
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
  let fightsCache = null;

  // meta maps (exact + normalized)
  const metaByExact = new Map();
  const metaByNorm = new Map();

  // compact scoring text
  (function renderRules(){
    const t=$("#scoringRules");
    if(t) t.innerHTML = `<ul class="rules-list"><li>+3 winner</li><li>+2 method</li><li>+1 round</li><li>🐶 underdog bonus</li></ul>`;
  })();

  function buildFightMeta(rows){
    metaByExact.clear(); metaByNorm.clear();
    (rows||[]).forEach(r=>{
      const m = { f1:r.fighter1, f2:r.fighter2, underdogSide:r.underdog||"", underdogOdds:r.underdogOdds||"" };
      metaByExact.set(r.fight, m);
      metaByNorm.set(normKey(r.fight), m);
    });
  }

  function doLogin(){
    const v=usernameInput.value.trim(); if(!v) return alert("Please enter your name.");
    username=v; localStorage.setItem("username", username); start();
  }
  $("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });
  if(username){ usernameInput.value=username; start(); }

  async function start(){
    usernamePrompt.style.display="none";
    welcome.textContent = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display="block";

    try{
      const fights = await api.getFights();
      fightsCache = fights || [];
      buildFightMeta(fightsCache);

      const my = await api.getUserPicks(username);
      if (my?.success && Array.isArray(my.picks) && my.picks.length){
        fightList.style.display="none"; submitBtn.style.display="none";
      } else {
        renderFightList(fightsCache);
        submitBtn.style.display="block";
      }

      await loadMyPicks();      // ✓ / ✕ now normalized
      await loadLeaderboard();  // weekly board + banner
      preloadAllTime();         // warm all-time data
    }catch(e){
      console.error(e);
      const li = el("li","board-hint","Server unavailable.");
      li.style.textAlign="center";
      fightList.innerHTML = ""; fightList.appendChild(li);
      submitBtn.style.display="none";
    }
  }

  // ===== Fight picker (flat text options). Decision => disable round. =====
  function renderFightList(rows){
    fightList.innerHTML="";
    (rows||[]).forEach(({fight,fighter1,fighter2})=>{
      const meta=metaByExact.get(fight)||{};
      const dog1=(meta.underdogSide==="Fighter 1")?underdogBonusFromOdds(meta.underdogOdds):0;
      const dog2=(meta.underdogSide==="Fighter 2")?underdogBonusFromOdds(meta.underdogOdds):0;

      const card=el("div","fight",`
        <h3>${esc(fight)}</h3>
        <div class="options">
          <label>
            <input type="radio" name="${esc(fight)}-winner" value="${esc(fighter1)}">
            <span class="pick-btn">${esc(fighter1)}${dog1>0?` <span class="pick-dog">🐶 +${dog1}</span>`:""}</span>
          </label>
          <label>
            <input type="radio" name="${esc(fight)}-winner" value="${esc(fighter2)}">
            <span class="pick-btn">${esc(fighter2)}${dog2>0?` <span class="pick-dog">🐶 +${dog2}</span>`:""}</span>
          </label>
        </div>
        <div class="pick-controls">
          <select name="${esc(fight)}-method">
            <option value="Decision">Decision</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
          </select>
          <select name="${esc(fight)}-round">
            <option value="1">R1</option><option value="2">R2</option><option value="3">R3</option><option value="4">R4</option><option value="5">R5</option>
          </select>
        </div>
      `);
      fightList.appendChild(card);
    });

    // Decision disables round
    fightList.querySelectorAll(".fight").forEach(card=>{
      const mSel = card.querySelector(`select[name$="-method"]`);
      const rSel = card.querySelector(`select[name$="-round"]`);
      const sync = () => {
        const dec = mSel.value === "Decision";
        rSel.disabled = dec;
        if (dec) { rSel.value = ""; }
        else if (!rSel.value) { rSel.value = "1"; }
      };
      mSel.addEventListener("change", sync);
      sync();
    });

    fightList.style.display="grid";
  }

  // submit
  submitBtn?.addEventListener("click", async ()=>{
    submitBtn.disabled=true; submitBtn.textContent="Submitting…";
    const picks=[];
    fightList.querySelectorAll(".fight").forEach(card=>{
      const fight=card.querySelector("h3").textContent;
      const winner=card.querySelector(`input[name="${esc(fight)}-winner"]:checked`)?.value||"";
      const method=card.querySelector(`select[name="${esc(fight)}-method"]`)?.value||"";
      const rSel=card.querySelector(`select[name="${esc(fight)}-round"]`);
      const round=rSel && !rSel.disabled ? (rSel.value||"") : "";
      if(!winner||!method) return; picks.push({fight,winner,method,round});
    });
    try{
      const res=await api.submitPicks({username,picks});
      if(res?.success){
        fightList.style.display="none"; submitBtn.style.display="none";
        await loadMyPicks(); await loadLeaderboard();
      }else{
        alert(res?.error || "Submit failed.");
      }
    }finally{
      submitBtn.disabled=false; submitBtn.textContent="Submit Picks";
    }
  });

  // ===== Your Picks — uses FRESH results and NORMALIZED keys (✓/✕ fixed) =====
  async function loadMyPicks(){
    const my=await api.getUserPicks(username);
    const wrap=$("#myPicks"); wrap.innerHTML="";
    if(!my?.success || !Array.isArray(my.picks) || !my.picks.length){ wrap.style.display="none"; return; }

    const lb = await api.getLeaderboardFresh();         // always fresh
    const fr = (lb && lb.fightResults) || {};
    // build normalized map of fightResults
    const frByNorm = {};
    Object.keys(fr).forEach(k => { frByNorm[normKey(k)] = fr[k]; });

    wrap.appendChild(el("div","header",`<div><strong>Your Picks</strong></div>`));

    my.picks.forEach(({fight,winner,method,round})=>{
      const n = normKey(fight);
      const actual = fr[fight] || frByNorm[n] || {};          // exact or normalized
      const resultExists = !!(actual.winner && actual.method);

      const meta = metaByExact.get(fight) || metaByNorm.get(n) || {};
      const dogSide = meta.underdogSide;
      const dogTier = underdogBonusFromOdds(meta.underdogOdds);
      const chosenIsUnderdog=(dogSide==="Fighter 1" && winner===meta.f1) || (dogSide==="Fighter 2" && winner===meta.f2);

      const mWinner = resultExists && winner===actual.winner;
      const mMethod = resultExists && mWinner && method===actual.method;
      const mRound  = resultExists && mWinner && mMethod && method!=="Decision" && String(round)===String(actual.round);

      const dogInline = (resultExists && actual.underdog==='Y' && chosenIsUnderdog && dogTier>0) ? ` 🐶 +${dogTier}` : "";

      // display row (status chips show ✓/✕ via checkIcon)
      const statusLine = resultExists
        ? [
            `<span class="badge ${mWinner?'good':'bad'}">${checkIcon(mWinner)} Winner</span>`,
            `<span class="badge ${mMethod?'good':'bad'}">${checkIcon(mMethod)} ${esc(method)}</span>`,
            method!=="Decision" ? `<span class="badge ${mRound?'good':'bad'}">${checkIcon(mRound)} R${esc(round||'')}</span>` : ""
          ].filter(Boolean).join(" ")
        : `<span class="badge">Pending</span>`;

      // Compute same score breakdown client-side for the “+X pts” tag (not used in totals)
      let score=0;
      if(mWinner){ score+=3; if(mMethod){score+=2; if(mRound) score+=1;} if(dogInline) score+=dogTier; }

      const row=el("div","scored-pick",`
        <div>
          <div class="fight-name">${esc(fight)}</div>
          <div class="meta">Your pick: <strong>${esc(winner)}${dogInline}</strong> by <strong>${esc(method)}</strong>${(method!=="Decision"&&round)?` in <strong>R${esc(round)}</strong>`:""}</div>
          <div class="meta">${statusLine}</div>
        </div>
        <div class="points"><span class="points ${score===0?'zero':'points-cyan'}">+${score} pts</span></div>
      `);
      wrap.appendChild(row);
    });

    wrap.style.display="grid";
  }

  // ===== Weekly leaderboard + banner =====
  async function loadLeaderboard(){
    const lb = await api.getLeaderboardFresh();
    leaderboardEl.innerHTML="";

    const resultsArr=Object.values(lb.fightResults||{});
    const resultsStarted=resultsArr.some(r=>r && r.winner && r.method);
    const scores=Object.entries(lb.scores||{}).sort((a,b)=> b[1]-a[1]);

    if(scores.length===0){
      const hint = el("li","board-hint","Weekly standings will appear once results start.");
      hint.style.textAlign = "center";         // ensure centered even without CSS
      leaderboardEl.appendChild(hint);
    }else{
      let rank=1, prevPts=null, shown=1;
      scores.forEach(([user,pts],idx)=>{
        if(pts!==prevPts) shown=rank;
        const isFirst=(idx===0), isLast=(scores.length>=3 && idx===scores.length-1);
        const crown=isFirst?`<span aria-hidden="true">👑</span>`:"";
        const poop=isLast?" 💩":"";
        const li=el("li",`${isFirst?'row-first ':''}${isLast?'row-last ':''}`,`
          <span>#${shown}</span>
          <span class="name">${crown} ${esc(user)}</span>
          <span class="points">${pts} pts${poop}</span>
        `);
        leaderboardEl.appendChild(li);
        prevPts=pts; rank++;
      });
    }

    // Banner (scroll across container)
    const totalFights=(fightsCache||[]).length;
    const completed=resultsArr.filter(r=>r && r.winner && r.method && (r.method==="Decision" || (r.round && r.round!=="N/A"))).length;
    const haveMsg= typeof lb.champMessage==="string" && lb.champMessage.trim()!=="";
    if(totalFights>0 && completed===totalFights && haveMsg){
      champBanner.innerHTML = marquee(lb.champMessage.trim());
      champBanner.style.display="block";
    } else {
      champBanner.style.display="none";
    }
  }

  function marquee(msg){
    const safe=esc(msg);
    const item=`<span class="crown">👑</span> <span class="champ-name">${safe}</span>`;
    return `<div class="scroll" aria-label="Champion of the Week">
      ${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}
    </div>`;
  }

  // ===== All-Time leaderboard (unchanged server schema) =====
  function sortAllTime(rows){
    const cleaned = (rows||[]).filter(r=>r && r.username && String(r.username).trim()!=="");
    return cleaned.map(r => ({
      user:r.username,
      crowns:+r.crowns||0,
      events:+r.events_played||0,
      rate:+r.crown_rate||0
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
    if (!data.length){ const hint=el("li","board-hint","No All-Time data yet."); hint.style.textAlign="center"; allTimeList.appendChild(hint); return; }
    renderAllTimeHeader();
    let shown=0, prev=null;
    data.forEach((r, idx)=>{
      shown = (!prev || r.rate!==prev.rate || r.crowns!==prev.crowns || r.events!==prev.events) ? (idx+1) : shown;
      const li = el("li", "at-five", `
        <span class="rank">${shown===1?"🥇":`#${shown}`}</span>
        <span class="user" title="${esc(r.user)}">${esc(r.user)}</span>
        <span class="num rate">${(r.rate*100).toFixed(1)}%</span>
        <span class="num crowns">${r.crowns}</span>
        <span class="num events">${r.events}</span>
      `);
      allTimeList.appendChild(li);
      prev = r;
    });
  }
  async function preloadAllTime(){
    try{
      const hall = await api.getHall();
      const data = sortAllTime(hall||[]);
      // don't render yet; render when tab is clicked
      window.__hall = data;
    }catch(_){}
  }

  // Tabs
  weeklyTabBtn?.addEventListener("click", e=>{
    e.preventDefault();
    leaderboardEl.style.display="block";
    allTimeList.style.display="none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn?.addEventListener("click", async e=>{
    e.preventDefault();
    if (!window.__hall){ await preloadAllTime(); }
    drawAllTime(window.__hall || []);
    leaderboardEl.style.display="none";
    allTimeList.style.display="block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
