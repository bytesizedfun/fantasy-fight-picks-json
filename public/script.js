/* Fix Pass: keep HTML the same; restore checks, centering, tight leaderboard */

document.addEventListener("DOMContentLoaded", () => {
  const BASE = (window.API_BASE || "/api").replace(/\/$/, "");

  // helpers
  const $ = s => document.querySelector(s);
  const el = (t,c,h) => { const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e; };
  const esc = s => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function normalizeAmericanOdds(raw){ const m=String(raw??"").trim().match(/[+-]?\d+/); if(!m) return null; const n=+m[0]; return Number.isFinite(n)?n:null; }
  function underdogBonusFromOdds(odds){ const n=normalizeAmericanOdds(odds); if(n==null || n<100) return 0; return 1+Math.floor((n-100)/100); }
  const checkIcon = ok => `<span class="check ${ok?'good':'bad'}">${ok?'✓':'✕'}</span>`;

  // API
  const api = {
    async getFights(){ const r=await fetch(`${BASE}/fights`,{headers:{'Cache-Control':'no-cache'}}); return r.json(); },
    async getUserPicks(username){ const r=await fetch(`${BASE}/picks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})}); return r.json(); },
    async submitPicks(payload){ const r=await fetch(`${BASE}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); return r.json(); },
    async getLeaderboard(){ const r=await fetch(`${BASE}/leaderboard`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); return r.json(); },
    async getHall(){ const r=await fetch(`${BASE}/hall`,{headers:{'Cache-Control':'no-cache'}}); return r.json(); }
  };

  // DOM
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
  let fightsCache=null, leaderboardCache=null, allTimeCache=null;

  function buildFightMeta(rows){
    fightMeta.clear();
    (rows||[]).forEach(r=>{
      fightMeta.set(r.fight,{ f1:r.fighter1, f2:r.fighter2, underdogSide:r.underdog||"", underdogOdds:r.underdogOdds||"" });
    });
  }

  // compact scoring text
  (function renderRules(){
    const t=$("#scoringRules");
    if(t) t.innerHTML = `<ul class="rules-list"><li>+3 winner</li><li>+2 method</li><li>+1 round</li><li>🐶 underdog bonus</li></ul>`;
  })();

  // login
  function doLogin(){
    const v=usernameInput.value.trim(); if(!v) return alert("Please enter your name.");
    username=v; localStorage.setItem("username", username); start();
  }
  $("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", e=>{ if (e.key==="Enter") doLogin(); });
  if (username){ usernameInput.value=username; start(); }

  // start
  async function start(){
    usernamePrompt.style.display="none";
    welcome.textContent = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display="block";

    try{
      const fights = await api.getFights();
      fightsCache=fights||[];
      buildFightMeta(fightsCache);

      const myPicks = await api.getUserPicks(username);
      if (myPicks?.success && Array.isArray(myPicks.picks) && myPicks.picks.length){
        fightList.style.display="none"; submitBtn.style.display="none";
      } else {
        renderFightList(fightsCache);
        submitBtn.style.display="block";   // block centers with margin auto
      }

      await loadMyPicks();
      await loadLeaderboard();
    }catch(e){
      console.error(e);
      fightList.innerHTML = `<li class="board-hint">Server unavailable.</li>`;
      submitBtn.style.display="none";
    }
  }

  // ===== Fight picker (two buttons) =====
  function renderFightList(rows){
    fightList.innerHTML="";
    (rows||[]).forEach(({fight,fighter1,fighter2})=>{
      const meta=fightMeta.get(fight)||{};
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
            <option value="Decision">Decision</option><option value="KO/TKO">KO/TKO</option><option value="Submission">Submission</option>
          </select>
          <select name="${esc(fight)}-round">
            <option value="1">R1</option><option value="2">R2</option><option value="3">R3</option><option value="4">R4</option><option value="5">R5</option>
          </select>
        </div>
      `);
      fightList.appendChild(card);
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

  // ===== My Picks (✓ / ✕ visible; one 🐶 +X only if it cashed) =====
  async function loadMyPicks(){
    const my=await api.getUserPicks(username);
    const wrap=$("#myPicks"); wrap.innerHTML="";
    if(!my?.success || !Array.isArray(my.picks) || !my.picks.length){ wrap.style.display="none"; return; }

    if(!leaderboardCache) leaderboardCache=await api.getLeaderboard();
    const fr=(leaderboardCache && leaderboardCache.fightResults)||{};

    wrap.appendChild(el("div","header",`<div><strong>Your Picks</strong></div>`));

    my.picks.forEach(({fight,winner,method,round})=>{
      const actual=fr[fight]||{};
      const done=!!(actual.winner && actual.method);

      const meta=fightMeta.get(fight)||{};
      const dogSide=meta.underdogSide;
      const dogTier=underdogBonusFromOdds(meta.underdogOdds);
      const chosenIsUnderdog=(dogSide==="Fighter 1" && winner===meta.f1) || (dogSide==="Fighter 2" && winner===meta.f2);

      const mWinner=done && winner===actual.winner;
      const mMethod=done && mWinner && method===actual.method;
      const mRound =done && mWinner && mMethod && method!=="Decision" && String(round)===String(actual.round);

      const dogInline = (done && actual.underdog==='Y' && chosenIsUnderdog && dogTier>0) ? ` 🐶 +${dogTier}` : "";

      let score=0;
      if(mWinner){ score+=3; if(mMethod){score+=2; if(mRound) score+=1;} if(dogInline) score+=dogTier; }

      const line=done?[
        `<span class="badge ${mWinner?'good':'bad'}">${checkIcon(mWinner)} Winner</span>`,
        `<span class="badge ${mMethod?'good':'bad'}">${checkIcon(mMethod)} ${esc(method)}</span>`,
        method!=="Decision"?`<span class="badge ${mRound?'good':'bad'}">${checkIcon(mRound)} R${esc(round||'')}</span>`:""
      ].filter(Boolean).join(" "):`<span class="badge">Pending</span>`;

      const row=el("div","scored-pick",`
        <div>
          <div class="fight-name">${esc(fight)}</div>
          <div class="meta">Your pick: <strong>${esc(winner)}${dogInline}</strong> by <strong>${esc(method)}</strong>${(method!=="Decision"&&round)?` in <strong>R${esc(round)}</strong>`:""}</div>
          <div class="meta">${line}</div>
        </div>
        <div class="points"><span class="points ${score===0?'zero':'points-cyan'}">+${score} pts</span></div>
      `);
      wrap.appendChild(row);
    });

    wrap.style.display="grid";
  }

  // ===== Leaderboard (tight & centered hint) =====
  async function loadLeaderboard(){
    if(!leaderboardCache) leaderboardCache = await api.getLeaderboard();
    const lb = leaderboardCache || {};

    leaderboardEl.innerHTML="";

    const resultsArr=Object.values(lb.fightResults||{});
    const resultsStarted=resultsArr.some(r=>r && r.winner && r.method);
    let scores=Object.entries(lb.scores||{}).sort((a,b)=> b[1]-a[1]);

    if(scores.length===0){
      leaderboardEl.appendChild(el("li","board-hint","Weekly standings will appear once results start."));
    } else {
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

    // Banner (keep)
    const totalFights=(fightsCache||[]).length;
    const completed=resultsArr.filter(r=>r && r.winner && r.method && (r.method==="Decision" || (r.round && r.round!=="N/A"))).length;
    if(totalFights>0 && completed===totalFights && (lb.champMessage||"").trim()){
      champBanner.innerHTML = marquee(lb.champMessage.trim());
      champBanner.style.display="block";
    } else if(!resultsStarted){
      champBanner.style.display="block"; // will be replaced by cached banner if you have that logic; otherwise safe to show none
    } else {
      champBanner.style.display="none";
    }
  }

  function marquee(msg){
    const safe=esc(msg);
    const item=`<span class="crown">👑</span> <span class="champ-name">${safe}</span>`;
    return `<div class="scroll" aria-label="Champion of the Week">${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}</div>`;
  }

  // Tabs
  weeklyTabBtn?.addEventListener("click", e=>{
    e.preventDefault();
    leaderboardEl.style.display="block";
    allTimeList.style.display="none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn?.addEventListener("click", e=>{
    e.preventDefault();
    leaderboardEl.style.display="none";
    allTimeList.style.display="block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
