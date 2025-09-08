/* ===== Fantasy Fight Picks — Neon Compact v6 =====
   - One 🐶 +X inline ONLY when bonus actually hits
   - Removed "Total: … pts" from Your Picks header
   - Bigger shimmering champ banner
   - Centered Your Picks
   - Leaderboard super tight (42 | 1fr | 70) + centered hint
   - Two-button fighter picker (no duplicate rows/bubbles)
   - Styled selects; submit centered; tabs cyan->red hover
*/

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

  const KEY_PREV_WEEKLY="prevWeeklyScoresV8";
  const KEY_PREV_BANNER="prevChampBannerV8";

  function buildFightMeta(rows){
    fightMeta.clear();
    (rows||[]).forEach(r=>{
      fightMeta.set(r.fight,{ f1:r.fighter1, f2:r.fighter2, underdogSide:r.underdog||"", underdogOdds:r.underdogOdds||"" });
    });
  }

  // compact scoring text
  (function renderRules(){
    $("#scoringRules").innerHTML = `
      <ul class="rules-list"><li>+3 winner</li><li>+2 method</li><li>+1 round</li><li>🐶 underdog bonus</li></ul>
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
      const [fights, hall] = await Promise.all([api.getFights(), api.getHall()]);
      fightsCache=fights||[]; allTimeCache = normalizeHall(hall||[]);
      buildFightMeta(fightsCache);

      const myPicks = await api.getUserPicks(username);
      if (myPicks?.success && Array.isArray(myPicks.picks) && myPicks.picks.length){
        fightList.style.display="none"; submitBtn.style.display="none";
      } else {
        renderFightList(fightsCache);
        submitBtn.style.display="block";  // block centers with margin auto
      }

      await loadMyPicks();
      await loadLeaderboard();
    }catch(e){
      console.error(e);
      fightList.innerHTML = `<li class="board-hint">Server unavailable.</li>`;
      submitBtn.style.display="none";
    }
  }

  // ===== Fight picker (two compact buttons) =====
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
  submitBtn.addEventListener("click", async ()=>{
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
  });

  // ===== My Picks (one 🐶 +X ONLY if cashed; centered) =====
  async function loadMyPicks(){
    const my=await api.getUserPicks(username);
    const wrap=$("#myPicks"); wrap.innerHTML="";
    if(!my?.success || !Array.isArray(my.picks) || !my.picks.length){ wrap.style.display="none"; return; }

    if(!leaderboardCache) leaderboardCache=await api.getLeaderboard();
    const fr=(leaderboardCache && leaderboardCache.fightResults)||{};

    // header WITHOUT total points (declutter)
    wrap.appendChild(el("div","header",`<div><strong>Your Picks</strong></div>`));

    let total=0;
    my.picks.forEach(({fight,winner,method,round})=>{
      const actual=fr[fight]||{};
      const done=!!(actual.winner && actual.method);

      const meta=fightMeta.get(fight)||{};
      const dogSide=meta.underdogSide;
      const dogTier=underdogBonusFromOdds(meta.underdogOdds);
      const chosenIsUnderdog=(dogSide==="Fighter 1" && winner===meta.f1) || (dogSide==="Fighter 2" && winner===meta.f2);

      // ONE dog with +X ONLY when it actually pays
      const dogInline = (done && actual.underdog==='Y' && chosenIsUnderdog && dogTier>0) ? ` 🐶 +${dogTier}` : "";

      const mWinner=done && winner===actual.winner;
      const mMethod=done && mWinner && method===actual.method;
      const mRound =done && mWinner && mMethod && method!=="Decision" && String(round)===String(actual.round);

      let score=0;
      if(mWinner){ score+=3; if(mMethod){score+=2; if(mRound) score+=1;} if(dogInline) score+=dogTier; }
      total+=score;

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

  // ===== Weekly Leaderboard (tight columns; centered hint; first/last themes) =====
  async function loadLeaderboard(){
    if(!leaderboardCache) leaderboardCache = await api.getLeaderboard();

    const fights = fightsCache || (await api.getFights());
    const lb = leaderboardCache || {};

    leaderboardEl.innerHTML="";

    const resultsArr=Object.values(lb.fightResults||{});
    const resultsStarted=resultsArr.some(r=>r && r.winner && r.method);
    let scores=Object.entries(lb.scores||{}).sort((a,b)=> b[1]-a[1]);

    // sticky weekly
    if(scores.length===0 && !resultsStarted){
      const prev=jget(localStorage.getItem("prevWeeklyScoresV8"),null);
      if(Array.isArray(prev)&&prev.length) scores=prev;
    }

    if(scores.length===0){
      leaderboardEl.appendChild(el("li","board-hint","Weekly standings will appear once results start."));
    } else {
      let rank=1, prevPts=null, shown=1;
      scores.forEach(([user,pts],idx)=>{
        if(pts!==prevPts) shown=rank;
        const isFirst = (idx===0);
        const isLast  = (scores.length>=3 && idx===scores.length-1);

        // exactly one crown LEFT of first place name
        const crown = isFirst ? `<span aria-hidden="true">👑</span>` : "";
        const poop  = isLast ? " 💩" : "";
        const rowCls = `${isFirst?'row-first ':''}${isLast?'row-last ':''}`;

        const li=el("li", rowCls, `
          <span>#${shown}</span>
          <span class="name">${crown} ${esc(user)}</span>
          <span class="points">${pts} pts${poop}</span>
        `);
        if(user===username) li.classList.add("current-user");
        leaderboardEl.appendChild(li);

        prevPts=pts; rank++;
      });
    }

    // Champ banner (bigger, shimmer)
    const totalFights=(fights||[]).length;
    const completed=resultsArr.filter(r=>r && r.winner && r.method && (r.method==="Decision" || (r.round && r.round!=="N/A"))).length;
    const haveMsg= typeof lb.champMessage==="string" && lb.champMessage.trim()!=="";
    const haveChamps= Array.isArray(lb.champs) && lb.champs.length>0;

    if(totalFights>0 && completed===totalFights && (haveMsg||haveChamps) && (scores.length>0)){
      const msg = haveMsg ? lb.champMessage.trim() : `Champion${lb.champs.length>1?'s':''} of the Week: ${lb.champs.join(', ')}`;
      localStorage.setItem("prevWeeklyScoresV8", JSON.stringify(scores));
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
    return `<div class="scroll" aria-label="Champion of the Week">${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}&nbsp;&nbsp;${item}</div>`;
  }

  // ===== All-time helpers =====
  function normalizeHall(rows){
    if(!Array.isArray(rows)) return [];
    return rows.map(r=>({
      username: r.username || r.user || "",
      crowns: +r.crowns || 0,
      crown_rate: +r.crown_rate || 0,
      events_played: +r.events_played || 0
    }));
  }
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
    if(!data.length){ allTimeList.innerHTML="<li class='board-hint'>No All-Time data yet.</li>"; return; }
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
      `);
      allTimeList.appendChild(li);
      prev=r;
    });
  }

  // tabs
  weeklyTabBtn.addEventListener("click", e=>{
    e.preventDefault();
    leaderboardEl.style.display="block"; allTimeList.style.display="none";
    weeklyTabBtn.setAttribute("aria-pressed","true"); allTimeTabBtn.setAttribute("aria-pressed","false");
  });
  allTimeTabBtn.addEventListener("click", async e=>{
    e.preventDefault();
    if(!allTimeCache){ try{ allTimeCache = normalizeHall(await api.getHall()); }catch{} }
    drawAllTime(sortAllTime(allTimeCache||[]));
    leaderboardEl.style.display="none"; allTimeList.style.display="block";
    weeklyTabBtn.setAttribute("aria-pressed","false"); allTimeTabBtn.setAttribute("aria-pressed","true");
  });

});
