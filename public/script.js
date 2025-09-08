document.addEventListener("DOMContentLoaded", () => {
  const BASE = (window.API_BASE || "/api").replace(/\/$/, "");
  const $ = s => document.querySelector(s);
  const el = (t,c,h) => { const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e; };
  const esc = s => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const jget = (s,d=null) => { try{return JSON.parse(s)}catch{ return d } };
  function normalizeAmericanOdds(raw){ const m=String(raw??"").trim().match(/[+-]?\d+/); if(!m) return null; const n=+m[0]; return Number.isFinite(n)?n:null; }
  function underdogBonusFromOdds(odds){ const n=normalizeAmericanOdds(odds); if(n==null||n<100) return 0; return 1+Math.floor((n-100)/100); }
  const checkIcon = ok => `<span class="check ${ok?'good':'bad'}">${ok?'✓':'✕'}</span>`;

  const api = {
    async getFights(){ const r=await fetch(`${BASE}/fights`,{headers:{'Cache-Control':'no-cache'}}); return r.json(); },
    async getUserPicks(username){ const r=await fetch(`${BASE}/picks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})}); return r.json(); },
    async submitPicks(payload){ const r=await fetch(`${BASE}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); return r.json(); },
    async getLeaderboard(){ const r=await fetch(`${BASE}/leaderboard`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); return r.json(); },
    async getHall(){ const r=await fetch(`${BASE}/hall`,{headers:{'Cache-Control':'no-cache'}}); return r.json(); }
  };

  const welcome=$("#welcome"), fightList=$("#fightList"), submitBtn=$("#submitBtn"),
        usernamePrompt=$("#usernamePrompt"), usernameInput=$("#usernameInput"),
        champBanner=$("#champBanner"), leaderboardEl=$("#leaderboard"),
        allTimeList=$("#allTimeBoard"), weeklyTabBtn=$("#tabWeekly"), allTimeTabBtn=$("#tabAllTime");

  let username=localStorage.getItem("username")||"";
  const fightMeta=new Map(); let fightsCache=null, leaderboardCache=null, allTimeCache=null;

  function buildFightMeta(rows){ fightMeta.clear(); (rows||[]).forEach(r=>fightMeta.set(r.fight,{f1:r.fighter1,f2:r.fighter2,underdogSide:r.underdog||"",underdogOdds:r.underdogOdds||""})); }

  // minimal scoring text
  $("#scoringRules") && ($("#scoringRules").innerHTML=`<ul class="rules-list"><li>+3 winner</li><li>+2 method</li><li>+1 round</li><li>🐶 underdog bonus</li></ul>`);

  function doLogin(){ const v=usernameInput.value.trim(); if(!v) return alert("Please enter your name."); username=v; localStorage.setItem("username",username); start(); }
  $("#usernamePrompt button")?.addEventListener("click",doLogin);
  usernameInput?.addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
  if(username){ usernameInput.value=username; start(); }

  async function start(){
    usernamePrompt.style.display="none";
    welcome.textContent=`🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`; welcome.style.display="block";
    try{
      const [fights] = await Promise.all([api.getFights()]);
      fightsCache=fights||[]; buildFightMeta(fightsCache);

      const my=await api.getUserPicks(username);
      if(my?.success && my.picks?.length){ fightList.style.display="none"; submitBtn.style.display="none"; }
      else { renderFightList(fightsCache); submitBtn.style.display="block"; }

      await loadMyPicks(); await loadLeaderboard();
    }catch(e){ console.error(e); }
  }

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
        </div>`);
      fightList.appendChild(card);
    });
    fightList.style.display="grid";
  }

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
      if(res?.success){ fightList.style.display="none"; submitBtn.style.display="none"; await loadMyPicks(); await loadLeaderboard(); }
      else { alert(res?.error||"Submit failed."); }
    }finally{ submitBtn.disabled=false; submitBtn.textContent="Submit Picks"; }
  });

  async function loadMyPicks(){
    const my=await api.getUserPicks(username); const wrap=$("#myPicks"); wrap.innerHTML="";
    if(!my?.success || !my.picks?.length){ wrap.style.display="none"; return; }
    if(!leaderboardCache) leaderboardCache=await api.getLeaderboard();
    const fr=(leaderboardCache && leaderboardCache.fightResults)||{};
    wrap.appendChild(el("div","header",`<div><strong>Your Picks</strong></div>`));

    my.picks.forEach(({fight,winner,method,round})=>{
      const actual=fr[fight]||{}; const done=!!(actual.winner && actual.method);
      const meta=fightMeta.get(fight)||{}; const dogSide=meta.underdogSide;
      const dogTier=(dogSide&&meta.underdogOdds)?(function(n){n=String(n).match(/[+-]?\d+/);n=n?+n[0]:null;return(n==null||n<100)?0:1+Math.floor((n-100)/100)})(meta.underdogOdds):0;
      const chosenIsUnderdog=(dogSide==="Fighter 1" && winner===meta.f1)||(dogSide==="Fighter 2" && winner===meta.f2);
      const dogInline=(done && actual.underdog==='Y' && chosenIsUnderdog && dogTier>0)?` 🐶 +${dogTier}`:"";

      const mWinner=done && winner===actual.winner;
      const mMethod=done && mWinner && method===actual.method;
      const mRound =done && mWinner && mMethod && method!=="Decision" && String(round)===String(actual.round);

      let score=0; if(mWinner){score+=3;if(mMethod){score+=2;if(mRound)score+=1;} if(dogInline) score+=dogTier;}

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

  async function loadLeaderboard(){
    if(!leaderboardCache) leaderboardCache = await api.getLeaderboard();
    const lb = leaderboardCache || {};
    leaderboardEl.innerHTML="";

    const resultsArr=Object.values(lb.fightResults||{});
    const resultsStarted=resultsArr.some(r=>r && r.winner && r.method);
    let scores=Object.entries(lb.scores||{}).sort((a,b)=> b[1]-a[1]);

    if(scores.length===0){
      leaderboardEl.appendChild(el("li","board-hint","Weekly standings will appear once results start."));
      return;
    }

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

  // tabs
  $("#tabWeekly")?.addEventListener("click",e=>{e.preventDefault();leaderboardEl.style.display="block";allTimeList.style.display="none";$("#tabWeekly").setAttribute("aria-pressed","true");$("#tabAllTime").setAttribute("aria-pressed","false");});
  $("#tabAllTime")?.addEventListener("click",e=>{e.preventDefault();leaderboardEl.style.display="none";allTimeList.style.display="block";$("#tabWeekly").setAttribute("aria-pressed","false");$("#tabAllTime").setAttribute("aria-pressed","true");});
});
