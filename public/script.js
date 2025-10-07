/* Fantasy Fight Picks — frontend (lean bootstrap + robust retries)
   - Proxy /api/* to Render
   - Tries /api/bootstrap first; if it 5xx/aborts, gracefully falls back to separate calls
   - Strict submit validation + button lock
   - Champ UI: header text (post-finalization) + leaderboard bold for champs (ties supported)
   - LIVE mode: 3s refresh while event locked & not finalized; 30s otherwise
   - 2025-10-07: Hardened champ banner logic + resilient champions fetch (pre-lockout)
   - 2025-10-07 (later): Championship belt rendering (SVG) with same visibility logic as banner
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

  // Header champ hooks
  const crownBadge   = q('#crownBadge');   // kept but unused
  const champNamesEl = q('#champNames');   // small text beside title

  // Legacy champ panel (ribbon)
  const champBanner  = q('#champBanner');
  const champList    = q('#champList');
  const champWhen    = q('#champWhen');

  // NEW: Championship belt (SVG)
  const champBelt    = q('#champBelt');
  const beltNameEl   = q('#beltName');
  const beltWhenEl   = q('#beltWhen');

  const debugBanner  = q('#debugBanner');
  const statusText   = q('#statusText');
  const lockoutText  = q('#lockoutText');
  const authPanel    = q('#authPanel');
  let usernameInput  = q('#usernameInput');
  let pinInput       = q('#pinInput');
  let saveUserBtn    = q('#saveUserBtn');
  const submitBtn    = q('#submitBtn');
  const submitHint   = q('#submitHint');

  // Live hints (optional elements — safe if missing)
  const liveBadge    = q('#liveBadge');        // small “LIVE” chip
  const updatedText  = q('#updatedText');      // “Last updated: …”

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
  let champs = [];           // CHAMPIONS rows (last 10 via backend)
  let latestChampNames = []; // usernames for latest event (ties allowed)

  let picksState = {}; // { [fightLabel]: { fight_id, winner, method, round } }
  let eventLocked = false;
  let userLocked = false;

  let _fetchedChampsOnce = false; // guard to avoid repeated pulls pre-lockout

  const idByLabel = new Map();   // canonical label -> fight_id
  const labelById = new Map();   // fight_id -> canonical label
  const METHOD_OPTIONS = ['KO/TKO', 'Submission', 'Decision'];

  // ---------- Utils ----------
  function showDebug(msg){ if(debugBanner){ debugBanner.textContent=String(msg||''); debugBanner.style.display='block'; } }
  function hideDebug(){ if(debugBanner){ debugBanner.style.display='none'; } }
  function touchUpdated(){
    if (!updatedText) return;
    try {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat('en-CA', { hour:'numeric', minute:'2-digit', second:'2-digit' });
      updatedText.textContent = `Last updated: ${fmt.format(now)}`;
    } catch {}
  }

  // Parse lockout robustly. If we can't get a finite ms, treat as +Infinity so preEvent is true (keep banner up pre-lockout).
  function lockoutMs(metaObj){
    const iso = String(metaObj?.lockout_iso || '').trim();
    if (!iso) return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  }

  // Show banner/belt up to the exact lockout minute, and again after full finalization.
  function shouldShowChampBanner(){
    const lockMs = lockoutMs(meta);
    const nowMs  = Date.now();
    const preEvent   = nowMs < lockMs;                 // show up to the exact lockout minute
    const finalized  = allResultsFinalized(fights, results);
    return preEvent || finalized;
  }

  async function getJSON(url){
    const max = 3;
    for (let i=0;i<max;i++){
      try{
        const r = await fetch(url, { cache:'no-store' });
        const t = await r.text();
        let data;
        try { data = JSON.parse(t || '{}'); } catch { data = null; }
        if (!r.ok || data?.ok === false) {
          const status = r.status;
          const msg = (data && data.error) ? data.error : `${status} ${r.statusText}`;
          if ([429, 500, 502, 503, 504].includes(status) && i < max-1) {
            await new Promise(s=>setTimeout(s, 300*(i+1)));
            continue;
          }
          throw new Error(msg);
        }
        return data;
      } catch(e) {
        const m = String(e && e.message || e || '');
        const transient = /NetworkError|Failed to fetch|aborted|timeout|timed out/i.test(m);
        if (transient && i < max-1) {
          await new Promise(s=>setTimeout(s, 300*(i+1)));
          continue;
        }
        throw e;
      }
    }
  }

  async function postJSON(url, body){
    const max = 2;
    for (let i=0;i<max;i++){
      try{
        const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
        const t = await r.text();
        let data;
        try { data = JSON.parse(t || '{}'); } catch { data = null; }
        if (!r.ok || data?.ok === false) {
          const status = r.status;
          const msg = (data && data.error) ? data.error : `${status} ${r.statusText}`;
          if ([429, 500, 502, 503, 504].includes(status) && i < max-1) {
            await new Promise(s=>setTimeout(s, 300*(i+1)));
            continue;
          }
          throw new Error(msg);
        }
        return data;
      } catch(e) {
        const m = String(e && e.message || e || '');
        const transient = /NetworkError|Failed to fetch|aborted|timeout|timed out/i.test(m);
        if (transient && i < max-1) {
          await new Promise(s=>setTimeout(s, 300*(i+1)));
          continue;
        }
        throw e;
      }
    }
  }

  function lsGet(k, d=''){ try{ return localStorage.getItem(k) ?? d; }catch{ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }
  function isNumericPin(s){ return /^\d{4}$/.test(String(s||'')); }
  function escapeHtml(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function hashKey(s){ let h=0,str=String(s||''); for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))|0;} return Math.abs(h).toString(36); }

  // ---------- Auth ----------
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
        renderFights(); // ensure picks panel appears after you save user
      });
    }
    const signOutBtn = q('#signOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', ()=>{
        lsDel(LS_USER); lsDel(LS_PIN);
        userLocked = false; picksState = {};
        renderFights();
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

  // ---------- Lock + friendly lockout display ----------
  function applyLockState(){
    const disable = eventLocked || userLocked;
    if (fightsList) fightsList.querySelectorAll('select').forEach(sel => sel.disabled = disable);
    if (submitBtn) submitBtn.disabled = disable;

    // Hide the whole Make Picks panel once submitted and clear any controls
    if (makePicksPanel) makePicksPanel.style.display = userLocked ? 'none' : '';
    if (userLocked && fightsList) fightsList.innerHTML = '';

    if (yourPicksPanel) yourPicksPanel.style.display = '';
    if (submitHint) {
      if (eventLocked) submitHint.textContent = 'Event is locked — no new submissions.';
      else if (userLocked) submitHint.textContent = 'Your picks are locked (already submitted).';
      else submitHint.textContent = 'Picks lock at event start. Submitting locks your picks.';
    }

    // LIVE badge on during locked + not finalized
    if (liveBadge) {
      liveBadge.hidden = !(eventLocked && !allResultsFinalized(fights, results));
    }
  }
  function friendlyLockout(metaObj){
    const tz='America/Toronto';
    const local=String(metaObj?.lockout_local||'').trim();
    if(local) return `${local} ET`;
    const iso=String(metaObj?.lockout_iso||'').trim();
    if(!iso) return 'unset';
    try{
      const d=new Date(iso);
      const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,weekday:'short',month:'short',day:'2-digit',hour:'numeric',minute:'2-digit',hour12:true});
      return `${fmt.format(d)} ET`;
    }catch{ return iso; }
  }
  function renderMeta(){
    if(!meta) return;
    if (statusText) statusText.textContent = `status: ${meta.status || 'open'}`;
    if (lockoutText) lockoutText.textContent = `lockout: ${friendlyLockout(meta)}`;
    eventLocked = (String(meta.status||'').toLowerCase() !== 'open');
    applyLockState();
  }

  // ---------- Odds / Dog bonus (UI only) ----------
  function computeDogBonus(odds){ const o=Number(odds||0); if(o<100) return 0; return Math.floor((o-100)/100)+1; }
  function dogBonusForPick(f, pickedWinner){
    if(!f) return 0;
    if(pickedWinner===f.fighter1) return computeDogBonus(f.oddsF1);
    if(pickedWinner===f.fighter2) return computeDogBonus(f.oddsF2);
    return 0;
  }

  // ---------- Fights / Picks UI ----------
  function labelWithDog(name, dogN){ return dogN>0 ? `${name} (🐶 +${dogN})` : name; }
  function buildFightRow(f){
    const key = f.fight;
    const theFid = f.fight_id || '';
    theFid; // silence linter
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
      <div class="fight" data-key="${escapeHtml(key)}" data-id="${escapeHtml(f.fight_id || '')}">
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
    // If the user has already submitted, do not render pick controls at all
    if (userLocked) {
      if (fightsList) fightsList.innerHTML = '';
      return;
    }
    if (!Array.isArray(fights)) {
      showDebug(`getfights did not return an array`);
      if (fightsList) fightsList.innerHTML = '';
      return;
    }
    if (fightsList) fightsList.innerHTML = fights.map(buildFightRow).join('');
    applyLockState();
  }

  function renderYourPicks(){
    const keys = Object.keys(picksState || {});
    if(!yourPicks) return;
    if(!keys.length){ yourPicks.innerHTML = `<div class="tiny">No picks yet.</div>`; return; }
    const rows=[];
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

  // ---------- Leaderboard ----------
  function renderLeaderboard(rows){
    if(!lbBody) return;
    if(!Array.isArray(rows) || !rows.length){
      lbBody.innerHTML = `<tr><td colspan="3" class="tiny">No scores yet.</td></tr>`;
      return;
    }
    const me = (lsGet(LS_USER,'') || '').toLowerCase();
    lbBody.innerHTML = rows.map(r=>{
      const isMe = me && (String(r.username||'').toLowerCase()===me);
      const uname = escapeHtml(r.username);
      return `
        <tr class="${isMe?'lb-me':''}">
          <td class="center rank">${r.rank}</td>
          <td><span class="lb-name">${uname}</span></td>
          <td class="center pts">${r.points}</td>
        </tr>`;
    }).join('');

    if (allResultsFinalized(fights, results) && latestChampNames.length) {
      applyLeaderboardChampBold(latestChampNames);
    }
  }

  // ---------- Champ UI (header + leaderboard bold) ----------
  function allResultsFinalized(fightsArr, resultsArr){
    const total = Array.isArray(fightsArr) ? fightsArr.length : 0;
    if (total === 0) return false;
    if (!Array.isArray(resultsArr) || resultsArr.length === 0) return false;

    const byId = new Map(resultsArr.map(r => [r.fight_id, r]));
    for (const f of fightsArr) {
      const r = byId.get(f.fight_id) || null;
      if (!r || !r.winner || !r.method) return false;
    }
    return true;
  }

  function extractLatestChampNames(list){
    if (!Array.isArray(list) || list.length === 0) return { whenISO:'', names:[] };
    let best = '';
    for (const c of list) {
      const d = String(c.date||'').trim();
      if (!d) continue;
      if (best === '' || d > best) best = d;
    }
    if (!best) return { whenISO:'', names:[] };

    const names = list
      .filter(c => String(c.date||'').trim() === best)
      .map(c => String(c.username||'').trim())
      .filter(Boolean);

    return { whenISO: best, names: Array.from(new Set(names)) };
  }

  function renderChampHeader(names){
    // No crowns, no shimmer. Title case label + names.
    if (champNamesEl) {
      champNamesEl.hidden = true;
      champNamesEl.textContent = '';
    }
    if (crownBadge) crownBadge.style.display = 'none';

    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!list.length) return;

    if (champNamesEl) {
      champNamesEl.textContent = `Current Champ(s): ${list.join(', ')}`;
      champNamesEl.hidden = false;
    }
  }

  function applyLeaderboardChampBold(champUsernames){
    if (!Array.isArray(champUsernames) || champUsernames.length === 0) return;
    const champsSet = new Set(champUsernames.map(s => (s || '').trim().toLowerCase()));
    if (!lbBody) return;
    for (const tr of lbBody.querySelectorAll('tr')) {
      const userCell = tr.querySelectorAll('td')[1];
      if (!userCell) continue;
      const label = userCell.querySelector('.lb-name');
      if (!label) continue;
      const text = (label.textContent || '').trim().toLowerCase();
      label.classList.toggle('lb-champ-name', champsSet.has(text)); // bold only (CSS)
    }
  }

  async function syncChampUI(){
    const done = allResultsFinalized(fights, results);
    if (!done) {
      renderChampHeader([]);
      applyLeaderboardChampBold([]);
      return;
    }
    const { whenISO, names } = extractLatestChampNames(champs);
    latestChampNames = names;
    renderChampHeader(names);
    applyLeaderboardChampBold(names);
  }

  // ---------- Champions (banner + belt) ----------
  function renderChampions(list){
    champs = Array.isArray(list) ? list : [];

    // If no champs rows at all, hide both banner and belt.
    if(!Array.isArray(list) || !list.length){
      if(champBanner) champBanner.style.display='none';
      if (champBelt)   champBelt.style.display='none';
      return;
    }

    const { whenISO, names } = extractLatestChampNames(list);
    if (!whenISO || !names.length) {
      if (champBanner) champBanner.style.display='none';
      if (champBelt)   champBelt.style.display='none';
      return;
    }

    // --- Ribbon content ---
    const recent = list.filter(x => String(x.date||'').trim() === whenISO);
    if (champList) champList.innerHTML = recent.map(c => `<li>${escapeHtml(c.username)} — ${c.points} pts</li>`).join('');
    if (champWhen) {
      const fmtDate = (dIso)=>{ try{ const d=new Date(dIso); const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'short',day:'2-digit'}); return fmt.format(d);}catch{ return ''; } };
      champWhen.textContent = `Won on ${fmtDate(whenISO)}`;
    }

    // --- Belt content ---
    if (champBelt && beltNameEl && beltWhenEl) {
      // Name(s): join ties with a dot
      const nameStr = names.join(' • ');
      beltNameEl.textContent = nameStr;

      // Adaptive font size for long strings / ties
      const len = nameStr.length;
      let fs = 28;
      if (names.length > 1) fs = 24;
      if (len > 18) fs = 24;
      if (len > 26) fs = 20;
      if (len > 36) fs = 18;
      beltNameEl.setAttribute('font-size', String(fs));

      // Pretty date under the belt
      try {
        const d = new Date(whenISO);
        const fmt = new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Toronto', year:'numeric', month:'short', day:'2-digit' });
        beltWhenEl.textContent = `Won on ${fmt.format(d)}`;
      } catch { beltWhenEl.textContent = ''; }
    }

    // Visibility (same rule for banner + belt)
    const show = shouldShowChampBanner();
    if (champBanner) champBanner.style.display = show ? '' : 'none';   // CSS default is block
    if (champBelt)   champBelt.style.display   = show ? 'block' : 'none';
  }

  // ---------- Data loading ----------
  function computeMaps(payloadFights){
    idByLabel.clear(); labelById.clear();
    for (const f of (payloadFights||[])) {
      idByLabel.set(f.fight, f.fight_id || '');
      if (f.fight_id) labelById.set(f.fight_id, f.fight);
    }
  }
  function computeMapsAndRenderFights(payloadFights){
    fights = Array.isArray(payloadFights) ? payloadFights : [];
    computeMaps(fights);
    renderFights();
  }

  async function hydrateUserPicksStrict(){
    const u = currentUsername();
    if (!u) { renderYourPicks(); return; }
    try{
      const list = await getJSON(API.userpicks(u));
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

  function bindFightsAndSubmit(){
    if (fightsList) {
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
    }

    if (submitBtn) submitBtn.addEventListener('click', async ()=>{
      if (eventLocked) { showDebug('Event is locked — no new submissions.'); return; }
      if (userLocked) { showDebug('Your picks are locked (already submitted).'); return; }

      const username = currentUsername();
      const pin = currentPin();
      if(!username){ showDebug('Enter a username.'); return; }
      if(!isNumericPin(pin)){ showDebug('PIN must be 4 digits.'); return; }

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

      const picksPayload = fights.map(f => {
        const label = f.fight;
        const ps = picksState[label] || {};
        const method = METHOD_OPTIONS.includes(ps.method) ? ps.method : 'Decision';
        const round  = (method === 'Decision') ? '' : String(ps.round || '');
        const fid    = (ps.fight_id || idByLabel.get(label) || '');
        return { fight_id: fid, fight: label, winner: ps.winner, method, round };
      });

      const old = submitBtn.textContent;
      submitBtn.textContent = 'Submitting…'; submitBtn.disabled = true;
      try{
        const res = await postJSON(API.submit, { username, pin, picks: picksPayload });
        if (!res || res.ok !== true) throw new Error(res && res.error ? res.error : 'Submit failed');
        hideDebug();
        lsSet(LS_USER, username); lsSet(LS_PIN, pin);

        userLocked = true;
        applyLockState();
        // Hard hide & clear immediately so no controls linger
        if (makePicksPanel) makePicksPanel.style.display = 'none';
        if (fightsList) fightsList.innerHTML = '';

        // Rehydrate once after submit
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

  // ---------- Bootstrap ----------
  async function loadBootstrap(){
    const u = currentUsername();
    try{
      showDebug('Loading…');
      const payload = await getJSON(API.bootstrap(u));

      meta = payload.meta || {}; renderMeta();

      computeMapsAndRenderFights(payload.fights);

      results = Array.isArray(payload.results) ? payload.results : [];
      renderLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);

      // First pass champs from bootstrap
      const bootChamps = Array.isArray(payload.champion) ? payload.champion : [];
      renderChampions(bootChamps);

      // If bootstrap didn't include champs, pull them once now
      if ((!Array.isArray(bootChamps) || bootChamps.length === 0) && !_fetchedChampsOnce) {
        try {
          const ch = await getJSON(API.champion);
          _fetchedChampsOnce = true;
          renderChampions(Array.isArray(ch) ? ch : []);
        } catch {/* silent */}
      }

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

      // Champ UI toggle (post-finalization header + bolding)
      await syncChampUI();

      hideDebug(); touchUpdated();
    }catch(e){
      // Fallback path
      showDebug('Server busy; loading pieces…');
      const u = currentUsername();
      const [m, fs, rs, lb, ch, lock, ups] = await Promise.allSettled([
        getJSON(API.meta),
        getJSON(API.fights),
        getJSON(API.results),
        getJSON(API.leaderboard),
        getJSON(API.champion),
        u ? getJSON(API.userlock(u)) : Promise.resolve({locked:false,reason:'open'}),
        u ? getJSON(API.userpicks(u)) : Promise.resolve([])
      ]);

      meta = m.status==='fulfilled' ? m.value : {};
      renderMeta();

      computeMapsAndRenderFights(fs.status==='fulfilled' ? fs.value : []);

      results = rs.status==='fulfilled' && Array.isArray(rs.value) ? rs.value : [];
      renderLeaderboard(lb.status==='fulfilled' && Array.isArray(lb.value) ? lb.value : []);
      const chArr = ch.status==='fulfilled' && Array.isArray(ch.value) ? ch.value : [];
      renderChampions(chArr);

      if (lock.status==='fulfilled') {
        userLocked = !!lock.value.locked && lock.value.reason === 'submitted';
        applyLockState();
      }
      if (ups.status==='fulfilled' && Array.isArray(ups.value)) {
        const next = {};
        for (const row of ups.value) {
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

      await syncChampUI();

      setTimeout(hideDebug, 800);
      touchUpdated();
    }
  }

  // Lightweight live refresh (results + leaderboard only) with adaptive cadence
  async function refreshLive(){
    const [resNew, lbNew] = await Promise.all([
      getJSON(API.results),
      getJSON(API.leaderboard)
    ]);
    results = Array.isArray(resNew) ? resNew : [];
    renderYourPicks();
    renderLeaderboard(Array.isArray(lbNew) ? lbNew : []);

    // Backstop: if we're pre-lockout and champs are still empty (e.g., bootstrap lacked champs), fetch once.
    if (shouldShowChampBanner() && (!Array.isArray(champs) || champs.length === 0) && !_fetchedChampsOnce) {
      try {
        const ch = await getJSON(API.champion);
        _fetchedChampsOnce = true;
        renderChampions(Array.isArray(ch) ? ch : []);
      } catch {/* ignore */}
    }

    await syncChampUI();
    touchUpdated();
    applyLockState(); // adjust LIVE badge if we just finalized
  }

  // ---- Adaptive live refresher ----
  let _liveTimer = null;
  function _resultsSig(arr){
    try {
      return JSON.stringify((arr||[]).map(r => [r.fight_id, r.winner, r.method, r.round, !!r.finalized]));
    } catch { return String(Date.now()); }
  }
  async function tickLive(){
    try {
      await refreshLive(); // pulls results + leaderboard and re-renders both
    } finally {
      const live = eventLocked && !allResultsFinalized(fights, results);
      const delay = live ? 3000 : 30000; // 3s in LIVE, 30s otherwise
      if (_liveTimer) clearTimeout(_liveTimer);
      _liveTimer = setTimeout(tickLive, delay);
    }
  }

  // schedule a precise banner/belt flip at lockout
  function scheduleChampFlipAtLockout(){
    const t = lockoutMs(meta);
    const delay = t - Date.now();
    if (!Number.isFinite(t)) return;  // if Infinity (unknown), skip precise flip
    if (delay > 0 && delay < 48*3600*1000) {           // ignore absurdly far times
      setTimeout(()=>{ renderChampions(champs); }, delay + 250); // tiny buffer
    }
  }

  // ---------- Init ----------
  function prefillUser(){
    const u = lsGet(LS_USER,'');
    if (u && q('#usernameInput')) q('#usernameInput').value = u;
  }

  function bindGlobal(){
    Object.defineProperty(window, '__ffp', { get(){ return { fights, results, champs, meta, userLocked, eventLocked }; } });
  }

  function init(){
    updateAuthUI();
    bindAuthFormHandlers();
    prefillUser();
    bindFightsAndSubmit();
    bindGlobal();
  }

  init();
  loadBootstrap().then(async ()=>{
    // Immediate first pass for current data
    await refreshLive();
    // Start adaptive live loop
    tickLive();
    // exact-time champ ribbon/belt flip
    scheduleChampFlipAtLockout();
  });

})();
