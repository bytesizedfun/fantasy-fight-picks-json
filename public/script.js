/***** Fantasy Fight Picks — GAS backend (per-user lock after submit, sheet-driven lockout/URL) *****/

const SPREADSHEET_ID = '1Jt_fFIR3EwcVZDIdt-JXrZq4ssDTzj-xSHk7edHB5ek'; // your Sheet ID

const HEADERS = {
  event_meta:   ['key', 'value'],
  fight_list:   ['Fight', 'Fighter1', 'Fighter2', 'OddsF1', 'OddsF2', 'Rounds'],
  results:      ['fight', 'winner', 'method', 'round', 'finalized'],
  users:        ['username', 'pin_plain', 'pin_hash', 'created_iso'],
  picks:        ['timestamp', 'username', 'fight', 'winner', 'method', 'round'],
  leaderboard:  ['rank', 'username', 'points', 'details'],
  champions:    ['date', 'username', 'points', 'comment'],
  alltime_stats:['username', 'crowns', 'events_played', 'win_rate'],
  logs:         ['ts','where','msg']
};

const METHODS = ['KO/TKO', 'Submission', 'Decision'];
const DIGEST_SALT_KEY = 'pin_salt';
const CACHE_SECONDS = 60;

/** === JSON Helper === **/
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** === SHEET HELPERS === **/
function SS() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function getOrCreateSheet(name) {
  const ss = SS();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}
function ensureHeader(sheet, header) {
  const range = sheet.getRange(1, 1, 1, header.length);
  const current = range.getValues()[0] || [];
  const same = current.length === header.length && header.every((h, i) => (current[i] || '') === h);
  if (!same) {
    sheet.clear();
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
}
function readTable(sheetName) {
  const s = getOrCreateSheet(sheetName);
  const header = HEADERS[sheetName];
  ensureHeader(s, header);
  const lastRow = s.getLastRow();
  if (lastRow < 2) return [];
  const data = s.getRange(2, 1, lastRow - 1, header.length).getValues();
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
function writeTable(sheetName, rows) {
  const s = getOrCreateSheet(sheetName);
  const header = HEADERS[sheetName];
  ensureHeader(s, header);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, header.length).clearContent();
  if (!rows || !rows.length) return;
  const values = rows.map(obj => header.map(h => obj[h] ?? ''));
  s.getRange(2, 1, values.length, header.length).setValues(values);
}
function nowIso_() { return new Date().toISOString(); }
function log_(where, msg) {
  try {
    const sh = getOrCreateSheet('logs');
    ensureHeader(sh, HEADERS.logs);
    sh.appendRow([nowIso_(), where, String(msg)]);
  } catch (_) {}
}

/** === SETUP & META === **/
function setup() {
  Object.keys(HEADERS).forEach(name => ensureHeader(getOrCreateSheet(name), HEADERS[name]));
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(DIGEST_SALT_KEY)) props.setProperty(DIGEST_SALT_KEY, Utilities.getUuid());
  ensureEventMetaDefaults_();
  clearScraperTriggers_();
  ScriptApp.newTrigger('scraperTick').timeBased().everyMinutes(5).create();
  return { ok: true };
}
function clearScraperTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'scraperTick') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
function ensureEventMetaDefaults_() {
  const rows = readTable('event_meta');
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const keys = ['url', 'lockout_iso', 'status', 'last_scrape_iso'];
  const out = [];
  keys.forEach(k => {
    if (byKey[k] === undefined) out.push({ key: k, value: k === 'status' ? 'open' : '' });
    else out.push({ key: k, value: byKey[k] });
  });
  writeTable('event_meta', out);
}
function getMeta_() {
  const meta = {};
  readTable('event_meta').forEach(r => { meta[r.key] = r.value; });
  if (meta.lockout_iso) {
    const past = new Date() >= new Date(meta.lockout_iso);
    const st = (meta.status || 'open').toLowerCase();
    if (st === 'open' && past) meta.status = 'locked';
  }
  return meta;
}
function setMeta_(key, value) {
  const rows = readTable('event_meta');
  const idx = rows.findIndex(r => r.key === key);
  if (idx === -1) rows.push({ key, value }); else rows[idx].value = value;
  writeTable('event_meta', rows);
}

