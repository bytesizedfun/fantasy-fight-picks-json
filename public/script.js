const SHEET_MAP = {
  "fight_picks": "1Jt_fFIR3EwcVZDIdt-JXrZq4ssDTzj-xSHk7edHB5ek",
  "fight_results": "1Jt_fFIR3EwcVZDIdt-JXrZq4ssDTzj-xSHk7edHB5ek"
};

function getSpreadsheetId(key) {
  return SHEET_MAP[key];
}

/* =========================
   ADMIN MENU
   ========================= */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Admin')
    .addItem('Log Champion', 'logChampion') // one button to do all the things
    .addToUi();
}

/* =========================
   HTTP ROUTES
   ========================= */
function doGet(e) {
  const action = e.parameter.action;
  if (action === "getLeaderboard") return handleLeaderboard();
  if (action === "getFights") return handleGetFights();
  if (action === "getChampionBanner") return getChampionBanner();
  if (action === "getHall") return getHall(); // reads users_totals
  return ContentService.createTextOutput("Invalid GET action");
}

function doPost(e) {
  const data = JSON.parse(e.postData?.contents || "{}");
  const action = data.action;
  if (action === "submitPicks") return handleSubmit(data);
  if (action === "getUserPicks") return handleGetUserPicks(data);
  if (action === "getLeaderboard") return handleLeaderboard();
  return ContentService.createTextOutput("Invalid POST action");
}

/* =========================
   HELPERS
   ========================= */
function tzNow_() {
  return new Date();
}
function weekLabel_() {
  const today = tzNow_();
  const d = Utilities.formatDate(today, "America/Toronto", "yyyy-MM-dd");
  return `Week ${d}`;
}
function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length) {
    if (sh.getLastRow() === 0) sh.appendRow(headers);
    const first = sh.getRange(1,1,1,headers.length).getValues()[0] || [];
    if (first[0] !== headers[0]) sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sh;
}
function clearContentBelowHeader_(sh) {
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
}
function removeRowsWhereColEquals_(sh, colIndex1Based, value) {
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][colIndex1Based - 1] === value) sh.deleteRow(i + 1);
  }
}
function round2_(x){ return Math.round(x*100)/100; }

/* Find the last non-empty value in a column, scanning upward */
function lastNonEmptyInColumn_(sh, colIndex1Based) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "";
  const colVals = sh.getRange(2, colIndex1Based, lastRow - 1, 1).getValues(); // exclude header
  for (let i = colVals.length - 1; i >= 0; i--) {
    const v = String(colVals[i][0] || "").trim();
    if (v) return v;
  }
  return "";
}

/* =========================
   ODDS / UNDERDOG HELPERS
   ========================= */
function normalizeAmericanOdds_(raw){
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  if (!/^[+-]?\d+/.test(s)) {
    const m = s.match(/[+-]?\d+/);
    s = m ? m[0] : s;
  }
  const n = parseInt(s, 10);
  return isFinite(n) ? n : null;
}
function formatAmericanOdds_(n){
  if (n == null || !isFinite(n)) return "";
  return n > 0 ? `+${n}` : `${n}`;
}
function impliedProbFromAmerican_(n){
  if (n == null || !isFinite(n)) return null;
  if (n < 0) { const a = Math.abs(n); return a / (a + 100); }
  return 100 / (n + 100);
}
function chooseUnderdog_(f1OddsRaw, f2OddsRaw, manualRaw){
  const manual = String(manualRaw || "").trim();
  const f1 = normalizeAmericanOdds_(f1OddsRaw);
  const f2 = normalizeAmericanOdds_(f2OddsRaw);

  // Manual override wins if valid
  if (manual === "Fighter 1" || manual === "Fighter 2") {
    const odds = manual === "Fighter 1" ? f1 : f2;
    return { underdog: manual, underdogOdds: formatAmericanOdds_(odds) };
  }

  // Need both odds to infer properly
  if (f1 == null || f2 == null) return { underdog: "", underdogOdds: "" };

  const p1 = impliedProbFromAmerican_(f1);
  const p2 = impliedProbFromAmerican_(f2);
  if (p1 == null || p2 == null) return { underdog: "", underdogOdds: "" };

  if (p1 < p2) return { underdog: "Fighter 1", underdogOdds: formatAmericanOdds_(f1) };
  if (p2 < p1) return { underdog: "Fighter 2", underdogOdds: formatAmericanOdds_(f2) };
  // exact tie -> deterministically choose Fighter 2
  return { underdog: "Fighter 2", underdogOdds: formatAmericanOdds_(f2) };
}
function underdogBonusFromOdds_(oddsRaw){
  const n = normalizeAmericanOdds_(oddsRaw);
  if (n == null || n < 100) return 0; // only +100 and above get a bonus
  return 1 + Math.floor((n - 100) / 100); // +100–199=+1, +200–299=+2, ... (uncapped)
}

