/* Fantasy Fight Picks — ultra-light frontend
 * - CORS-safe submit (text/plain)
 * - PIN masked, never prefilled; stays in localStorage for silent submit
 * - ✅/❌ scoring in "Your Picks" after results finalize
 * - 🐶 +N in options and picks
 * - Username + 4-digit PIN saved locally
 */

(() => {
  // ---- DOM refs
  const q = (sel) => document.querySelector(sel);
  const fightsList = q('#fightsList');
  const yourPicksList = q('#yourPicks');
  const lbBody = q('#lbBody');
  const champList = q('#champList');
  const debugBanner = q('#debugBanner');

  const statusText = q('#statusText');
  const lockoutText = q('#lockoutText');
  const eventUrlEl = q('#eventUrl');

  const usernameInput = q('#usernameInput');
  const pinInput = q('#pinInput');
  const saveUserBtn = q('#saveUserBtn');
  const submitBtn = q('#submitBtn');

  // ---- Config injected in index.html
  const API = (action) => `${API_BASE}?action=${encodeURIComponent(action)}`;

  // ---- Local state
  let meta = null;
  let fights = [];     // [{fight,fighter1,fighter2,oddsF1,oddsF2,rounds,dogF1,dogF2}]
  let results = [];    // [{fight,winner,method,round,finalized}]
  let picksState = {}; // fightKey -> {winner,method,round}
  let locked = false;

  const METHOD_OPTIONS = ['KO/TKO', 'Submission', 'Decision'];

  // ---- Utilities
  function showDebug(msg) {
    if (!debugBanner) return;
    debugBanner.textContent = msg;
    debugBanner.style.display = 'block';
  }
  function hideDebug() {
    if (!debugBanner) return;
    debugBanner.style.display = 'none';
  }
  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
    return r.json();
  }
  // CORS-safe POST: use text/plain to avoid preflight
  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body || {})
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`POST ${url} -> ${r.status} ${t}`);
    }
    return r.json();
  }
  function lsGet(k, def = '') {
    try { return localStorage.getItem(k) ?? def; } catch { return def; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  }
  function isNumericPin(s) { return /^\d{4}$/.test(String(s || '')); }

  // ---- Scoring helpers (mirror backend)
  function computeDogBonus(odds) {
    const o = Number(odds || 0);
    if (o < 100) return 0;
    return Math.floor((o - 100) / 100) + 1;
  }
  function dogBonusForPick(f, pickedWinner) {
    if (pickedWinner === f.fighter1) return computeDogBonus(f.oddsF1);
    if (pickedWinner === f.fighter2) return computeDogBonus(f.oddsF2);
    return 0;
  }
  function fightResultForKey(key) {
    return results.find(r => r.fight === key);
  }
  function fightRowForKey(key) {
    return fights.find(f => f.fight === key);
  }

  // ---- Render: Meta
  function renderMeta() {
    if (!meta) return;
    statusText.textContent = `status: ${meta.status || 'open'}`;
    lockoutText.textContent = `lockout: ${meta.lockout_iso || 'unset'}`;
    if (meta.url) {
      eventUrlEl.innerHTML = `Event: <a href="${meta.url}" target="_blank" rel="noopener">UFCStats</a>`;
    } else {
      eventUrlEl.textContent = '';
    }
    locked = (String(meta.status || '').toLowerCase() !== 'open');
    submitBtn.disabled = locked;
    fightsList.querySelectorAll('select').forEach(sel => sel.disabled = locked);
  }

  // ---- Render: Fights (pickers)
  function labelWithDog(name, dogN) {
    return dogN > 0 ? `${name} (🐶 +${dogN})` : name;
  }
  function buildFightRow(f) {
    const fightKey = f.fight;
    const dog1 = f.dogF1 || 0;
    const dog2 = f.dogF2 || 0;

    const selWinnerId = `w_${hashKey(fightKey)}`;
    const selMethodId = `m_${hashKey(fightKey)}`;
    const selRoundId  = `r_${hashKey(fightKey)}`;

    const p = picksState[fightKey] || {};
    const winnerVal = p.winner || '';
    const methodVal = p.method || '';
    const roundVal  = p.round  || '';

    const roundDisabled = methodVal === 'Decision';
    const roundsN = Number(f.rounds || 3);
    let roundOptions = `<option value="">Round</option>`;
    for (let i = 1; i <= roundsN; i++) {
      const sel = String(roundVal) === String(i) ? 'selected' : '';
      roundOptions += `<option value="${i}" ${sel}>${i}</option>`;
    }

    return `
      <div class="fight" data-key="${escapeHtml(fightKey)}">
        <div class="name">${escapeHtml(fightKey)}</div>
        <div class="grid">
          <div>
            <div class="label">Winner</div>
            <select id="${selWinnerId}">
              <option value="">Select winner</option>
              <option value="${escapeHtml(f.fighter1)}" ${winnerVal===f.fighter1?'selected':''}>
                ${escapeHtml(labelWithDog(f.fighter1, dog1))}
              </option>
              <option value="${escapeHtml(f.fighter2)}" ${winnerVal===f.fighter2?'selected':''}>
                ${escapeHtml(labelWithDog(f.fighter2, dog2))}
              </option>
            </select>
          </div>
          <div>
            <div class="label">Method</div>
            <select id="${selMethodId}">
              <option value="">Select method</option>
              ${METHOD_OPTIONS.map(m => `<option value="${m}" ${methodVal===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="label">Round</div>
            <select id="${selRoundId}" ${roundDisabled?'disabled':''}>
              ${roundOptions}
            </select>
          </div>
          <div style="align-self:end;">
            <span class="tag">Best of ${roundsN} ${roundsN===5?'(Main Event)':''}</span>
          </div>
        </div>
      </div>
    `;
  }
  function renderFights() {
    fightsList.innerHTML = fights.map(buildFightRow).join('');
  }

  // ---- Render: Your Picks (with ✅/❌ when finalized)
  function renderYourPicks() {
    const keys = Object.keys(picksState);
    if (!keys.length) {
      yourPicksList.innerHTML = `<div class="tiny">No picks yet.</div>`;
      return;
    }
    const rows = [];
    for (const k of keys) {
      const p = picksState[k];
      const f = fightRowForKey(k);
      const r = fightResultForKey(k);
      const dogN = p && f ? dogBonusForPick(f, p.winner) : 0;

      let bits = [];
      let pts = 0;
      if (r && r.finalized) {
        const winnerOK = p.winner && p.winner === r.winner;
        bits.push(`Winner ${winnerOK ? '✅' : '❌'}`);
        if (winnerOK) pts += 1;

        const methodOK = winnerOK && p.method && p.method === r.method;
        bits.push(`Method ${methodOK ? '✅' : '❌'}`);
        if (methodOK) pts += 1;

        const roundOK = methodOK && r.method !== 'Decision' && String(p.round||'') === String(r.round||'');
        bits.push(`Round ${roundOK ? '✅' : '❌'}`);
        if (roundOK) pts += 1;

        if (winnerOK && dogN > 0) { pts += dogN; bits.push(`🐶+${dogN}`); }
      } else {
        bits = [`Winner —`, `Method —`, `Round —`];
        if (dogN > 0) bits.push(`🐶+${dogN}`);
      }

      rows.push(`
        <div class="pick-line">
          <div>
            <div><strong>${escapeHtml(k)}</strong></div>
            <div class="tiny">${escapeHtml(p.winner || '—')} • ${escapeHtml(p.method || '—')}${p.method==='Decision'?'':` • ${escapeHtml(p.round || '—')}`}${dogN>0?` • 🐶 +${dogN}`:''}</div>
          </div>
          <div class="right">
            <div>${bits.join(' • ')}</div>
            ${ (r && r.finalized) ? `<div class="tiny">Points: ${pts}</div>` : ``}
          </div>
        </div>
      `);
    }
    yourPicksList.innerHTML = rows.join('');
  }

  // ---- Render: Leaderboard
  function renderLeaderboard(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      lbBody.innerHTML = `<tr><td colspan="4" class="tiny">No scores yet.</td></tr>`;
      return;
    }
    lbBody.innerHTML = rows.map(r => `
      <tr>
        <td class="center">${r.rank}</td>
        <td>${escapeHtml(r.username)}</td>
        <td class="center">${r.points}</td>
        <td class="tiny">${escapeHtml(r.details || '')}</td>
      </tr>
    `).join('');
  }

  // ---- Render: Champion banner
  function renderChampions(list) {
    if (!Array.isArray(list) || !list.length) {
      champList.innerHTML = `<li class="tiny">No champion yet (shows when event completes)</li>`;
      return;
    }
    const lastDate = list[list.length - 1]?.date || '';
    const recent = list.filter(x => x.date === lastDate);
    champList.innerHTML = recent.map(c => `<li>${escapeHtml(c.username)} — ${c.points} pts</li>`).join('');
  }

  // ---- Event delegation: inputs
  function bindInputs() {
    // Save username/PIN
    saveUserBtn.addEventListener('click', () => {
      const u = (usernameInput.value || '').trim();
      const p = String(pinInput.value || '').trim();
      if (!u) { showDebug('Enter a username.'); return; }
      if (!isNumericPin(p)) { showDebug('PIN must be 4 digits.'); return; }
      hideDebug();
      // Store for silent submits…
      lsSet(LS_USER, u);
      lsSet(LS_PIN, p);
      // …but keep the field visually empty.
      pinInput.value = '';
    });

    // Winner / Method / Round changes
    fightsList.addEventListener('change', (ev) => {
      const el = ev.target;
      const fightEl = el.closest('.fight');
      if (!fightEl) return;
      const fightKey = fightEl.dataset.key;
      picksState[fightKey] = picksState[fightKey] || { winner:'', method:'', round:'' };

      if (el.id.startsWith('w_')) {
        picksState[fightKey].winner = el.value;
      } else if (el.id.startsWith('m_')) {
        picksState[fightKey].method = el.value;
        const roundSel = fightEl.querySelector('select[id^="r_"]');
        if (roundSel) {
          const isDec = el.value === 'Decision';
          roundSel.disabled = isDec;
          if (isDec) roundSel.value = '';
        }
      } else if (el.id.startsWith('r_')) {
        picksState[fightKey].round = el.value;
      }
      renderYourPicks();
    });

    // Submit picks
    submitBtn.addEventListener('click', async () => {
      const username = (usernameInput.value || lsGet(LS_USER, '')).trim();
      const pin = String(pinInput.value || lsGet(LS_PIN, '')).trim();
      if (!username) { showDebug('Enter a username.'); return; }
      if (!isNumericPin(pin)) { showDebug('PIN must be 4 digits.'); return; }

      const picksPayload = Object.entries(picksState)
        .filter(([k,v]) => v && v.winner)
        .map(([fight, v]) => ({
          fight,
          winner: v.winner,
          method: METHOD_OPTIONS.includes(v.method) ? v.method : 'Decision',
          round: (v.method === 'Decision') ? '' : (v.round || '')
        }));

      if (!picksPayload.length) { showDebug('No picks to submit.'); return; }

      submitBtn.disabled = true;
      try {
        const res = await postJSON(API_BASE, {
          action: 'submitpicks',
          username,
          pin,
          picks: picksPayload
        });
        if (!res || res.ok !== true) throw new Error(res && res.error ? res.error : 'Submit failed');
        hideDebug();
        // Save username (and PIN remains in localStorage), keep visual PIN empty
        lsSet(LS_USER, username);
        pinInput.value = '';
        await refreshAll();
      } catch (err) {
        showDebug(String(err.message || err));
      } finally {
        submitBtn.disabled = locked;
      }
    });
  }

  // ---- Data refresh
  async function refreshMeta() {
    meta = await getJSON(API('getmeta'));
    renderMeta();
  }
  async function refreshFights() {
    fights = await getJSON(API('getfights'));
    renderFights();
    const valid = new Set(fights.map(f => f.fight));
    Object.keys(picksState).forEach(k => { if (!valid.has(k)) delete picksState[k]; });
  }
  async function refreshResults() {
    results = await getJSON(API('getresults'));
  }
  async function refreshLeaderboard() {
    const rows = await getJSON(API('getleaderboard'));
    renderLeaderboard(rows);
  }
  async function refreshChampions() {
    const rows = await getJSON(API('getchampion'));
    renderChampions(rows);
  }
  async function refreshAll() {
    try {
      await refreshMeta();
      await Promise.all([
        refreshFights(),
        refreshResults(),
        refreshLeaderboard(),
        refreshChampions()
      ]);
      renderYourPicks();
      hideDebug();
    } catch (err) {
      showDebug(String(err.message || err));
    }
  }

  // ---- Init
  function prefillUser() {
    const u = lsGet(LS_USER, '');
    if (u) usernameInput.value = u;
    // Intentionally do not prefill PIN (kept only in localStorage)
    pinInput.value = '';
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function hashKey(s) {
    let h = 0, str = String(s||'');
    for (let i=0;i<str.length;i++) { h = (h*31 + str.charCodeAt(i))|0; }
    return Math.abs(h).toString(36);
  }

  bindInputs();
  prefillUser();
  refreshAll();

  // Gentle auto-refresh every 60s (backend scrapes every 5m)
  setInterval(() => {
    refreshAll();
  }, 60000);
})();
