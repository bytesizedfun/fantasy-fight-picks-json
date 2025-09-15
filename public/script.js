const API_BASE = "/api";
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

const el = {
  debug: document.getElementById("debugBanner"),
  champ: document.getElementById("champBanner"),
  username: document.getElementById("username"),
  submit: document.getElementById("submitBtn"),
  clear: document.getElementById("clearBtn"),
  cardList: document.getElementById("cardList"),
  picks: document.getElementById("yourPicks"),
  board: document.getElementById("leaderboard"),
  boardAll: document.getElementById("leaderboardAllTime"),
  tooltip: document.getElementById("tooltip"),
  countdown: document.getElementById("refreshCountdown"),
  welcome: document.getElementById("welcome")
};

const TOOLTIP = {
  Winner: "+1 for choosing the winner",
  Method: "+1 for correct method if winner is also correct",
  Round:  "+1 for correct round if Winner & Method are correct, and the fight did NOT go to Decision",
  Underdog: "+2 bonus for underdog win"
};

function showDebug(msg){ if(el.debug){ el.debug.textContent = msg; el.debug.style.display = "block"; } }
function hideDebug(){ if(el.debug) el.debug.style.display = "none"; }
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]); }

document.addEventListener("click", (e)=>{
  const t = e.target;
  if(!(t.classList.contains("tip"))) return;
  const copy = TOOLTIP[t.dataset.tip] || "";
  const rect = t.getBoundingClientRect();
  el.tooltip.textContent = copy;
  el.tooltip.style.left = rect.left + "px";
  el.tooltip.style.top = (rect.bottom + 8 + window.scrollY) + "px";
  el.tooltip.style.display = "block";
  setTimeout(()=>{ el.tooltip.style.display="none"; }, 2600);
});

// Local store
const store = {
  picks: JSON.parse(localStorage.getItem("ffp_picks")||"{}") || {},
  fights: [],
  results: [],
  champions: [],
  status: null,
  username: localStorage.getItem("ffp_username") || ""
};
if(store.username) el.username.value = store.username;

// API
const api = {
  async post(action, payload={}) {
    const r = await fetch(API_BASE, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ action, ...payload })});
    if(!r.ok) throw new Error(`API ${action} failed ${r.status}`);
    return r.json();
  },
  getStatus() { return this.post("getStatus"); },
  getCard() { return this.post("getCard"); },
  getResults() { return this.post("getResults"); },
  getLeaderboard() { return this.post("getLeaderboard"); },
  getAllTimeLeaderboard(){ return this.post("getAllTimeLeaderboard"); },
  submitPicks(username, picks){ return this.post("submitPicks", { username, picks }); },
  getChampionBanner(){ return this.post("getChampionBanner"); }
};

// Rendering
function renderCard(){
  el.cardList.innerHTML = "";
  const frag = document.createDocumentFragment();
  store.fights.forEach(f=>{
    const card = document.createElement("div");
    card.className = "card";
    const u = (f.underdog==="Fighter 1"||f.underdog==="Fighter1")?1:(f.underdog==="Fighter 2"||f.underdog==="Fighter2")?2:0;
    const f1Label = `${escapeHtml(f.f1||"")}${u===1?" 🐶":""}`;
    const f2Label = `${escapeHtml(f.f2||"")}${u===2?" 🐶":""}`;
    card.innerHTML = `
      <div class="fight-row">
        <div>
          <div class="fname">${escapeHtml(f.fight||"")}</div>
        </div>
        <div>
          <select class="select winner">
            <option value="">Pick winner</option>
            <option value="Fighter 1">${f1Label}</option>
            <option value="Fighter 2">${f2Label}</option>
          </select>
        </div>
        <div>
          <select class="select-method">
            <option value="Decision">Decision</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
          </select>
        </div>
        <div>
          <select class="select-round">
            <option value="">N/A</option>
            <option value="1">R1</option>
            <option value="2">R2</option>
            <option value="3">R3</option>
            <option value="4">R4</option>
            <option value="5">R5</option>
          </select>
        </div>
      </div>
    `;
    const winSel = card.querySelector(".winner");
    const metSel = card.querySelector(".select-method");
    const rndSel = card.querySelector(".select-round");

    const p = store.picks[f.fight] || {};
    if(p.winner) winSel.value = p.winner;
    if(p.method) metSel.value = p.method;
    if(p.round)  rndSel.value  = p.round;

    const save = ()=>{
      if(metSel.value==="Decision" && rndSel.value) rndSel.value="";
      store.picks[f.fight] = { winner: winSel.value, method: metSel.value, round: metSel.value==="Decision" ? "" : (rndSel.value||"") };
      localStorage.setItem("ffp_picks", JSON.stringify(store.picks));
      renderYourPicks();
    };
    winSel.addEventListener("change", save);
    metSel.addEventListener("change", save);
    rndSel.addEventListener("change", save);
    frag.appendChild(card);
  });
  el.cardList.appendChild(frag);
}