/** === AUTH === **/
function hashPin_(pin) {
  const salt = PropertiesService.getScriptProperties().getProperty(DIGEST_SALT_KEY) || '';
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, (pin || '') + salt);
  return raw.map(b => (('0' + (b & 0xff).toString(16)).slice(-2))).join('');
}
function upsertUserAndVerify_(username, pin) {
  if (!/^\S.{0,30}$/.test(username)) throw new Error('Invalid username');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
  const users = readTable('users');
  const idx = users.findIndex(u => String(u.username || '').toLowerCase() === String(username).toLowerCase());
  const pin_hash = hashPin_(pin);
  if (idx === -1) {
    users.push({ username, pin_plain: pin, pin_hash, created_iso: nowIso_() });
    writeTable('users', users);
    return true;
  } else {
    const u = users[idx];
    if (String(u.pin_plain) === String(pin) || String(u.pin_hash) === pin_hash) return true;
    throw new Error('PIN does not match username');
  }
}

/** === CORE DATA === **/
function getFights_() {
  return readTable('fight_list').map(r => ({
    fight: String(r.Fight || ''),
    fighter1: String(r.Fighter1 || ''),
    fighter2: String(r.Fighter2 || ''),
    oddsF1: Number(r.OddsF1 || 0),
    oddsF2: Number(r.OddsF2 || 0),
    rounds: Number(r.Rounds || 3)
  }));
}
function getResults_() {
  return readTable('results').map(r => ({
    fight: String(r.fight || ''),
    winner: String(r.winner || ''),
    method: String(r.method || ''),
    round:  String(r.round  || ''),
    finalized: String(r.finalized).toLowerCase() === 'true'
  }));
}
function isLocked_() {
  const meta = getMeta_();
  const st = (meta.status || 'open').toLowerCase();
  if (st === 'locked' || st === 'complete') return true;
  const iso = meta.lockout_iso;
  if (!iso) return false;
  return new Date() >= new Date(iso);
}
function lockIfPast_() {
  const meta = getMeta_();
  if (meta.lockout_iso && new Date() >= new Date(meta.lockout_iso)) setMeta_('status', 'locked');
}

/** === ODDS BONUS === **/
function computeDogBonus_(americanOdds) {
  const o = Number(americanOdds || 0);
  if (o < 100) return 0;
  return Math.floor((o - 100) / 100) + 1;
}
function winnerBonusForFight_(f, pickedWinner) {
  if (pickedWinner === f.fighter1) return computeDogBonus_(f.oddsF1);
  if (pickedWinner === f.fighter2) return computeDogBonus_(f.oddsF2);
  return 0;
}

/** === SCORING / LEADERBOARD === **/
function computeScores_() {
  const fights = getFights_();
  const results = getResults_();
  const resByFight = Object.fromEntries(results.map(r => [r.fight, r]));
  const picks = readTable('picks');

  const totals = {}; // username -> { points, details[] }
  picks.forEach(p => {
    const u = p.username; if (!u) return;
    const f = fights.find(x => x.fight === p.fight);
    const r = resByFight[p.fight];
    if (!f || !r || !r.finalized) return;

    let pts = 0; const bits = [];
    const wOK = p.winner && p.winner === r.winner; bits.push('Winner' + (wOK ? '✅' : '❌')); if (wOK) pts += 1;
    const mOK = wOK && p.method && p.method === r.method; bits.push('Method' + (mOK ? '✅' : '❌')); if (mOK) pts += 1;
    const rOK = mOK && r.method !== 'Decision' && String(p.round || '') === String(r.round || ''); bits.push('Round' + (rOK ? '✅' : '❌')); if (rOK) pts += 1;

    if (wOK) { const dog = winnerBonusForFight_(f, p.winner); if (dog > 0) { pts += dog; bits.push(`🐶+${dog}`); } }

    if (!totals[u]) totals[u] = { points: 0, details: [] };
    totals[u].points += pts;
    totals[u].details.push(`${p.fight}: ${pts} [${bits.join(', ')}]`);
  });

  const rows = Object.entries(totals)
    .map(([username, v]) => ({ username, points: v.points, details: v.details.join(' | ') }))
    .sort((a, b) => b.points - a.points);

  // rank with ties
  let rank = 0, prev = null, seen = 0;
  rows.forEach(r => { seen++; if (prev === null || r.points < prev) rank = seen; r.rank = rank; prev = r.points; });

  writeTable('leaderboard', rows.map(r => ({ rank: r.rank, username: r.username, points: r.points, details: r.details })));
  return rows;
}

