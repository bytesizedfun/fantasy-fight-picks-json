/* Fantasy Fight Picks — frontend (per-user lock after submit, robust submit, proxied via /api/*)
   Auth UI hides PIN & shows Welcome after save; NEW: once user is locked (submitted), hide Make Picks panel. */

(() => {
  // ---- DOM refs (some re-queried after auth rerender)
  const q = (sel) => document.querySelector(sel);
  const makePicksPanel = q('#makePicksPanel');
  const yourPicksPanel = q('#yourPicksPanel');
  const fightsList   = q('#fightsList');
  const yourPicks    = q('#yourPicks');
  const lbBody       = q('#lbBody');
  const champList    = q('#champList');
  const debugBanner  = q('#debugBanner');
  const statusText   = q('#statusText');
  const lockoutText  = q('#lockoutText');
  const eventUrlEl   = q('#eventUrl');
  const authPanel    = q('#authPanel');
  let usernameInput  = q('#usernameInput');
  let pinInput       = q('#pinInput');
  let saveUserBtn    = q('#saveUserBtn');
  const submitBtn    = q('#submitBtn');
  const submitHint   = q('#submitHint');

  // required globals
  if (typeof LS_USER === 'undefined')  console.error('LS_USER missing in index.html');
  if (typeof LS_PIN === 'undefined')   console.error('LS_PIN missing in index.html');

  // ---- API endpoints (proxy on same origin)
  const API = {
    meta: '/api/meta',
    fights: '/api/fights',
    results: '/api/results',
    leaderboard: '/api/leaderboard',
    champion: '/api/champion',
    userlock: (u) => `/api/userlock?username=${encodeURIComponent(u)}`,
    submit: '/api/submitpicks'
  };

  // ---- State
  let meta = null;
  let fights = [];
  let results = [];
  let picksState = {};
  let eventLocked = false;
  let userLocked = false;  // locked AFTER first submit

  const METHOD_OPTIONS = ['KO/TKO', 'Submission', 'Decision'];

  // ---- Utils
  function showDebug(msg){
    if(!debugBanner) return;
    debugBanner.textContent = String(msg || '');
    debugBanner.style.display = 'block';
  }
  function hideDebug(){ if(!debugBanner) return; debugBanner.style.display = 'none'; }
  async function getJSON(url){
    const r = await fetch(url, { cache:'no-store' });
    const txt = await r.text();
    if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${txt.slice(0,200)}`);
    try { return JSON.parse(txt); } catch { throw new Error(`GET ${url} returned non-JSON: ${txt.slice(0,200)}`); }
  }
  async function postJSON(url, body){
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    const txt = await r.text();
    if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${txt.slice(0,200)}`);
    try { return JSON.parse(txt); } catch { throw new Error(`POST ${url} returned non-JSON: ${txt.slice(0,200)}`); }
  }
  function lsGet(k, def=''){ try{ return localStorage.getItem(k) ?? def; }catch{ return def; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }
  function isNumericPin(s){ return /^\d{4}$/.test(String(s||'')); }
  function escapeHtml(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function hashKey(s){ let h=0,str=String(s||''); for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))|0;} return Math.abs(h).toString(36); }

  // ---- Auth helpers
  function isAuthed(){
    const u = lsGet(LS_USER,'').trim();
    const p = lsGet(LS_PIN,'').trim();
    return !!u && isNumericPin(p);
  }
  function currentUsername(){
    const uStored = lsGet(LS_USER,'').trim();
    if (uStored) return uStored;
    const uInput = usernameInput ? String(usernameInput.value||'').trim() : '';
    return uInput;
  }
  function currentPin(){
    const pStored = lsGet(LS_PIN,'').trim();
    if (isNumericPin(pStored)) return pStored;
    const pInput = pinInput ? String(pinInput.value||'').trim() : '';
    return pInput;
  }
  function bindAuthFormHandlers(){
    usernameInput = q('#usernameInput');
    pinInput = q('#pinInput');
    saveUserBtn = q('#saveUserBtn');

    if (saveUserBtn) {
      saveUserBtn.addEventListener('click', ()=>{
        const u = (usernameInput?.value || '').trim();
        const p = String(pinInput?.value || '').trim();
        if(!u){ showDebug('Enter a username.'); return; }
        if(!isNumericPin(p)){ showDebug('PIN must be 4 digits.'); return; }
        hideDebug(); lsSet(LS_USER,u); lsSet(LS_PIN,p);
        updateAuthUI();
        refreshUserLock();
      });
    }

    const signOutBtn = q('#signOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', ()=>{
        lsDel(LS_USER);
        lsDel(LS_PIN);
        userLocked = false;
        updateAuthUI();
        applyLockState();
      });
    }
  }
  function updateAuthUI(){
    if (!authPanel) return;

    if (isAuthed()) {
      const u = escapeHtml(lsGet(LS_USER,''));
      authPanel.innerHTML = `
        <div class="section-title">Welcome</div>
        <div class="row" style="align-items:center;">
          <div style="flex:1 1 auto;">Welcome, <strong>${u}</strong> 👋</div>
          <div style="flex:0 0 auto;"><button id="signOutBtn">Sign out</button></div>
        </div>
        <div class="tiny">You’re signed in. Your PIN is stored locally and never shown.</div>
      `;
    } else {
      authPanel.innerHTML = `
        <div class="section-title">Sign in</div>
        <div class="row">
          <div>
            <div class="label">Username</div>
            <input id="usernameInput" type="text" inputmode="text" autocomplete="username" placeholder="e.g., Josh" />
          </div>
          <div>
            <div class="label">4-digit PIN</div>
            <input id="pinInput" type="number" inputmode="numeric" pattern="\\d{4}" placeholder="1234" />
          </div>
          <div style="flex:0 0 auto; align-self:end;">
            <button id="saveUserBtn" class="primary">Save</button>
          </div>
        </div>
        <div class="tiny">Saved locally so you don’t re-enter each time.</div>
      `;
    }
    bindAuthFormHandlers();
  }

  // ---- Scoring helpers
  function computeDogBonus(odds){ const o=Number(odds||0); if(o<100) return 0; return Math.floor((o-100)/100)+1; }
  function dogBonusForPick(f, pickedWinner){ if(pickedWinner===f.fighter1) return computeDogBonus(f.oddsF1); if(pickedWinner===f.fighter2) return computeDogBonus(f.oddsF2); return 0; }
  function resultForFight(key){ return results.find(r=> r.fight===key); }
  function fightByKey(key){ return fights.find(f=> f.fight===key); }

  // ---- Lock/UI state (UPDATED to hide Make Picks after submit)
  function applyLockState() {
    const shouldDisable = eventLocked || userLocked;
    // Disable inputs when locked by event or user
    fightsList.querySelectorAll('select').forEach(sel => sel.disabled = shouldDisable);
    if (submitBtn) submitBtn.disabled = shouldDisable;

    // Panel visibility rule: once user has submitted (userLocked), hide Make Picks panel
    if (makePicksPanel) makePicksPanel.style.display = userLocked ? 'none' : '';
    if (yourPicksPanel) yourPicksPanel.style.display = ''; // always visible

    // Hint text updates
    if (submitHint) {
      if (eventLocked) submitHint.textContent = 'Event is locked — no new submissions.';
      else if (userLocked) submitHint.textContent = 'Your picks are locked (already submitted).';
      else submitHint.textContent = 'Picks lock at event start. Submitting locks your picks.';
    }
  }

  // ---- Meta
  function renderMeta(){
    if(!meta) return;
    statusText.textContent = `status: ${meta.status || 'open'}`;
    lockoutText.textContent = `lockout: ${meta.lockout_iso || 'unset'}`;
    if(meta.url){ eventUrlEl.innerHTML = `Event: <a href="${meta.url}" target="_blank" rel="noopener">UFCStats</a>`; }
    else { eventUrlEl.textContent=''; }
    eventLocked = (String(meta.status||'').toLowerCase() !== 'open');
    applyLockState();
  }

  // ---- Fights (pickers)
  function labelWithDog(name, dogN){ return dogN>0 ? `${name} (🐶 +${dogN})` : name; }
  function buildFightRow(f){
    const key = f.fight;
    const dog1 = f.dogF1 || 0, dog2 = f.dogF2 || 0;
    const selWinnerId = `w_${hashKey(key)}`;
    const selMethodId = `m_${hashKey(key)}`;
    const selRoundId  = `r_${hashKey(key)}`;
    const p = picksState[key] || {};
    const winnerVal = p.winner || '';
    const methodVal = p.method || '';
    const roundVal  = p.round  || '';
    const roundsN = Number(f.rounds||3);
    const roundDisabled = methodVal === 'Decision';
    let roundOpts = `<option value="">Round</option>`;
    for(let i=1;i<=roundsN;i++){ const sel=String(roundVal)===String(i)?'selected':''; roundOpts += `<option value="${i}" ${sel}>${i}</option>`; }

    return `
      <div class="fight" data-key="${escapeHtml(key)}">
        <div class="name">${escapeHtml(key)}</div>
        <div class="grid">
          <div>
            <div class="label">Winner</div>
            <select id="${selWinnerId}">
              <option value="">Select winner</option>
              <option value="${escapeHtml(f.fighter1)}" ${winnerVal===f.fighter1?'selected':''}>${escapeHtml(labelWithDog(f.fighter1,dog1))}</option>
              <option value="${escapeHtml(f.fighter2)}" ${winnerVal===f.fighter2?'selected':''}>${escapeHtml(labelWithDog(f.fighter2,dog2))}</option>
            </select>
          </div>
          <div>
            <div class="label">Method</div>
            <select id="${selMethodId}">
              <option value="">Select method</option>
              ${METHOD_OPTIONS.map(m=>`<option value="${m}" ${methodVal===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="label">Round</div>
            <select id="${selRoundId}" ${roundDisabled?'disabled':''}>
              ${roundOpts}
            </select>
          </div>
          <div style="align-self:end;">
            <span class="tag">Best of ${roundsN} ${roundsN===5?'(Main Event)':''}</span>
          </div>
        </div>
      </div>
    `;
  }
  function renderFights(){
    if (!Array.isArray(fights)) {
      showDebug(`getfights did not return an array`);
      fightsList.innerHTML = '';
      return;
    }
    fightsList.innerHTML = fights.map(buildFightRow).join('');
    applyLockState();
  }

  // ---- Your Picks
  function renderYourPicks(){
    const keys = Object.keys(picksState);
    if(!keys.length){ yourPicks.innerHTML = `<div class="tiny">No picks yet.</div>`; return; }
    const rows=[];
    for(const k of keys){
      const p = picksState[k];
      const f = fights.find(x=> x.fight===k);
      const r = results.find(x=> x.fight===k);
      const dogN = (p && f) ? dogBonusForPick(f, p.winner) : 0;

      let bits=[], pts=0;
      if(r && r.finalized){
        const winnerOK = p.winner && p.winner===r.winner; bits.push(`Winner ${winnerOK?'✅':'❌'}`); if(winnerOK) pts+=1;
        const methodOK = winnerOK && p.method && p.method===r.method; bits.push(`Method ${methodOK?'✅':'❌'}`); if(methodOK) pts+=1;
        const roundOK  = methodOK && r.method!=='Decision' && String(p.round||'')===String(r.round||''); bits.push(`Round ${roundOK?'✅':'❌'}`); if(roundOK) pts+=1;
        if(winnerOK && dogN>0){ pts+=dogN; bits.push(`🐶+${dogN}`); }
      } else {
        bits = [`Winner —`,`Method —`,`Round —`];
        if(dogN>0) bits.push(`🐶+${dogN}`);
      }

      rows.push(`
        <div class="pick-line">
          <div>
            <div><strong>${escapeHtml(k)}</strong></div>
            <div class="tiny">
              ${escapeHtml(p.winner||'—')} • ${escapeHtml(p.method||'—')}${p.method==='Decision'?'':` • ${escapeHtml(p.round||'—')}`}${dogN>0?` • 🐶 +${dogN}`:''}
            </div>
          </div>
          <div class="right">
            <div>${bits.join(' • ')}</div>
            ${(r && r.finalized) ? `<div class="tiny">Points: ${pts}</div>` : ``}
          </div>
        </div>
      `);
    }
    yourPicks.innerHTML = rows.join('');
  }

  // ---- Leaderboard
  function renderLeaderboard(rows){
    if(!Array.isArray(rows) || !rows.length){
      lbBody.innerHTML = `<tr><td colspan="4" class="tiny">No scores yet.</td></tr>`;
      return;
    }
    lbBody.innerHTML = rows.map(r=>`
      <tr>
        <td class="center">${r.rank}</td>
        <td>${escapeHtml(r.username)}</td>
        <td class="center">${r.points}</td>
        <td class="tiny">${escapeHtml(r.details||'')}</td>
      </tr>
    `).join('');
  }

  // ---- Champions
  function renderChampions(list){
    if(!Array.isArray(list) || !list.length){
      champList.innerHTML = `<li class="tiny">No champion yet (shows when event completes)</li>`;
      return;
    }
    const lastDate = list[list.length-1]?.date || '';
    const recent = list.filter(x=> x.date===lastDate);
    champList.innerHTML = recent.map(c=> `<li>${escapeHtml(c.username)} — ${c.points} pts</li>`).join('');
  }

  // ---- User lock fetch
  async function refreshUserLock() {
    const username = currentUsername();
    if (!username) { userLocked = false; applyLockState(); return; }
    try {
      const state = await getJSON(API.userlock(username));
      userLocked = !!state.locked && state.reason === 'submitted';
    } catch (e) {
      userLocked = false;
      showDebug(String(e.message||e));
    }
    applyLockState();
  }

  // ---- Bind fights & submit
  function bindFightsAndSubmit(){
    fightsList.addEventListener('change', (ev)=>{
      const el = ev.target;
      const fightEl = el.closest('.fight'); if(!fightEl) return;
      const key = fightEl.dataset.key;
      picksState[key] = picksState[key] || { winner:'', method:'', round:'' };

      if(el.id.startsWith('w_')){ picksState[key].winner = el.value; }
      else if(el.id.startsWith('m_')){
        picksState[key].method = el.value;
        const roundSel = fightEl.querySelector('select[id^="r_"]');
        if(roundSel){ const isDec = el.value==='Decision'; roundSel.disabled = isDec; if(isDec) roundSel.value=''; }
      } else if(el.id.startsWith('r_')){ picksState[key].round = el.value; }

      renderYourPicks();
    });

    submitBtn.addEventListener('click', async () => {
      if (eventLocked) { showDebug('Event is locked — no new submissions.'); return; }
      if (userLocked) { showDebug('Your picks are locked (already submitted).'); return; }

      const username = currentUsername();
      const pin = currentPin();
      if(!username){ showDebug('Enter a username.'); return; }
      if(!isNumericPin(pin)){ showDebug('PIN must be 4 digits.'); return; }

      const picksPayload = Object.entries(picksState)
        .filter(([_,v])=> v && v.winner)
        .map(([fight, v])=> ({
          fight,
          winner: v.winner,
          method: METHOD_OPTIONS.includes(v.method) ? v.method : 'Decision',
          round: (v.method === 'Decision') ? '' : (v.round || '')
        }));
      if(!picksPayload.length){ showDebug('No picks to submit.'); return; }

      const oldText = submitBtn.textContent;
      submitBtn.textContent = 'Submitting…';
      submitBtn.disabled = true;

      try{
        const res = await postJSON(API.submit, { username, pin, picks: picksPayload });
        if (!res || res.ok !== true) throw new Error(res && res.error ? res.error : 'Submit failed');
        hideDebug();
        lsSet(LS_USER, username);
        lsSet(LS_PIN, pin);
        userLocked = true;           // lock user after success
        applyLockState();            // <-- hides Make Picks panel now
        await refreshAll();
        submitBtn.textContent = 'Saved ✔';
        setTimeout(() => { submitBtn.textContent = oldText; }, 900);
        updateAuthUI();
      }catch(err){
        showDebug(String(err.message||err));
        submitBtn.textContent = oldText;
        submitBtn.disabled = eventLocked || userLocked;
      }
    });
  }

  // ---- Data fetch
  async function refreshMeta(){ meta = await getJSON(API.meta); renderMeta(); }
  async function refreshFights(){
    const data = await getJSON(API.fights);
    fights = Array.isArray(data) ? data : [];
    if (!Array.isArray(data)) showDebug(`getfights returned non-array; backend not deployed? Raw: ${JSON.stringify(data).slice(0,200)}`);
    renderFights();
    prunePicks();
  }
  async function refreshResults(){ results = await getJSON(API.results); }
  async function refreshLeaderboard(){ const rows = await getJSON(API.leaderboard); renderLeaderboard(rows); }
  async function refreshChampions(){ const rows = await getJSON(API.champion); renderChampions(rows); }
  function prunePicks(){ const valid = new Set(fights.map(f=> f.fight)); Object.keys(picksState).forEach(k=>{ if(!valid.has(k)) delete picksState[k]; }); }

  async function refreshAll(){
    try{
      await refreshMeta();
      await refreshUserLock();  // ensures panel visibility is correct on load
      await Promise.all([ refreshFights(), refreshResults(), refreshLeaderboard(), refreshChampions() ]);
      renderYourPicks(); hideDebug();
    }catch(err){ showDebug(String(err.message||err)); }
  }

  // ---- Init
  function prefillUser(){
    const u = lsGet(LS_USER,'');
    if (u && q('#usernameInput')) q('#usernameInput').value = u;
    // never prefill PIN
  }

  // Boot
  updateAuthUI();
  bindAuthFormHandlers();
  prefillUser();
  bindFightsAndSubmit();
  refreshAll();
  setInterval(refreshAll, 60000);
})();