function computePointsForFight(pick, result, underdog){
  if(!result || !pick || !pick.winner) return { pts:0, flags:{} };
  let pts = 0; const flags={winner:false,method:false,round:false,underdog:false};
  if (pick.winner===result.winner){
    pts+=1; flags.winner=true;
    if (pick.method===result.method){
      pts+=1; flags.method=true;
      if (result.method!=="Decision" && pick.round && pick.round===String(result.round||"")){
        pts+=1; flags.round=true;
      }
    }
    if (underdog && pick.winner===underdog){ pts+=2; flags.underdog=true; }
  }
  return { pts, flags };
}

function renderYourPicks(){
  el.picks.innerHTML = "";
  const frag = document.createDocumentFragment();
  const rMap = Object.fromEntries(store.results.map(r=>[r.fight, r]));
  store.fights.forEach(f=>{
    const p = store.picks[f.fight] || {};
    const r = rMap[f.fight];
    const u = (f.underdog==="Fighter 1"||f.underdog==="Fighter1")?"Fighter 1":(f.underdog==="Fighter 2"||f.underdog==="Fighter2")?"Fighter 2":"";
    let cls={winner:"",method:"",round:""}, ptsDisp="";
    if(r && r.winner){
      const { pts, flags } = computePointsForFight(p, r, u);
      ptsDisp=`+${pts}`;
      cls.winner = p.winner ? (flags.winner?"correct":"incorrect") : "";
      cls.method = p.method ? (flags.method?"correct":(flags.winner?"incorrect":"")) : "";
      cls.round  = p.round  ? (flags.round ?"correct":(flags.method?"incorrect":"")) : "";
    }
    const f1Label = `${escapeHtml(f.f1||"")}${u==="Fighter 1"?" 🐶":""}`;
    const f2Label = `${escapeHtml(f.f2||"")}${u==="Fighter 2"?" 🐶":""}`;
    const chosen = p.winner==="Fighter 1" ? f1Label : p.winner==="Fighter 2" ? f2Label : "—";

    const row = document.createElement("div");
    row.className = "card pick";
    row.innerHTML = `
      <div class="fname">${escapeHtml(f.fight||"")}</div>
      <div class="${cls.winner}">${chosen}</div>
      <div class="${cls.method}">${escapeHtml(p.method||"—")}</div>
      <div class="${cls.round}">${p.method==="Decision" ? "N/A" : escapeHtml(p.round||"—")}</div>
      <div class="points">${ptsDisp}</div>
    `;
    frag.appendChild(row);
  });
  el.picks.appendChild(frag);
}

function computeRanks(rows){
  const sorted = [...rows].sort((a,b)=> b.points - a.points || a.username.localeCompare(b.username));
  let lastPts=null,lastRank=0,idx=0;
  return sorted.map(r=>{ idx++; if(r.points!==lastPts){ lastRank=idx; lastPts=r.points; } return { ...r, rank:lastRank }; });
}