/** === ALL-TIME === **/
function updateAllTimeStats_(champUsernames) {
  const perEventPicks = readTable('picks');
  const participants = Array.from(new Set(perEventPicks.map(p => p.username))).filter(Boolean);

  const rows = readTable('alltime_stats');
  const byUser = Object.fromEntries(rows.map(r => [r.username, {
    username: r.username,
    crowns: Number(r.crowns || 0),
    events_played: Number(r.events_played || 0),
    win_rate: Number(r.win_rate || 0)
  }]));

  participants.forEach(u => { if (!byUser[u]) byUser[u] = { username: u, crowns: 0, events_played: 0, win_rate: 0 }; byUser[u].events_played += 1; });
  champUsernames.forEach(u => { if (!byUser[u]) byUser[u] = { username: u, crowns: 0, events_played: 0, win_rate: 0 }; byUser[u].crowns += 1; });
  Object.values(byUser).forEach(v => { v.win_rate = v.events_played > 0 ? Math.round((v.crowns / v.events_played) * 1000) / 10 : 0; });

  writeTable('alltime_stats', Object.values(byUser));
}

/** === EVENT COMPLETION / CHAMPS === **/
function isEventComplete_() {
  const res = getResults_();
  return res.length > 0 && res.every(r => r.finalized);
}
function autoLogChampionIfDone_() {
  if (!isEventComplete_()) return;
  const rows = computeScores_(); if (!rows.length) return;

  const top = rows[0].points;
  const champs = rows.filter(r => r.points === top).map(r => r.username);

  const existing = readTable('champions');
  const insert = champs.map(u => ({ date: nowIso_(), username: u, points: top, comment: 'Auto-logged' }));
  writeTable('champions', existing.concat(insert));

  updateAllTimeStats_(champs);
  setMeta_('status', 'complete');
}

