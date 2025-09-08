/* ===== Fantasy Fight Picks — Neon Compact v2 logic ===== */

document.addEventListener("DOMContentLoaded", () => {
  const BASE = (window.API_BASE || "/api").replace(/\/$/, "");

  // helpers
  const $ = s => document.querySelector(s);
  const el = (t,c,h) => { const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e; };
  const esc = s => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const jget = (s,d=null) => { try{return JSON.parse(s)}catch{ return d } };

  function normalizeAmericanOdds(raw){ const m=String(raw??"").trim().match(/[+-]?\d+/); if(!m) return null; const n=+m[0]; return Number.isFinite(n)?n:null; }
  function underdogBonusFromOdds(odds){ const n=normalizeAmericanOdds(odds); if(n==null || n<100) return 0; return 1+Math.floor((n-100)/100); }
  const checkIcon = ok => `<span class="check ${ok?'good':'bad'}">${ok?'✓':'✕'}</span>`;

  // API (verbs kept)
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

  // caches / sticky
  const fightMeta = new Map();
  let fightsCache=null, leaderboardCache=null, allTimeCache=null;

  const KEY_PREV_WEEKLY="prevWeeklyScoresV4";
  const KEY_PREV_BANNER="prevChampBannerV4";

  function buildFightMeta(rows){
    fightMeta.clear();
    (rows||[]).forEach(r=>{
      fightMeta.set(r.fight,{ f1:r.fighter1, f2:r.fighter2, underdogSide:r.underdog||"", underdogOdds:r.underdogOdds||"" });
    });
  }

  // compact scoring content
  (function renderRules(){
    $("#scoringRules").innerHTML = `
      <ul class="rules-list">
        <li>+3 winner</li><li>+2 method</li><li>+1 round</li><li>🐶 underdog bonus</li>
      </ul>
    `;
  })();

  // login
  function doLogin(){
    const v=usernameInput.value.trim(); if(!v) return alert("Please enter your name.");
    username=v; localStorage.setItem("username", username); start();
  }
  $("#usernamePrompt button").addEventListener("click", doLogin);
  usernameInput.addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });
  if (username){ usernameInput.value=username; start(); }

  // start
  async function start(){
    usernamePrompt.style.display="none";
    welcome.textContent = `🎤 IIIIIIIIIIIIT'S ${username.toUpperCase()}!`;
    welcome.style.display="block";

    try{
      const [fights,myPicks] = await Promise.all([api.getFights(), api.getUserPicks(username)]);
      fightsCache=fights||[]; buildFightMeta(fightsCache);

      if (myPicks?.success && Array.isArray(myPicks.picks) && myPicks.picks.length){
        fightList.style.display="none"; submitBtn.style.display="none";
      } else {
        renderFightList(fightsCache); submitBtn.style.display="inline-block";
      }

      await loadMyPicks();
      await loadLeaderboard();
      preloadAllTime();
    }catch(e){
      console.error(e);
      fightList.innerHTML = `<div class="board-hint">Server unavailable.</div>`;
      submitBtn.style.display="none";
    }
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
          <label><input type="radio" name="${esc(fight)}-winner" value="${esc(fighter1)}">
            <span class="pick-row"><span class="fighter-name ${dog1>0?'is-underdog':''}">${esc(fighter1)}</span>${dog1>0?`<span class="dog-tag">🐶 +${dog1} pts</span>`:""}</span>
          </label>
          <label><input type="radio" name="${esc(fight)}-winner" value="${esc(fighter2)}">
            <span class="pick-row"><span class="fighter-name ${dog2>0?'is-underdog':''}">${esc(fighter2)}</span>${dog2>0?`<span class="dog-tag">🐶 +${dog2} pts</span>`:""}</span>
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

    fightList.querySelectorAll(".fight").forEach(card=>{
      const mSel=card.querySelector(`select[name$="-method"]`);
      const rSel=card.querySelector(`select[name$="-round"]`);
      const sync=()=>{ const dec=mSel.value==="Decision"; rSel.disabled=dec; if(dec) rSel.value=""; else if(!rSel.value) rSel.value="1"; };
      mSel.addEventListener("change", sync); sync();
    });

    fightList.style.display="grid";
  }

  async function submitPicks(){
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
    if(!picks.length){ alert("Make at least one pick."); submitBtn.disabled=false; submitBtn.textContent="Submit Picks"; return; }

    try{
      const res=await api.submitPicks({username,picks});
      if(res?.success){
        alert("Picks submitted!"); fightList.style.display="none"; submitBtn.style.display="none"; leaderboardCache=null;
        await loadMyPicks(); await loadLeaderboard();
      }else{
        alert(res?.error || "Submit failed."); submitBtn.disabled=false; submitBtn.textContent="Submit Picks";
      }
    }catch(e){
      alert("Network error submitting picks."); submitBtn.disabled=false; submitBtn.textContent="Submit Picks";
    }
  }
  submitBtn.addEventListener("click", submitPicks);

  async function loadMyPicks(){
    const my=await api.getUserPicks(username);
    const wrap=$("#myPicks"); wrap.innerHTML="";
    if(!my?.success || !Array.isArray(my.picks) || !my.picks.length){ wrap.style.display="none"; return; }

    if(!leaderboardCache) leaderboardCache=await api.getLeaderboard();
    const fr=(leaderboardCache && leaderboardCache.fightResults)||{};

    wrap.appendChild(el("div","header",`<div><strong>Your Picks</strong></div><div class="total-points" id="totalPoints">Total: 0 pts</div>`));

    let total=0;
    my.picks.forEach(({fight,winner,method,round})=>{
      const actual=fr[fight]||{};
      const done=!!(actual.winner && actual.method);
      const mWinner=done && winner===actual.winner;
      const mMethod=done && mWinner && method===actual.method;
      const mRound =done && mWinner && mMethod && method!=="Decision" && String(round)===String(actual.round);

      const meta=fightMeta.get(fight)||{};
      const dogSide=meta.underdogSide;
      const dogTier=underdogBonusFromOdds(meta.underdogOdds);
      const chosenIsUnderdog=(dogSide==="Fighter 1" && winner===meta.f1) || (dogSide==="Fighter 2" && winner===meta.f2);

      let score=0;
      if(mWinner){ score+=3; if(mMethod){score+=2; if(mRound) score+=1;} if(done && actual.underdog==="Y" && chosenIsUnderdog && dogTier>0){ score+=dogTier; } }
      total+=score;

      const line=done?[
        `<span class="badge ${mWinner?'good':'bad'}">${checkIcon(mWinner)} Winner</span>`,
        `<span class="badge ${mMethod?'good':'bad'}">${checkIcon(mMethod)} ${esc(method)}</span>`,
        method!=="Decision"?`<span class="badge ${mRound?'good':'bad'}">${checkIcon(mRound)} R${esc(round||'')}</span>`:""
      ].filter(Boolean).join(" "):`<span class="badge">Pending</span>`;

      const dogChip=chosenIsUnderdog && dogTier>0?`<span class="badge ${done && actual.underdog==='Y'?'good':''}">🐶 +${dogTier}</span>`:"";

      const row=el("div","scored-pick",`
        <div>
          <div class="fight-name">${esc(fight)}</div>
          <div class="meta">Your pick: <strong>${esc(winner)}</strong> by <strong>${esc(method)}</strong>${(method!=="Decision"&&round)?` in <strong>R${esc(round)}</strong>`:""} ${dogChip}</div>
          <div class="meta">${line}</div>
        </div>
        <div class="points"><span class="points ${score===0?'zero':'points-cyan'}">+${score} pts</span></div>
      `);
      wrap.appendChild(row);
    });

    const totalEl=$("#totalPoints"); if(totalEl) totalEl.textContent=`Total: ${total} pts`;
    wrap.style.display="grid";
  }

  async function loadLeaderboard(){
    const [fights,lb]=await Promise.all([
      fightsCache?Promise.resolve(fightsCache):api.getFights(),
      leaderboardCache?Promise.resolve(leaderboardCache):api.getLeaderboard()
    ]);
    fightsCache=fights; leaderboardCache=lb;

    leaderboardEl.innerHTML="";

    const resultsArr=Object.values(lb.fightResults||{});
    const resultsStarted=resultsArr.some(r=>r && r.winner && r.method);
    let scores=Object.entries(lb.scores||{}).sort((a,b)=> b[1]-a[1]);

    // show previous final board until new event actually starts
    if(scores.length===0 && !resultsStarted){
      const prev=jget(localStorage.getItem(KEY_PREV_WEEKLY),null);
      if(Array.isArray(prev)&&prev.length) scores=prev;
    }

    if(scores.length===0){
      leaderboardEl.appendChild(el("li","board-hint","Weekly standings will appear once results start."));
    } else {
      let rank=1, prev=null, shown=1;
      scores.forEach(([user,pts],idx)=>{
        if(pts!==prev) shown=rank;

        // Crown count: several fallbacks + all-time cache lookup
        let crownCount =
          (lb.crowns && lb.crowns[user]) ||
          (lb.crownCounts && lb.crownCounts[user]) ||
          (lb.crown_tally && lb.crown_tally[user]) || 0;

        if(!crownCount && Array.isArray(allTimeCache)){
          const found = allTimeCache.find(r=>String(r.user||r.username).toLowerCase()===String(user).toLowerCase());
          if(found) crownCount = +found.crowns || 0;
        }

        const crowns = crownCount>0 ? `<span class="crowns">${"👑".repeat(Math.min(crownCount,10))}</span>` : "";

        const isFirst = (idx===0);
        const isLast  = (scores.length>=3 && idx===scores.length-1);
        const poop    = isLast ? " 💩" : "";

        const li=el("li", `${isFirst?'first-place ':''}${isLast?'last-place ':''}`, `
          <span>#${shown}</span>
          <span>${esc(user)} ${crowns}</span>
          <span>${pts} pts${poop}</span>
          <span></span>
        `);

        if(lb.champs?.includes(user)) li.classList.add("champ-glow");
        if(user===username) li.classList.add("current-user");

        leaderboardEl.appendChild(li);
        prev=pts; rank++;
      });
    }

    // Banner (flashy, continuous; persists until next event begins)
    const totalFights=(fights||[]).length;
    const completed=resultsArr.filter(r=>r && r.winner && r.method && (r.method==="Decision" || (r.round && r.round!=="N/A"))).length;
    const haveMsg= typeof lb.champMessage==="string" && lb.champMessage.trim()!=="";
    const haveChamps= Array.isArray(lb.champs) && lb.champs.length>0;

    if(totalFights>0 && completed===totalFights && (haveMsg||haveChamps) && scores.length){
      const msg = haveMsg ? lb.champMessage.trim() : `Champion${lb.champs.length>1?'s':''}: ${lb.champs.join(', ')}`;
      localStorage.setItem(KEY_PREV_WEEKLY, JSON.stringify(scores));
      localStorage.setItem(KEY_PREV_BANNER, JSON.stringify({msg}));
      champBanner.innerHTML = marquee(msg);
      champBanner.style.display="block";
    } else if(!resultsStarted && scores.length===0){
      const prev=jget(localStorage.getItem(KEY_PREV_BANNER),null);
      if(prev?.msg){ champBanner.innerHTML=marquee(prev.msg); champBanner.style.display="block"; }
      else { champBanner.style.display="none"; }
    } else {
      champBanner.style.display="none";
    }
  }

  function marquee(msg){
    const safe=esc(msg);
    const item=`<span class="crown">👑</span> <span class="champ-name">${safe}</span>`;
    // longer track for smoother wrap
    return `<div class="scroll" aria-label="Champion of the Week">${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}</div>`;
  }

  // All-time helpers
  function sortAllTime(rows){
    const cleaned=(rows||[]).filter(r=>r && r.username && String(r.username).trim()!=="");
    return cleaned.map(r=>({user:r.username, crowns:+r.crowns||0, events:+r.events_played||0, rate:+r.crown_rate||0}))
      .sort((a,b)=>(b.rate-a.rate)||(b.crowns-a.crowns)||(b.events-a.events)||a.user.localeCompare(b.user));
  }
  function renderAllTimeHeader(){
    allTimeList.appendChild(el("li","board-header at-five",`<span>Rank</span><span>Player</span><span>%</span><span>👑</span><span>Events</span>`));
  }
  function drawAllTime(data){
    allTimeList.innerHTML="";
    if(!data.length){ allTimeList.innerHTML="<li>No All-Time data yet.</li>"; return; }
    renderAllTimeHeader();
    let shown=0, prev=null;
    data.forEach((r,idx)=>{
      shown = (!prev || r.rate!==prev.rate || r.crowns!==prev.crowns || r.events!==prev.events) ? (idx+1) : shown;
      const li=el("li","at-five"+(r.user===username?" current-user":""),`
        <span class="rank">${shown===1?"🥇":`#${shown}`}</span>
        <span class="user" title="${esc(r.user)}">${esc(r.user)}</span>
        <span class="num rate">${(r.rate*100).toFixed(1)}%</span>
        <span class="num crowns">${r.crowns}</span>
        <span class="num events">${r.events}</span>
        <span class="mobile-meta" aria-hidden="true">👑 ${r.crowns}/${r.events} • ${(r.rate*100).toFixed(1)}%</span>
      `);
      allTimeList.appendChild(li);
      prev=r;
    });
  }
  async function preloadAllTime(){ try{ allTimeCache=sortAllTime(await api.getHall()); }catch{} }

  // tabs
  weeklyTabBtn.addEventListener("click", e=>{
    e.preventDefault();
    leaderboardEl.style.display="block"; allTimeList.style.display="none";
    weeklyTabBtn.setAttribute("aria-pressed","true"); allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn.addEventListener("click", async e=>{
    e.preventDefault();
    if(!allTimeCache){ try{ allTimeCache=sortAllTime(await api.getHall()); }catch{} }
    drawAllTime(allTimeCache||[]);
    leaderboardEl.style.display="none"; allTimeList.style.display="block";
    weeklyTabBtn.setAttribute("aria-pressed","false"); allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});