/* =========================
   FIGHT LIST (flexible reader)
   Supports either:
   NEW: Fight | Fighter 1 | Fighter 2 | F1 Odds | F2 Odds | [Manual Underdog]
   OLD: Fight | Fighter 1 | Fighter 2 | Underdog | [Underdog Odds]
   ========================= */
function readFightListFlexible_() {
  const sh = SpreadsheetApp.openById(getSpreadsheetId("fight_picks")).getSheetByName("fight_list");
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  const all = sh.getRange(1,1,lastRow,lastCol).getValues();
  const headers = all[0].map(h => String(h || "").trim().toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());

  const iFight = idx("fight");
  const iF1 = idx("fighter 1");
  const iF2 = idx("fighter 2");
  const iF1Odds = idx("f1 odds");
  const iF2Odds = idx("f2 odds");
  const iManual = idx("manual underdog");
  const iUnderdog = idx("underdog");
  const iUnderdogOdds = idx("underdog odds");

  return all.slice(1).filter(r => r[iFight] && r[iF1] && r[iF2]).map(r => {
    const fight = String(r[iFight]).trim();
    const fighter1 = String(r[iF1]).trim();
    const fighter2 = String(r[iF2]).trim();

    let underdog = "", underdogOdds = "", f1OddsFmt = "", f2OddsFmt = "";

    if (iF1Odds >= 0 && iF2Odds >= 0) {
      const pick = chooseUnderdog_(r[iF1Odds], r[iF2Odds], iManual>=0 ? r[iManual] : "");
      underdog = pick.underdog;
      underdogOdds = pick.underdogOdds;
      f1OddsFmt = formatAmericanOdds_(normalizeAmericanOdds_(r[iF1Odds]));
      f2OddsFmt = formatAmericanOdds_(normalizeAmericanOdds_(r[iF2Odds]));
    } else if (iUnderdog >= 0) {
      const u = String(r[iUnderdog] || "").trim(); // "Fighter 1" / "Fighter 2"
      underdog = (u === "Fighter 1" || u === "Fighter 2") ? u : "";
      if (iUnderdogOdds >= 0) underdogOdds = formatAmericanOdds_(normalizeAmericanOdds_(r[iUnderdogOdds]));
    }

    return { fight, fighter1, fighter2, f1Odds: f1OddsFmt, f2Odds: f2OddsFmt, underdog, underdogOdds };
  });
}

/* =========================
   EVENT META / FOTN
   ========================= */
function readOfficialFOTN_() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const sh = ss.getSheetByName("event_meta");
  if (!sh || sh.getLastRow() < 2) return [];
  const seen = new Set();
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const key = String(r[0] || "").trim().toUpperCase();
    if (key === "FOTN") {
      const val = String(r[1] || "").trim();
      if (val) val.split(",").forEach(x => { const t = String(x).trim(); if (t) seen.add(t); });
    }
  });
  return Array.from(seen);
}

/* =========================
   CORE: SUBMIT / GET PICKS
   ========================= */
