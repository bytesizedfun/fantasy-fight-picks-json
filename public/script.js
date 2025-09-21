/* Fantasy Fight Picks — frontend (per-user lock after submit, robust submit) */

(() => {
  // ---- DOM refs
  const q = (sel) => document.querySelector(sel);
  const fightsList   = q('#fightsList');
  const yourPicks    = q('#yourPicks');
  const lbBody       = q('#lbBody');
  const champList    = q('#champList');
  const debugBanner  = q('#debugBanner');
  const statusText   = q('#statusText');
  const lockoutText  = q('#lockoutText');
  const eventUrlEl   = q('#eventUrl');
  const usernameInput= q('#usernameInput');
  const pinInput     = q('#pinInput');
  const saveUserBtn  = q('#saveUserBtn');
  const submitBtn    = q('#submitBtn');
  const submitHint   = q('#submitHint');

  // required globals from index.html
  if (typeof API_BASE === 'undefined') console.error('API_BASE missing in index.html');
  if (typeof LS_USER === 'undefined')  console.error('LS_USER missing in index.html');
  if (typeof LS_PIN === 'undefined')   console.error('LS_PIN missing in index.html');

  const API = (action) => `${API_BASE}?action=${encodeURIComponent(action)}`;

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
  function isNumericPin(s){ return /^\d{4}$/.test(String(s||'')); }
  function escapeHtml(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function hashKey(s){ let h=0,str=String(s||''); for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))|0;} return Math.abs(h).toString(36); }

  // ---- Scoring helpers
  function computeDogBonus(odds){ const o=Number(odds||0); if(o<100) return 0; return Math.floor((o-100)/100)+1; }
  function dogBonusForPick(f, pickedWinner){ if(pickedWinner===f.fighter1) return computeDogBonus(f.oddsF1); if(pickedWinner===f.fighter2) return computeDogBonus(f.oddsF2); return 0; }
  function resultForFight(key){ return results.find(r=> r.fight===key); }
  function fightByKey(key){ return fights.find(f=> f.fight===key); }

  // ---- Lock UI helper
  function applyLockState() {
    const shouldDisable = eventLocked || userLocked;
    submitBtn.disabled = shouldDisable;
    fightsList.querySelectorAll('select').forEach(sel => sel.disabled = shouldDisable);
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
      const f = fightByKey(k);
      const r = resultForFight(k);
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
    const username = (usernameInput.value || lsGet(LS_USER,'')).trim();
    if (!username) { userLocked = false; applyLockState(); return; }
    try {
      const state = await getJSON(API('getuserlock') + `&username=${encodeURIComponent(username)}`);
      // Lock only if they already submitted; event lock is handled via meta/status
      userLocked = !!state.locked && state.reason === 'submitted';
    } catch (e) {
      // don’t falsely lock if endpoint fails
      userLocked = false;
      showDebug(String(e.message||e));
    }
    applyLockState();
  }

  // ---- Bind UI
  function bindInputs(){
    saveUserBtn.addEventListener('click', ()=>{
      const u = (usernameInput.value||'').trim();
      const p = String(pinInput.value||'').trim();
      if(!u){ showDebug('Enter a username.'); return; }
      if(!isNumericPin(p)){ showDebug('PIN must be 4 digits.'); return; }
      hideDebug(); lsSet(LS_USER,u); lsSet(LS_PIN,p);
      refreshUserLock();
    });

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

      const username = (usernameInput.value || lsGet(LS_USER,'')).trim();
      const pin = String(pinInput.value || lsGet(LS_PIN,'')).trim();
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
        const res = await postJSON(API_BASE, { action:'submitpicks', username, pin, picks:picksPayload });
        if (!res || res.ok !== true) throw new Error(res && res.error ? res.error : 'Submit failed');
        hideDebug();
        lsSet(LS_USER, username);
        lsSet(LS_PIN, pin);
        userLocked = true;           // lock for this user after success
        applyLockState();
        await refreshAll();          // refresh scores/results/etc.
        submitBtn.textContent = 'Saved ✔';
        setTimeout(() => { submitBtn.textContent = oldText; /* keep disabled (userLocked) */ }, 900);
      }catch(err){
        showDebug(String(err.message||err));
        submitBtn.textContent = oldText;
        submitBtn.disabled = eventLocked || userLocked;
      }
    });
  }

  // ---- Data fetch
  async function refreshMeta(){ meta = await getJSON(API('getmeta')); renderMeta(); }
  async function refreshFights(){
    const data = await getJSON(API('getfights'));
    fights = Array.isArray(data) ? data : [];
    if (!Array.isArray(data)) showDebug(`getfights returned non-array; backend not deployed? Raw: ${JSON.stringify(data).slice(0,200)}`);
    renderFights();
    prunePicks();
  }
  async function refreshResults(){ results = await getJSON(API('getresults')); }
  async function refreshLeaderboard(){ const rows = await getJSON(API('getleaderboard')); renderLeaderboard(rows); }
  async function refreshChampions(){ const rows = await getJSON(API('getchampion')); renderChampions(rows); }
  function prunePicks(){ const valid = new Set(fights.map(f=> f.fight)); Object.keys(picksState).forEach(k=>{ if(!valid.has(k)) delete picksState[k]; }); }

  async function refreshAll(){
    try{
      await refreshMeta();
      await refreshUserLock();
      await Promise.all([ refreshFights(), refreshResults(), refreshLeaderboard(), refreshChampions() ]);
      renderYourPicks(); hideDebug();
    }catch(err){ showDebug(String(err.message||err)); }
  }

  // ---- Init
  function prefillUser(){
    const u = lsGet(LS_USER,''); const p = lsGet(LS_PIN,'');
    if(u) usernameInput.value = u; if(p) pinInput.value = p;
  }

  bindInputs();
  prefillUser();
  refreshAll();
  setInterval(refreshAll, 60000);
})();