function renderBoard(data, target){
  const elTarget = target || el.board;
  elTarget.innerHTML = "";
  const frag = document.createDocumentFragment();
  const ranks = computeRanks(data.rows||[]);
  const me = (el.username.value||"").trim().toLowerCase();
  ranks.forEach(r=>{
    const row = document.createElement("div");
    const isFirst = r.rank===1;
    const lastRankVal = ranks.length ? ranks[ranks.length-1].rank : r.rank;
    const isLast = r.rank===lastRankVal;
    row.className = `row ${isFirst?"first":""} ${isLast?"last":""}`;
    const nameCls = r.username.toLowerCase()===me ? "name me":"name";
    row.innerHTML = `
      <div class="rank">${r.rank}</div>
      <div class="${nameCls}">
        ${escapeHtml(r.username)}${isFirst ? ` <span class="crown">👑</span>` : ""}
      </div>
      <div class="points">${r.points}</div>
    `;
    frag.appendChild(row);
  });
  elTarget.appendChild(frag);
}

function renderChampionBanner(){
  if (!Array.isArray(store.champions) || store.champions.length===0) {
    el.champ.style.display="none"; return;
  }
  const names = store.champions.map(c=>c.username).filter(Boolean);
  if (!names.length){ el.champ.style.display="none"; return; }
  const msg = `Champion of the Week: ${names.join(" & ")}`;
  el.champ.innerHTML = `<span class="scroll">${escapeHtml(msg)} 👑&nbsp;&nbsp;&nbsp;${escapeHtml(msg)} 👑</span>`;
  el.champ.style.display="block";
}

// Actions
async function refreshAll(){
  hideDebug();
  try{
    const [status, card, results, board, champs, alltime] = await Promise.all([
      api.getStatus(), api.getCard(), api.getResults(), api.getLeaderboard(), api.getChampionBanner(), api.getAllTimeLeaderboard()
    ]);
    store.status = status || null;
    store.fights = card || [];
    store.results = results || [];
    store.champions = (champs && champs.champions) ? champs.champions : [];
    renderCard();
    renderYourPicks();
    renderBoard({ rows: (board && board.rows) || [] }, el.board);
    renderBoard({ rows: (alltime && alltime.rows ? alltime.rows.map(r=>({ username:r.username, points:r.total_points })) : []) }, el.boardAll);

    // Locks/UI
    const locked = !!(status && status.event && status.event.lock_time && new Date(status.event.lock_time) <= new Date());
    el.submit.disabled = locked;
    el.submit.textContent = locked ? "Picks Locked" : "Submit Picks";

    renderChampionBanner();

    const name = (el.username.value||"").trim();
    el.welcome.textContent = name ? `🎤 IIIIIIIIIIIIT’S ${name.toUpperCase()}!` : "";
  }catch(e){
    showDebug(String(e.message||e));
  }
}

async function doSubmit(){
  const user = (el.username.value||"").trim();
  if(!user){ alert("Enter your username first."); return; }
  if(!Object.keys(store.picks).length){ alert("Make some picks first."); return; }
  try{
    const res = await api.submitPicks(user, store.picks);
    if(res && res.ok){ localStorage.setItem("ffp_username", user); alert("Picks submitted!"); await refreshAll(); }
    else alert(res?.error || "Submit failed.");
  }catch(e){ alert("Submit failed."); showDebug(String(e.message||e)); }
}
function doClear(){
  store.picks={}; localStorage.removeItem("ffp_picks"); renderYourPicks(); renderCard();
}

// Countdown (5 min)
let remaining = REFRESH_MS/1000, timer = null, refresher = null;
function tick(){
  remaining--;
  if(remaining<=0){ remaining = REFRESH_MS/1000; refreshAll(); }
  const m = String(Math.floor(remaining/60)).padStart(2,"0");
  const s = String(remaining%60).padStart(2,"0");
  el.countdown.textContent = `(auto-updates · next in ${m}:${s})`;
}

el.submit.addEventListener("click", doSubmit);
el.clear.addEventListener("click", doClear);

// Boot
refreshAll().then(()=>{
  remaining = REFRESH_MS/1000;
  timer = setInterval(tick, 1000);
  refresher = setInterval(()=>{ remaining = REFRESH_MS/1000; }, REFRESH_MS); // keep countdown in sync
});