function handleSubmit(data) {
  const { username, picks, fotnPick } = data;
  if (!username || !Array.isArray(picks) || picks.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid data" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const sh = getOrCreateSheet_(ss, "fight_picks", ["username","fight","winner","method","round","timestamp"]);
  const existing = sh.getDataRange().getValues().slice(1).some(r => r[0] === username);
  if (existing) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Picks already submitted" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const timestamp = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto" });
  picks.forEach(p => {
    sh.appendRow([
      username,
      p.fight,
      p.winner,
      p.method,
      p.method === "Decision" ? "N/A" : p.round,
      timestamp
    ]);
  });

  // FOTN pick (optional)
  if (fotnPick && String(fotnPick).trim() !== "") {
    const fotnSh = getOrCreateSheet_(ss, "fotn_picks", ["username","fotn","timestamp"]);
    fotnSh.appendRow([username, String(fotnPick).trim(), timestamp]);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetUserPicks(data) {
  const username = data.username || data.parameter?.username;
  if (!username) {
    return ContentService.createTextOutput(JSON.stringify({ success: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const sh = ss.getSheetByName("fight_picks");
  const picks = [];
  sh.getDataRange().getValues().slice(1).forEach(row => {
    const [rowUser, fight, winner, method, round] = row;
    if (rowUser === username) picks.push({ fight, winner, method, round });
  });

  // Return latest FOTN pick if present
  let fotnPick = "";
  const fotnSh = ss.getSheetByName("fotn_picks");
  if (fotnSh) {
    const rows = fotnSh.getDataRange().getValues().slice(1).filter(r => r[0] === username);
    if (rows.length) fotnPick = String(rows[rows.length - 1][1] || "");
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, picks, fotnPick }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================
   LIVE LEADERBOARD + FIGHTS
   ========================= */
function handleLeaderboard() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const picksSheet = ss.getSheetByName("fight_picks");
  const resultsSheet = ss.getSheetByName("fight_results");

  const pickRows = picksSheet.getDataRange().getValues().slice(1);
  const resultRows = resultsSheet.getDataRange().getValues().slice(1);

  // Flexible fight list -> build underdog maps
  const fightRows = readFightListFlexible_();
  const underdogMap = {};     // fight -> underdog fighter NAME
  const underdogOddsMap = {}; // fight -> "+240"
  fightRows.forEach(r => {
    const key = String(r.fight).trim();
    if (r.underdog === "Fighter 1") underdogMap[key] = r.fighter1;
    if (r.underdog === "Fighter 2") underdogMap[key] = r.fighter2;
    if (r.underdogOdds) underdogOddsMap[key] = r.underdogOdds;
  });

  // Results map
  const resultsMap = {};
  resultRows.forEach(row => {
    const [fight, winner, method, round] = row;
    if (!fight) return;
    resultsMap[String(fight).trim()] = {
      winner: winner != null ? String(winner).trim() : "",
      method: method != null ? String(method).trim() : "",
      round:  round  != null ? String(round).trim()  : ""
    };
  });

  // FOTN official
  const officialFOTN = readOfficialFOTN_();

  const scores = {};
  const fightResults = {};
  const participants = new Set();
  const fotnPoints = {};

  // Score picks
  pickRows.forEach(row => {
    const [username, fight, pickedWinner, pickedMethod, pickedRound] = row;
    if (!username) return;
    participants.add(username);

    const result = resultsMap[fight];
    if (!result) return;

    const { winner, method, round } = result;
    const isCorrectWinner = pickedWinner === winner;
    const isCorrectMethod = pickedMethod === method;
    const isCorrectRound  = pickedRound == round;

    let s = 0;
    if (isCorrectWinner) {
      // 3–2–1 base scoring
      s += 3;
      if (isCorrectMethod) {
        s += 2;
        if (method !== "Decision" && isCorrectRound) s += 1;
      }
      // Underdog bonus if actual underdog won
      const uName = underdogMap[String(fight).trim()];
      if (uName && winner === uName) {
        const odds = underdogOddsMap[String(fight).trim()];
        s += underdogBonusFromOdds_(odds);
      }
    }

    // ensure zero scores appear
    if (scores[username] == null) scores[username] = 0;
    scores[username] += s;

    // one-time fightResults entry
    if (!fightResults[fight]) {
      const underdogF = underdogMap[fight];
      const actualUnderdogWon = !!underdogF && underdogF === winner;
      fightResults[fight] = { winner, method, round, underdog: actualUnderdogWon ? "Y" : "N" };
    }
  });

  // FOTN (+3)
  const fotnSh = ss.getSheetByName("fotn_picks");
  if (fotnSh) {
    fotnSh.getDataRange().getValues().slice(1).forEach(r => {
      const u = String(r[0] || "").trim();
      const pick = String(r[1] || "").trim();
      if (!u) return;
      participants.add(u);
      if (scores[u] == null) scores[u] = 0;
      const hit = pick && officialFOTN.some(f => f === pick);
      if (hit) {
        scores[u] += 3;
        fotnPoints[u] = 3;
      } else {
        if (fotnPoints[u] == null) fotnPoints[u] = 0;
      }
    });
  }

  const output = { scores, fightResults, officialFOTN, fotnPoints };

  // Determine progress
  const allFights = Object.keys(resultsMap);
  const completedResults = allFights.filter(fight => {
    const r = resultsMap[fight];
    if (!r) return false;
    if (!r.winner || !r.method) return false;
    if (r.method !== "Decision" && (!r.round || r.round === "N/A" || r.round === "")) return false;
    return true;
  }).length;
  const resultsStarted = completedResults > 0 || resultRows.some(r => r[1] && r[2]); // any winner+method at all

  // If no results yet, suppress exposing participants to the frontend
  if (!resultsStarted) {
    output.scores = {}; // <- ensures the UI does NOT list users before results begin
  }

  // banner only when all results complete (current event champs)
  const allResultsFilled = allFights.length > 0 && completedResults === allFights.length;
  if (Object.keys(scores).length && allResultsFilled) {
    const maxScore = Math.max(...Object.values(scores));
    const champs = Object.entries(scores).filter(([_, s]) => s === maxScore).map(([u]) => u);
    if (champs.length) {
      output.champs = champs;
      output.champMessage = `Champion${champs.length > 1 ? "s" : ""} of the Week: ${champs.join(", ")}`;
    }
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetFights() {
  const rows = readFightListFlexible_();
  // keep old keys, add odds, so frontend can show 🐶 + odds chip
  const fights = rows.map(r => ({
    fight: r.fight,
    fighter1: r.fighter1,
    fighter2: r.fighter2,
    underdog: r.underdog,           // "Fighter 1" / "Fighter 2" / ""
    underdogOdds: r.underdogOdds,   // "+200" etc
    f1Odds: r.f1Odds || "",
    f2Odds: r.f2Odds || ""
  }));
  return ContentService.createTextOutput(JSON.stringify(fights))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================
   CHAMPION BANNER (robust)
   - Pull from "champions" sheet (last non-empty week)
   - Fallback to "weekly_leaderboard" latest week (rank=1)
   ========================= */
function getChampionBanner() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));

  // 1) Try champions sheet first
  const champSh = ss.getSheetByName("champions");
  if (champSh && champSh.getLastRow() >= 2) {
    const week = lastNonEmptyInColumn_(champSh, 1); // column A = week
    if (week) {
      const rows = champSh.getDataRange().getValues().slice(1)
        .filter(r => String(r[0] || "").trim() === week)
        .map(r => String(r[1] || "").trim())
        .filter(Boolean);
      const uniq = Array.from(new Set(rows));
      if (uniq.length) {
        const msg = `Champion${uniq.length > 1 ? "s" : ""} of the Week: ${uniq.join(", ")}`;
        return ContentService.createTextOutput(JSON.stringify({ message: msg }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // 2) Fallback: latest week in weekly_leaderboard (rank = 1)
  const wlSh = ss.getSheetByName("weekly_leaderboard");
  if (wlSh && wlSh.getLastRow() >= 2) {
    const weekWL = lastNonEmptyInColumn_(wlSh, 1); // column A = week
    if (weekWL) {
      const rows = wlSh.getDataRange().getValues().slice(1)
        .filter(r => String(r[0] || "").trim() === weekWL && Number(r[2]) === 1) // rank=1
        .map(r => String(r[1] || "").trim())
        .filter(Boolean);
      const uniq = Array.from(new Set(rows));
      if (uniq.length) {
        const msg = `Champion${uniq.length > 1 ? "s" : ""} of the Week: ${uniq.join(", ")}`;
        return ContentService.createTextOutput(JSON.stringify({ message: msg }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // 3) Nothing found
  return ContentService.createTextOutput(JSON.stringify({ message: "" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================
   SCORE ENGINE (shared)
   ========================= */
function computeScores_() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const picks = ss.getSheetByName("fight_picks").getDataRange().getValues().slice(1);
  const results = ss.getSheetByName("fight_results").getDataRange().getValues().slice(1);

  // Flexible fight list -> underdog maps
  const fightRows = readFightListFlexible_();
  const underdogMap = {};
  const underdogOddsMap = {};
  fightRows.forEach(r => {
    const key = String(r.fight).trim();
    if (r.underdog === "Fighter 1") underdogMap[key] = r.fighter1;
    if (r.underdog === "Fighter 2") underdogMap[key] = r.fighter2;
    if (r.underdogOdds) underdogOddsMap[key] = r.underdogOdds;
  });

  const resultsMap = {};
  results.forEach(row => {
    const [fight, winner, method, round] = row;
    if (!fight) return;
    resultsMap[String(fight).trim()] = {
      winner: winner != null ? String(winner).trim() : "",
      method: method != null ? String(method).trim() : "",
      round:  round  != null ? String(round).trim()  : ""
    };
  });

  const scores = {};
  const participants = new Set();

  picks.forEach(row => {
    const [user, fight, pickedWinner, pickedMethod, pickedRound] = row;
    if (!user) return;
    participants.add(user);
    if (scores[user] == null) scores[user] = 0;

    const r = resultsMap[fight];
    if (!r) return;

    const { winner, method, round } = r;
    const isCorrectWinner = pickedWinner === winner;
    const isCorrectMethod = pickedMethod === method;
    const isCorrectRound  = pickedRound == round;

    let s = 0;
    if (isCorrectWinner) {
      // 3–2–1 base
      s += 3;
      if (isCorrectMethod) {
        s += 2;
        if (method !== "Decision" && isCorrectRound) s += 1;
      }
      // underdog bonus when the actual underdog wins
      const uName = underdogMap[String(fight).trim()];
      if (uName && winner === uName) {
        const odds = underdogOddsMap[String(fight).trim()];
        s += underdogBonusFromOdds_(odds);
      }
    }
    scores[user] += s;
  });

  return { scores, participants: Array.from(participants) };
}

function rankFromScores_(allUsers, scoresObj) {
  const rows = allUsers.map(u => ({ username: u, points: Number(scoresObj[u] || 0) }));
  rows.sort((a,b) => b.points - a.points);
  let rank = 0, prevPts = null, seen = 0;
  rows.forEach(r => { seen++; if (r.points !== prevPts) { rank = seen; prevPts = r.points; } r.rank = rank; });
  return rows;
}

/* =========================
   LOG CHAMPION (idempotent + rebuild totals)
   ========================= */
function logChampion() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const picksSheet = ss.getSheetByName("fight_picks");
  const resultsSheet = ss.getSheetByName("fight_results");

  // Verify all fight results are complete (winner+method, round if not Decision)
  const results = resultsSheet.getDataRange().getValues().slice(1);
  const resultsMap = {};
  results.forEach(([fight, winner, method, round]) => {
    if (!fight) return;
    resultsMap[String(fight).trim()] = {
      winner: winner != null ? String(winner).trim() : "",
      method: method != null ? String(method).trim() : "",
      round:  round  != null ? String(round).trim()  : ""
    };
  });
  const allFights = Object.keys(resultsMap);
  if (!allFights.length) { SpreadsheetApp.getUi().alert("No fights in fight_results."); return; }
  const allFilled = allFights.every(f => {
    const r = resultsMap[f];
    if (!r.winner || !r.method) return false;
    if (r.method !== "Decision" && (!r.round || r.round === "N/A" || r.round === "")) return false;
    return true;
  });
  if (!allFilled) { SpreadsheetApp.getUi().alert("Results not complete yet."); return; }

  // Build scores & participants from current week (includes underdog tiers)
  const { scores, participants } = computeScores_();
  if (!participants.length) { SpreadsheetApp.getUi().alert("No participants in fight_picks."); return; }

  const ranked = rankFromScores_(participants, scores);
  const topPoints = Math.max(...ranked.map(r => r.points));
  const champs = ranked.filter(r => r.points === topPoints);

  // Label week and date
  const week = weekLabel_();
  const dateStr = Utilities.formatDate(tzNow_(), "America/Toronto", "yyyy-MM-dd");

  // 1) Write champions (replace this week if already present)
  const champSh = getOrCreateSheet_(ss, "champions", ["week","username","points","date","image","comment"]);
  removeRowsWhereColEquals_(champSh, 1, week);
  champs.forEach(r => champSh.appendRow([week, r.username, r.points, dateStr, "", ""]));

  // 2) Snapshot weekly_leaderboard (replace this week)
  const wl = getOrCreateSheet_(ss, "weekly_leaderboard", ["week","username","rank","points"]);
  removeRowsWhereColEquals_(wl, 1, week);
  const rows = ranked.map(r => [week, r.username, r.rank, r.points]);
  if (rows.length) wl.getRange(wl.getLastRow() + 1, 1, rows.length, 4).setValues(rows);

  // 3) Rebuild users_totals from scratch
  rebuildUsersTotalsFromSheets_(ss);

  SpreadsheetApp.getUi().alert(`Logged ${champs.length} champion${champs.length>1?"s":""} and rebuilt totals for ${week} ✅`);
}

/* =========================
   REBUILD users_totals (crowns from champions, events from weekly_leaderboard)
   Crown % column is a live formula = B / D
   ========================= */
function rebuildUsersTotalsFromSheets_(ss) {
  const champ = getOrCreateSheet_(ss, "champions", ["week","username","points","date","image","comment"]);
  const wl = getOrCreateSheet_(ss, "weekly_leaderboard", ["week","username","rank","points"]);
  const totals = getOrCreateSheet_(ss, "users_totals", ["username","crowns","crown_rate","events_played"]);

  // Build crowns map from champions
  const crownsMap = {};
  champ.getDataRange().getValues().slice(1).forEach(r => {
    const u = (r[1] || "").toString().trim();
    if (!u) return;
    crownsMap[u] = (crownsMap[u] || 0) + 1;
  });

  // Build events map from weekly_leaderboard
  const eventsMap = {};
  wl.getDataRange().getValues().slice(1).forEach(r => {
    const u = (r[1] || "").toString().trim();
    if (!u) return;
    eventsMap[u] = (eventsMap[u] || 0) + 1; // one row per week per user
  });

  const users = Array.from(new Set([...Object.keys(crownsMap), ...Object.keys(eventsMap)]));

  // Build array and sort (by computed rate desc, then crowns desc, events desc, name asc)
  const out = users.map(u => {
    const c = Number(crownsMap[u] || 0);
    const e = Number(eventsMap[u] || 0);
    const rateVal = e ? c / e : 0;
    return { u, c, e, rateVal };
  }).sort((a, b) => {
    if (b.rateVal !== a.rateVal) return b.rateVal - a.rateVal;
    if (b.c !== a.c) return b.c - a.c;
    if (b.e !== a.e) return b.e - a.e;
    return a.u.localeCompare(b.u);
  });

  // Clear & write values (C left blank; we’ll set a column formula)
  clearContentBelowHeader_(totals);
  if (out.length) {
    const values = out.map(r => [r.u, r.c, "", r.e]);
    totals.getRange(2, 1, values.length, 4).setValues(values);
  }

  // Set crown_rate formula (array) once starting at C2
  const formula = '=ARRAYFORMULA(IF(A2:A="",,IFERROR(B2:B / D2:D, 0)))';
  totals.getRange(2, 3).setFormula(formula);
  // Optional: format as percent for readability
  if (out.length) totals.getRange(2, 3, out.length, 1).setNumberFormat("0.00%");
}

/* =========================
   ALL-TIME API
   ========================= */
function getHall() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
  const totals = ss.getSheetByName("users_totals");
  if (!totals || totals.getLastRow() < 2) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const rows = totals.getDataRange().getValues().slice(1).map(r => ({
    username: r[0],
    crowns: Number(r[1]) || 0,
    crown_rate: Number(r[2]) || 0,        // already computed by sheet formula
    events_played: Number(r[3]) || 0
  }));

  rows.sort((a,b) => {
    if (b.crown_rate !== a.crown_rate) return b.crown_rate - a.crown_rate;
    if (b.crowns !== a.crowns) return b.crowns - a.crowns;
    if (b.events_played !== a.events_played) return b.events_played - a.events_played;
    return (a.username||"").localeCompare(b.username||"");
  });

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}