/** === SCRAPER (UFCStats) === **/
function scraperTick() {
  lockIfPast_();
  const meta = getMeta_();
  const status = (meta.status || 'open').toLowerCase();
  if (status === 'open' || status === 'complete') return;
  const url = meta.url; if (!url) return;

  try {
    scrapeUFCStats_(url);
    setMeta_('last_scrape_iso', nowIso_());
    if (isEventComplete_()) { computeScores_(); autoLogChampionIfDone_(); }
  } catch (e) {
    log_('scraperTick', e.message || e);
  }
}
function scrapeUFCStats_(eventUrl) {
  const html = UrlFetchApp.fetch(eventUrl, { muteHttpExceptions: true }).getContentText();
  const cleaned = html.replace(/\s+/g, ' ');

  const fights = getFights_();
  const existing = readTable('results');
  const byFight = Object.fromEntries(existing.map(r => [r.fight, r]));

  fights.forEach(f => {
    let winner = '', method = '', round = '', finalized = false;

    const w1 = new RegExp(escapeRegex_(f.fighter1) + '[\\s\\S]{0,50}?b-fight-details__person-status[^>]*>W<', 'i').test(cleaned);
    const w2 = new RegExp(escapeRegex_(f.fighter2) + '[\\s\\S]{0,50}?b-fight-details__person-status[^>]*>W<', 'i').test(cleaned);
    if (w1 && !w2) winner = f.fighter1;
    else if (w2 && !w1) winner = f.fighter2;

    const boutRegex = new RegExp(
      '(?:' + escapeRegex_(f.fighter1) + '|' + escapeRegex_(f.fighter2) + ')[\\s\\S]{0,350}?' +
      '(KO\\/TKO|Submission|Decision)[\\s\\S]{0,120}?(?:Round\\s*(\\d))',
      'i'
    );
    const m = cleaned.match(boutRegex);
    if (m) {
      method = normalizeMethod_(m[1]);
      round = (m[2] || '').trim();
    }

    if (winner && method) finalized = true;

    byFight[f.fight] = {
      fight: f.fight,
      winner: finalized ? winner : (byFight[f.fight]?.winner || ''),
      method: finalized ? method : (byFight[f.fight]?.method || ''),
      round:  finalized ? round  : (byFight[f.fight]?.round  || ''),
      finalized: finalized ? true : (String(byFight[f.fight]?.finalized).toLowerCase() === 'true')
    };
  });

  writeTable('results', Object.values(byFight));
}
function normalizeMethod_(s) {
  s = String(s || '').toLowerCase();
  if (s.includes('decision')) return 'Decision';
  if (s.includes('submission') || s.includes('sub')) return 'Submission';
  return 'KO/TKO';
}
function escapeRegex_(x) { return String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** === ENDPOINTS === **/
function doGet(e) {
  try {
    ensureEventMetaDefaults_();

    const cache = CacheService.getScriptCache();
    const key = 'GET:' + JSON.stringify(e?.parameter || {});
    const cached = cache.get(key);
    if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

    const params = e?.parameter || {};
    const action = String(params.action || '').toLowerCase();

    let out;
    if (action === 'getmeta') out = getMeta_();
    else if (action === 'getfights') {
      out = getFights_().map(f => ({
        ...f,
        dogF1: (f.oddsF1 >= 100) ? computeDogBonus_(f.oddsF1) : 0,
        dogF2: (f.oddsF2 >= 100) ? computeDogBonus_(f.oddsF2) : 0
      }));
    }
    else if (action === 'getresults') out = getResults_();
    else if (action === 'getleaderboard') out = computeScores_();
    else if (action === 'getchampion') out = readTable('champions').slice(-10);

    // NEW: per-user lock state
    else if (action === 'getuserlock') {
      const username = String(params.username || '').trim();
      const eventLocked = isLocked_();
      let reason = eventLocked ? 'event_locked' : 'open';
      let locked = eventLocked;
      if (!locked && username) {
        const picks = readTable('picks');
        const hasSubmitted = picks.some(p => String(p.username || '').toLowerCase() === username.toLowerCase());
        if (hasSubmitted) { locked = true; reason = 'submitted'; }
      }
      out = { locked, reason };
    }

    else out = { ok: true, message: 'FFP backend alive' };

    const json = JSON.stringify(out);
    cache.put(key, json, CACHE_SECONDS);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    log_('doGet', err.message || err);
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    if (!body) { log_('doPost', 'empty body'); return jsonResponse({ ok:false, error:'Empty request body' }); }

    let req;
    try { req = JSON.parse(body); }
    catch (parseErr) { log_('doPost', 'bad json: ' + body); return jsonResponse({ ok:false, error:'Bad JSON' }); }

    const action = String(req.action || '').toLowerCase();
    let out = { ok: false, error: 'Unknown action' };

    if (action === 'setevent') {
      const { url, lockout_iso } = req;
      if (!url || !lockout_iso) throw new Error('url and lockout_iso required');
      setMeta_('url', url);
      setMeta_('lockout_iso', lockout_iso);
      setMeta_('status', 'open');
      setMeta_('last_scrape_iso', '');
      writeTable('picks', []);
      writeTable('results', []);
      writeTable('leaderboard', []);
      out = { ok: true };
    }

    else if (action === 'submitpicks') {
      lockIfPast_();
      if (isLocked_()) throw new Error('Picks are locked');

      const username = (req.username || '').trim();
      const pin = String(req.pin || '').trim();
      const picks = Array.isArray(req.picks) ? req.picks : [];

      if (!username) throw new Error('Missing username');
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
      if (!picks.length) throw new Error('No picks');

      // per-user lock: if user already has any picks recorded, deny further submits
      const existingAll = readTable('picks');
      const already = existingAll.some(r => String(r.username || '').toLowerCase() === username.toLowerCase());
      if (already) throw new Error('You already submitted picks. They are locked.');

      // ensure headers exist (if someone wiped them)
      ensureHeader(getOrCreateSheet('users'), HEADERS.users);
      ensureHeader(getOrCreateSheet('picks'), HEADERS.picks);

      upsertUserAndVerify_(username, pin);

      const fightsByKey = Object.fromEntries(getFights_().map(f => [f.fight, f]));
      const now = nowIso_();
      picks.forEach(p => {
        const f = fightsByKey[p.fight];
        if (!f) return;
        const method = METHODS.includes(p.method) ? p.method : 'Decision';
        const round  = (method === 'Decision') ? '' : String(p.round || '');
        existingAll.push({ timestamp: now, username, fight: p.fight, winner: p.winner || '', method, round });
      });

      writeTable('picks', existingAll);
      out = { ok: true };
    }

    log_('doPost:' + action, out.ok ? 'ok' : out.error);
    return jsonResponse(out);
  } catch (err) {
    log_('doPost:err', err.message || err);
    return jsonResponse({ ok: false, error: String(err) });
  }
}
