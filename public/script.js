/* Fantasy Fight Picks — frontend
   - Friendly lockout display (uses lockout_local if present; otherwise formats ISO in ET)
   - Reigning Champion(s) banner always shown if we have champs (most-recent event)
   - Auth panel simplified (single welcome line + Sign out)
   - Hide Make Picks after submit, but Your Picks always visible
   - Fight-key normalization so saved picks survive minor label edits
   - No redundant “Winner — • Method — • Round —” line pre-results
   - Leaderboard: highlight current user row (UI only)
*/

(() => {
  const q = (sel) => document.querySelector(sel);

  // Panels & DOM
  const makePicksPanel = q('#makePicksPanel');
  const yourPicksPanel = q('#yourPicksPanel');
  const fightsList   = q('#fightsList');
  const yourPicks    = q('#yourPicks');
  const lbBody       = q('#lbBody');
  const champBanner  = q('#champBanner');
  const champList    = q('#champList');
  const champWhen    = q('#champWhen');
  const debugBanner  = q('#debugBanner');
  const statusText   = q('#statusText');
  const lockoutText  = q('#lockoutText');
  const eventUrlEl   = q('#eventUrl'); // (not printed in this layout; kept for future link-in-header)
  const authPanel    = q('#authPanel');
  let usernameInput  = q('#usernameInput');
  let pinInput       = q('#pinInput');
  let saveUserBtn    = q('#saveUserBtn');
  const submitBtn    = q('#submitBtn');
  const submitHint   = q('#submitHint');

  // API (served by your Node proxy)
  const API = {
    meta: '/api/meta',
    fights: '/api/fights',
    results: '/api/results',
    leaderboard: '/api/leaderboard',
    champion: '/api/champion',
    userlock: (u) => `/api/userlock?username=${encodeURIComponent(u)}`,
    userpicks: (u) => `/api/userpicks?username=${encodeURIComponent(u)}`,
    submit: '/api/submitpicks'
  };

  // State
  let meta = null;
  let fights = [];
  let results = [];
  let champs = [];           // full list from backend (last 10 rows)
  let picksState = {};       // { [canonicalFightLabel]: { winner, method, round } }
  let eventLocked = false;
  let userLocked = false;

  // Fight key normalization
  const fightKeyMap = new Map(); // normKey -> canonical label
  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s:/-]+/g,'')
      .replace(/\bvs\b/g, 'vs')
      .trim();
  }
  function canonicalFor(label) {
    const n = normKey(label);
    return fightKeyMap.get(n) || label;
  }

  const METHOD_OPTIONS = ['KO/TKO', 'Submission', 'Decision'];

  // Utils
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

  // Auth helpers
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
      saveUserBtn.addEventListener('click', async ()=>{
        const u = (usernameInput?.value || '').trim();
        const p = String(pinInput?.value || '').trim();
        if(!u){ showDebug('Enter a username.'); return; }
        if(!isNumericPin(p)){ showDebug('PIN must be 4 digits.'); return; }
        hideDebug(); lsSet(LS_USER,u); lsSet(LS_PIN,p);
        updateAuthUI();
        await refreshUserLock();
        await hydrateUserPicksStrict();
      });
    }

    const signOutBtn = q('#signOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', ()=>{
        lsDel(LS_USER);
        lsDel(LS_PIN);
        userLocked = false;
        picksState = {};
        renderYourPicks();
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
        <div class="row" style="align-items:center;justify-content:space-between;">
          <div style="flex:1 1 auto;">Welcome, <strong>${u}</strong> 👋</div>
          <div style="flex:0 0 auto;"><button id="signOutBtn">Sign out</button></div>
        </div>
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

  // Scoring helpers
  function computeDogBonus(odds){ const o=Number(odds||0); if(o<100) return 0; return Math.floor((o-100)/100)+1; }
  function dogBonusForPick(f, pickedWinner){ if(pickedWinner===f.fighter1) return computeDogBonus(f.oddsF1); if(pickedWinner===f.fighter2) return computeDogBonus(f.oddsF2); return 0; }

  // Lock & visibility
  function applyLockState() {
    const shouldDisable = eventLocked || userLocked;
    fightsList.querySelectorAll('select').forEach(sel => sel.disabled = shouldDisable);
    if (submitBtn) submitBtn.disabled = shouldDisable;

    if (makePicksPanel) makePicksPanel.style.display = userLocked ? 'none' : '';
    if (yourPicksPanel) yourPicksPanel.style.display = '';
  }

  // Human-friendly lockout text: prefer lockout_local; else format ISO in ET
  function friendlyLockout(meta){
    const tz = 'America/Toronto';
    const local = String(meta.lockout_local || '').trim();
    if (local) return `${local} ET`;
    const iso = String(meta.lockout_iso || '').trim();
    if (!iso) return 'unset';
    try {
      const d = new Date(iso);
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, weekday: 'short', month: 'short', day: '2-digit',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      return `${fmt.format(d)} ET`;
    } catch {
      return iso; // fallback
    }
  }

  // Meta
  function renderMeta(){
    if(!meta) return;
    statusText.textContent = `status: ${meta.status || 'open'}`;
    lockoutText.textContent = `lockout: ${friendlyLockout(meta)}`;
    eventLocked = (String(meta.status||'').toLowerCase() !== 'open');
    applyLockState();
  }

  // Fights UI
  function labelWithDog(name, dogN){ return dogN>0 ? `${name} (🐶 +${dogN})` : name; }
  function buildFightRow(f){
    const key = f.fight; // canonical label
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

  // Your Picks
  function renderYourPicks(){
    const keys = Object.keys(picksState);
    if(!keys.length){ yourPicks.innerHTML = `<div class="tiny">No picks yet.</div>`; return; }
    const rows=[];
    for(const k of keys){
      const p = picksState[k];
      const f = fights.find(x=> x.fight===k);
      const r = results.find(x=> x.fight===k);
      const dogN = (p && f) ? dogBonusForPick(f, p.winner) : 0;

      let detailsHtml = '';
      if(r && r.finalized){
        // Only show checkmarks/points AFTER results finalize
        let bits=[], pts=0;
        const winnerOK = p.winner && p.winner===r.winner; bits.push(`Winner ${winnerOK?'✅':'❌'}`); if(winnerOK) pts+=1;
        const methodOK = winnerOK && p.method && p.method===r.method; bits.push(`Method ${methodOK?'✅':'❌'}`); if(methodOK) pts+=1;
        const roundOK  = methodOK && r.method!=='Decision' && String(p.round||'')===String(r.round||''); bits.push(`Round ${roundOK?'✅':'❌'}`); if(roundOK) pts+=1;
        if(winnerOK && dogN>0){ pts+=dogN; bits.push(`🐶+${dogN}`); }
        detailsHtml = `
          <div class="right">
            <div>${bits.join(' • ')}</div>
            <div class="tiny">Points: ${pts}</div>
          </div>
        `;
      } // else: no redundant “Winner —” line

      rows.push(`
        <div class="pick-line">
          <div>
            <div><strong>${escapeHtml(k)}</strong></div>
            <div class="tiny">
              ${escapeHtml(p.winner||'—')}${p.method?` • ${escapeHtml(p.method)}`:''}${(p.method && p.method!=='Decision' && p.round)?` • ${escapeHtml(p.round)}`:''}${dogN>0?` • 🐶 +${dogN}`:''}
            </div>
          </div>
          ${detailsHtml}
        </div>
      `);
    }
    yourPicks.innerHTML = rows.join('');
  }

  // Leaderboard
  function renderLeaderboard(rows){
    if(!Array.isArray(rows) || !rows.length){
      lbBody.innerHTML = `<tr><td colspan="4" class="tiny">No scores yet.</td></tr>`;
      return;
    }
    const me = (lsGet(LS_USER,'') || '').toLowerCase();
    lbBody.innerHTML = rows.map(r=>{
      const isMe = me && (String(r.username||'').toLowerCase()===me);
      return `
        <tr class="${isMe?'lb-me':''}">
          <td class="center rank">${r.rank}</td>
          <td>${escapeHtml(r.username)}</td>
          <td class="center pts">${r.points}</td>
          <td class="tiny">${escapeHtml(r.details||'')}</td>
        </tr>
      `;
    }).join('');
  }

  // Champions (ALWAYS show most-recent winners if any)
  function formatEt(dIso){
    try{
      const d = new Date(dIso);
      const fmt = new Intl.DateTimeFormat('en-CA',{
        timeZone:'America/Toronto', year:'numeric', month:'short', day:'2-digit'
      });
      return fmt.format(d);
    }catch{ return ''; }
  }
  function renderChampions(list){
    // list is last 10 rows (possibly from multiple events). We want the most recent date group.
    if(!Array.isArray(list) || !list.length){ if(champBanner) champBanner.style.display='none'; return; }

    const lastDate = list[list.length-1]?.date || '';
    const recent = list.filter(x=> x.date===lastDate);
    if (recent.length === 0) { champBanner.style.display='none'; return; }

    champList.innerHTML = recent.map(c=> `<li>${escapeHtml(c.username)} — ${c.points} pts</li>`).join('');
    champWhen.textContent = `Won on ${formatEt(lastDate)}`;
    champBanner.style.display = ''; // show the banner if we have at least one champ
  }

  // Backend hydration (STRICT)
  async function hydrateUserPicksStrict(){
    const u = currentUsername();
    if (!u) { renderYourPicks(); return; }
    try{
      const list = await getJSON(API.userpicks(u)); // [{fight,winner,method,round}]
      const next = {};
      if (Array.isArray(list)) {
        for (const row of list) {
          const incomingLabel = String(row.fight || '');
          if (!incomingLabel) continue;
          const canonical = canonicalFor(incomingLabel);
          next[canonical] = {
            winner: row.winner || '',
            method: METHOD_OPTIONS.includes(row.method) ? row.method : (row.winner ? 'Decision' : ''),
            round:  (row.method === 'Decision') ? '' : (row.round || '')
          };
        }
      }
      picksState = next;
    }catch(err){
      showDebug(`userpicks: ${String(err.message||err)}`);
      picksState = picksState || {};
    }
    renderYourPicks();
  }

  // Lock state from backend
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

  // Bind fights & submit
  function bindFightsAndSubmit(){
    fightsList.addEventListener('change', (ev)=>{
      const el = ev.target;
      const fightEl = el.closest('.fight'); if(!fightEl) return;
      const canonicalLabel = fightEl.dataset.key;
      picksState[canonicalLabel] = picksState[canonicalLabel] || { winner:'', method:'', round:'' };

      if(el.id.startsWith('w_')){ picksState[canonicalLabel].winner = el.value; }
      else if(el.id.startsWith('m_')){
        picksState[canonicalLabel].method = el.value;
        const roundSel = fightEl.querySelector('select[id^="r_"]');
        if(roundSel){ const isDec = el.value==='Decision'; roundSel.disabled = isDec; if(isDec) roundSel.value=''; }
      } else if(el.id.startsWith('r_')){ picksState[canonicalLabel].round = el.value; }

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
        .map(([fightLabel, v])=> ({
          fight: fightLabel,
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
        userLocked = true;
        applyLockState();               // hide Make Picks panel
        await refreshAll(false);        // light refresh
        await hydrateUserPicksStrict(); // re-hydrate after submit
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

  // Data fetchers
  async function refreshMeta(){ meta = await getJSON(API.meta); renderMeta(); }
  async function refreshFights(){
    const data = await getJSON(API.fights);
    fights = Array.isArray(data) ? data : [];

    // build canonical map
    fightKeyMap.clear();
    for (const f of fights) fightKeyMap.set(normKey(f.fight), f.fight);

    if (!Array.isArray(data)) showDebug(`getfights returned non-array; backend not deployed? Raw: ${JSON.stringify(data).slice(0,200)}`);
    renderFights();
    prunePicks();
  }
  async function refreshResults(){ results = await getJSON(API.results); }
  async function refreshLeaderboard(){ const rows = await getJSON(API.leaderboard); renderLeaderboard(rows); }
  async function refreshChampions(){ champs = await getJSON(API.champion); renderChampions(champs); }

  // Prune picks using canonical existence
  function prunePicks(){
    const next = {};
    for (const [label, val] of Object.entries(picksState)) {
      const canonical = canonicalFor(label);
      if (fightKeyMap.has(normKey(canonical))) next[canonical] = val;
    }
    picksState = next;
  }

  // Aggregate refresh; fullRefresh=false skips duplicate hydrations on submit
  async function refreshAll(fullRefresh = true){
    try{
      await refreshMeta();
      await refreshUserLock();
      await Promise.all([ refreshFights(), refreshResults(), refreshLeaderboard(), refreshChampions() ]);
      if (fullRefresh) await hydrateUserPicksStrict();
      if (fullRefresh) hideDebug();
    }catch(err){ showDebug(String(err.message||err)); }
  }

  // Init
  function prefillUser(){
    const u = lsGet(LS_USER,'');
    if (u && q('#usernameInput')) q('#usernameInput').value = u;
  }

  // Boot
  updateAuthUI();
  bindAuthFormHandlers();
  prefillUser();
  bindFightsAndSubmit();
  refreshAll();
  setInterval(refreshAll, 60000);
})();
