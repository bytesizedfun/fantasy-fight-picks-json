/* Fantasy Fight Picks — frontend (fight_id enabled, proxy-based)
   - Uses Render proxy /api/* (avoids GAS CORS + HTML redirects)
   - One-call bootstrap for fast first paint
   - Live refresh limited to results + leaderboard
*/

(() => {
  const q = (sel) => document.querySelector(sel);

  // ---- Local auth keys ----
  const LS_USER = 'ffp_user';
  const LS_PIN  = 'ffp_pin';

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
  const authPanel    = q('#authPanel');
  let usernameInput  = q('#usernameInput');
  let pinInput       = q('#pinInput');
  let saveUserBtn    = q('#saveUserBtn');
  const submitBtn    = q('#submitBtn');
  const submitHint   = q('#submitHint');

  // ---- API via Render proxy ----
  const API = {
    meta:        `/api/meta`,
    fights:      `/api/fights`,
    results:     `/api/results`,
    leaderboard: `/api/leaderboard`,
    champion:    `/api/champion`,
    userlock:    (u) => `/api/userlock?username=${encodeURIComponent(u || '')}`,
    userpicks:   (u) => `/api/userpicks?username=${encodeURIComponent(u || '')}`,
    submit:      `/api/submitpicks`,
    bootstrap:   (u) => `/api/bootstrap?username=${encodeURIComponent(u || '')}`
  };

  let meta = null;
  let fights = [];
  let results = [];
  let champs = [];
  // picksState keyed by canonical label; each entry keeps fight_id
  // { [fightLabel]: { fight_id, winner, method, round } }
  let picksState = {};
  let eventLocked = false;
  let userLocked = false;

  // Fight maps: label <-> id
  const fightKeyMap = new Map(); // normLabel -> canonical label
  const idByLabel = new Map();   // canonical label -> fight_id
  const labelById = new Map();   // fight_id -> canonical label

  const METHOD_OPTIONS = ['KO/TKO', 'Submission', 'Decision'];

  // Utils
  function showDebug(msg){ if(debugBanner){ debugBanner.textContent=String(msg||''); debugBanner.style.display='block'; } }
  function hideDebug(){ if(debugBanner){ debugBanner.style.display='none'; } }

  async function getJSON(url){
    const r = await fetch(url, { cache:'no-cache' });
    const t = await r.text();
    // Proxy always returns JSON. If upstream failed, it still JSON-encodes the error.
    try {
      const data = JSON.parse(t);
      if (!r.ok || data?.ok === false) {
        const msg = data?.error || `${r.status} ${r.statusText}`;
        throw new Error(msg);
      }
      return data;
    } catch (e) {
      throw new Error(`GET ${url} -> ${r.status} ${t.slice(0,200)}`);
    }
  }

  async function postJSON(url, body){
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    const t = await r.text();
    try {
      const data = JSON.parse(t);
      if (!r.ok || data?.ok === false) {
        const msg = data?.error || `${r.status} ${r.statusText}`;
        throw new Error(msg);
      }
      return data;
    } catch {
      throw new Error(`POST ${url} -> ${r.status} ${t.slice(0,200)}`);
    }
  }

  function lsGet(k, d=''){ try{ return localStorage.getItem(k) ?? d; }catch{ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }
  function isNumericPin(s){ return /^\d{4}$/.test(String(s||'')); }
  function escapeHtml(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function hashKey(s){ let h=0,str=String(s||''); for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))|0;} return Math.abs(h).toString(36); }
  function normKey(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[^\w\s:/-]+/g,'').replace(/\bvs\b/g,'vs').trim(); }

  // Auth
  function isAuthed(){ const u=lsGet(LS_USER,'').trim(); const p=lsGet(LS_PIN,'').trim(); return !!u && isNumericPin(p); }
  function currentUsername(){ return lsGet(LS_USER,'').trim() || String(usernameInput?.value||'').trim(); }
  function currentPin(){ const ps=lsGet(LS_PIN,'').trim(); return isNumericPin(ps)?ps:String(pinInput?.value||'').trim(); }

  function bindAuthFormHandlers(){
    usernameInput = q('#usernameInput');
    pinInput = q('#pinInput');
    saveUserBtn = q('#saveUserBtn');
    if (saveUserBtn) {
      saveUserBtn.addEventListener('click', async ()=>{
        const u = (usernameInput?.value||'').trim();
        const p = String(pinInput?.value||'').trim();
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
        lsDel(LS_USER); lsDel(LS_PIN);
        userLocked = false; picksState = {};
        renderYourPicks(); updateAuthUI(); applyLockState();
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
        </div>`;
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
        <div class="tiny">Saved locally so you don’t re-enter each time.</div>`;
    }
    bindAuthFormHandlers();
  }

  // Lock + friendly lockout display
  function applyLockState(){
    const disable = eventLocked || userLocked;
    fightsList.querySelectorAll('select').forEach(sel => sel.disabled = disable);
    if (submitBtn) submitBtn.disabled = disable;
    if (makePicksPanel) makePicksPanel.style.display = userLocked ? 'none' : '';
    if (yourPicksPanel) yourPicksPanel.style.display = '';
    if (submitHint) {
      if (eventLocked) submitHint.textContent = 'Event is locked — no new submissions.';
      else if (userLocked) submitHint.textContent = 'Your picks are locked (already submitted).';
      else submitHint.textContent = 'Picks lock at event start. Submitting locks your picks.';
    }
  }
  function friendlyLockout(meta){
    const tz='America/Toronto';
    const local=String(meta.lockout_local||'').trim();
    if(local) return `${local} ET`;
    const iso=String(meta.lockout_iso||'').trim();
    if(!iso) return 'unset';
    try{
      const d=new Date(iso);
      const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,weekday:'short',month:'short',day:'2-digit',hour:'numeric',minute:'2-digit',hour12:true});
      return `${fmt.format(d)} ET`;
    }catch{ return iso; }
  }
  function renderMeta(){
    if(!meta) return;
    statusText.textContent = `status: ${meta.status || 'open'}`;
    lockoutText.textContent = `lockout: ${friendlyLockout(meta)}`;
    eventLocked = (String(meta.status||'').toLowerCase() !== 'open');
    applyLockState();
  }

  // Champions (reigning)
  function formatEt(dIso){
    try{
      const d=new Date(dIso);
      const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'short',day:'2-digit'});
      return fmt.format(d);
    }catch{ return ''; }
  }
  function renderChampions(list){
    if(!Array.isArray(list) || !list.length){ if(champBanner) champBanner.style.display='none'; return; }
    const lastDate = list[list.length-1]?.date || '';
    const recent = list.filter(x=> x.date===lastDate);
    if (!recent.length) { champBanner.style.display='none'; return; }
    champList.innerHTML = recent.map(c => `<li>${escapeHtml(c.username)} — ${c.points} pts</li>`).join('');
    champWhen.textContent = `Won on ${formatEt(lastDate)}`;
    champBanner.style.display = '';
  }

  // Scoring helpers (FIXED precedence & flooring)
  function computeDogBonus(odds){
    const o = Number(odds || 0);
    if (o < 100) return 0;
    return Math.floor((o - 100) / 100) + 1;
  }
  function dogBonusForPick(f, pickedWinner){
    if(!f) return 0;
    if(pickedWinner===f.fighter1) return computeDogBonus(f.oddsF1);
    if(pickedWinner===f.fighter2) return computeDogBonus(f.oddsF2);
    return 0;
  }

  // Fights UI
  function labelWithDog(name, dogN){ return dogN>0 ? `${name} (🐶 +${dogN})` : name; }
  function buildFightRow(f){
    const key = f.fight; // canonical label
    const theFid = f.fight_id || '';
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
      <div class="fight" data-key="${escapeHtml(key)}" data-id="${escapeHtml(theFid)}">
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
    if (!Array.isArray(fights)) { showDebug(`getfights did not return an array`); fightsList.innerHTML = ''; return; }
    fightsList.innerHTML = fights.map(buildFightRow).join('');
    applyLockState();
  }

  // Picks render (optimized to O(N) by prebuilding lookups)
  function renderYourPicks(){
    const keys = Object.keys(picksState);
    if(!keys.length){ yourPicks.innerHTML = `<div class="tiny">No picks yet.</div>`; return; }
    const rows=[];

    // Build O(1) lookup maps to avoid repeated .find()
    const fightByLabel  = new Map(fights.map(f => [f.fight, f]));
    const fightById     = new Map(fights.map(f => [f.fight_id, f]));
    const resultById    = new Map(results.map(r => [r.fight_id, r]));
    const resultByLabel = new Map(results.map(r => [r.fight, r]));

    for(const k of keys){
      const p = picksState[k];
      const f = fightByLabel.get(k) || (p.fight_id ? fightById.get(p.fight_id) : null);
      const r = p.fight_id ? resultById.get(p.fight_id) : resultByLabel.get(k);
      const dogN = (p && f) ? dogBonusForPick(f, p.winner) : 0;

      let detailsHtml = '';
      if(r && r.finalized){
        let bits=[], pts=0;
        const winnerOK = p.winner && p.winner===r.winner; if(winnerOK) pts+=3; bits.push(`Winner ${winnerOK?'✅':'❌'}`);
        const methodOK = winnerOK && p.method && p.method===r.method; if(methodOK) pts+=2; bits.push(`Method ${methodOK?'✅':'❌'}`);
        const roundOK  = methodOK && r.method!=='Decision' && String(p.round||'')===String(r.round||''); if(roundOK) pts+=1; bits.push(`Round ${roundOK?'✅':'❌'}`);
        if(winnerOK && dogN>0){ pts+=dogN; bits.push(`🐶+${dogN}`); }
        detailsHtml = `<div class="right"><div>${bits.join(' • ')}</div><div class="tiny">Points: ${pts}</div></div>`;
      }

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
      lbBody.innerHTML = `<tr><td colspan="3" class="tiny">No scores yet.</td></tr>`;
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
        </tr>`;
    }).join('');
  }

  // Hydration with ID mapping
  async function hydrateUserPicksStrict(){
    const u = currentUsername();
    if (!u) { renderYourPicks(); return; }
    try{
      const list = await getJSON(API.userpicks(u)); // [{fight_id,fight,winner,method,round}]
      const next = {};
      if (Array.isArray(list)) {
        for (const row of list) {
          const fid = String(row.fight_id||'').trim();
          let label = row.fight || '';
          if (fid && labelById.has(fid)) label = labelById.get(fid);
          if (!label) continue;
          next[label] = {
            fight_id: fid || (idByLabel.get(label) || ''),
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

  // User lock
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

  // Bind picks + submit
  function bindFightsAndSubmit(){
    fightsList.addEventListener('change', (ev)=>{
      const el = ev.target;
      const fightEl = el.closest('.fight'); if(!fightEl) return;
      const label = fightEl.dataset.key;
      const fid = fightEl.dataset.id || idByLabel.get(label) || '';
      picksState[label] = picksState[label] || { fight_id: fid, winner:'', method:'', round:'' };
      picksState[label].fight_id = fid;

      if(el.id.startsWith('w_')){ picksState[label].winner = el.value; }
      else if(el.id.startsWith('m_')){
        picksState[label].method = el.value;
        const roundSel = fightEl.querySelector('select[id^="r_"]');
        if(roundSel){ const isDec = el.value==='Decision'; roundSel.disabled = isDec; if(isDec) roundSel.value=''; }
      } else if(el.id.startsWith('r_')){ picksState[label].round = el.value; }

      renderYourPicks();
    });

    submitBtn.addEventListener('click', async ()=>{
      if (eventLocked) { showDebug('Event is locked — no new submissions.'); return; }
      if (userLocked) { showDebug('Your picks are locked (already submitted).'); return; }

      const username = currentUsername();
      const pin = currentPin();
      if(!username){ showDebug('Enter a username.'); return; }
      if(!isNumericPin(pin)){ showDebug('PIN must be 4 digits.'); return; }

      // --- STRICT VALIDATION: every fight must be fully picked ---
      for (const f of fights) {
        const label = f.fight;
        const ps = picksState[label] || {};
        const winner = (ps.winner || '').trim();
        const method = (ps.method || '').trim();
        const round  = (ps.round  || '').trim();

        if (!winner) { showDebug(`Select a Winner for: ${label}`); return; }
        if (!method) { showDebug(`Select a Method for: ${label}`); return; }
        if (method !== 'Decision' && !round) { showDebug(`Select a Round for: ${label}`); return; }

        if (method === 'Decision' && ps.round) ps.round = '';
      }

      // Build complete, validated payload from fights list
      const picksPayload = fights.map(f => {
        const label = f.fight;
        const ps = picksState[label] || {};
        const method = METHOD_OPTIONS.includes(ps.method) ? ps.method : 'Decision';
        const round  = (method === 'Decision') ? '' : String(ps.round || '');
        const fid    = (ps.fight_id || idByLabel.get(label) || '');

        return {
          fight_id: fid,
          fight: label,
          winner: ps.winner,
          method,
          round
        };
      });

      const old = submitBtn.textContent;
      submitBtn.textContent = 'Submitting…'; submitBtn.disabled = true;
      try{
        // Proxy expects { username, pin, picks }
        const res = await postJSON(API.submit, { username, pin, picks: picksPayload });
        if (!res || res.ok !== true) throw new Error(res && res.error ? res.error : 'Submit failed');
        hideDebug();
        lsSet(LS_USER, username); lsSet(LS_PIN, pin);
        userLocked = true; applyLockState();

        // After submit, do a single fast rehydrate via bootstrap
        await loadBootstrap();

        submitBtn.textContent = 'Saved ✔';
        setTimeout(()=>{ submitBtn.textContent = old; }, 900);
        updateAuthUI();
      }catch(err){
        showDebug(String(err.message||err));
        submitBtn.textContent = old; submitBtn.disabled = eventLocked || userLocked;
      }
    });
  }

  // ---------- Bootstrap loader ----------
  async function loadBootstrap(){
    const u = currentUsername();
    const payload = await getJSON(API.bootstrap(u));

    // meta
    meta = payload.meta || {};
    renderMeta();

    // fights + maps
    fights = Array.isArray(payload.fights) ? payload.fights : [];
    fightKeyMap.clear(); idByLabel.clear(); labelById.clear();
    for (const f of fights) {
      fightKeyMap.set(normKey(f.fight), f.fight);
      idByLabel.set(f.fight, f.fight_id || '');
      if (f.fight_id) labelById.set(f.fight_id, f.fight);
    }
    renderFights();

    // results
    results = Array.isArray(payload.results) ? payload.results : [];

    // leaderboard
    const lb = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
    renderLeaderboard(lb);

    // champs
    champs = Array.isArray(payload.champion) ? payload.champion : [];
    renderChampions(champs);

    // user lock + picks (if present)
    if (payload.user && payload.user.lock) {
      userLocked = !!payload.user.lock.locked && payload.user.lock.reason === 'submitted';
      applyLockState();
    }
    if (payload.user && Array.isArray(payload.user.picks)) {
      const next = {};
      for (const row of payload.user.picks) {
        const fid = String(row.fight_id||'').trim();
        let label = row.fight || (fid && labelById.get(fid)) || '';
        if (!label) continue;
        next[label] = {
          fight_id: fid || (idByLabel.get(label) || ''),
          winner: row.winner || '',
          method: METHOD_OPTIONS.includes(row.method) ? row.method : (row.winner ? 'Decision' : ''),
          round:  (row.method === 'Decision') ? '' : (row.round || '')
        };
      }
      picksState = next;
    }
    renderYourPicks();
    hideDebug();
  }

  // ---------- Lightweight live refresh (results + leaderboard only) ----------
  async function refreshLive(){
    try{
      const [resNew, lbNew] = await Promise.all([
        getJSON(API.results),
        getJSON(API.leaderboard)
      ]);
      results = Array.isArray(resNew) ? resNew : [];
      renderYourPicks();
      renderLeaderboard(Array.isArray(lbNew) ? lbNew : []);
    }catch(e){
      showDebug(String(e && e.message ? e.message : e));
      setTimeout(hideDebug, 2500);
    }
  }

  // (legacy helpers retained)
  async function refreshMeta(){ meta = await getJSON(API.meta); renderMeta(); }
  async function refreshFights(){
    const data = await getJSON(API.fights);
    fights = Array.isArray(data) ? data : [];
    fightKeyMap.clear(); idByLabel.clear(); labelById.clear();
    for (const f of fights) {
      fightKeyMap.set(normKey(f.fight), f.fight);
      idByLabel.set(f.fight, f.fight_id || '');
      if (f.fight_id) labelById.set(f.fight_id, f.fight);
    }
    if (!Array.isArray(data)) showDebug(`getfights returned non-array; raw: ${JSON.stringify(data).slice(0,200)}`);
    renderFights();
  }
  async function refreshResults(){ results = await getJSON(API.results); }
  async function refreshLeaderboard(){ const rows = await getJSON(API.leaderboard); renderLeaderboard(rows); }
  async function refreshChampions(){ champs = await getJSON(API.champion); renderChampions(champs); }

  // Aggregate refresh — use bootstrap for initial load
  async function refreshAll(){
    try{
      await loadBootstrap();
    }catch(err){
      showDebug(String(err.message||err));
    }
  }

  // Init
  function prefillUser(){
    const u = lsGet(LS_USER,'');
    if (u && q('#usernameInput')) q('#usernameInput').value = u;
  }

  updateAuthUI();
  bindAuthFormHandlers();
  prefillUser();
  bindFightsAndSubmit();

  // First paint: single fast call
  refreshAll();

  // Then keep things fresh: results + leaderboard only
  setInterval(refreshLive, 60000);
})();
