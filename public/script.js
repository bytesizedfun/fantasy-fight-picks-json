PCKG JSON
{
  "name": "fantasy-fight-picks",
  "version": "1.0.0",
  "description": "A UFC fight picks app with leaderboard and scoring.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-fetch": "^2.6.7"
  },
  "keywords": [],
  "author": "joshbouw",
  "license": "MIT"
}

Html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fantasy Fight Picks</title>

  <!-- Orbitron font -->
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&display=swap" rel="stylesheet">

  <!-- Favicon / App Icons (updated) -->
  <link rel="icon" type="image/x-icon" href="./favicon.ico">
  <link rel="icon" type="image/png" sizes="48x48" href="./favicon-48.png">
  <link rel="icon" type="image/png" sizes="32x32" href="./favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="./favicon-16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">
  <link rel="manifest" href="./site.webmanifest">
  <meta name="theme-color" content="#0b0b0d">

  <link rel="stylesheet" href="style.css" />
  <script>
    window.API_BASE = window.API_BASE || "/api";
  </script>
</head>
<body>
  <!-- Logo -->
  <div class="banner-container">
    <img class="logo-banner" src="logo_fighter.png" alt="Logo" decoding="async" />
  </div>

  <!-- Champion banner (edge-to-edge) -->
  <div id="champBanner" class="champ-banner"></div>

  <div id="app">
    <!-- Username prompt -->
    <div id="usernamePrompt" class="card center">
      <div class="prompt-title">Enter Your Name</div>
      <input id="usernameInput" type="text" placeholder="e.g. Alex" />
      <button type="button">Let’s Go</button>
    </div>

    <!-- Welcome -->
    <div id="welcome" style="display:none;"></div>

    <!-- Scoring (collapsible only; content injected by JS) -->
    <details id="scoringPanel" class="rules-collapsible">
      <summary>
        <span class="rules-toggle-label">🧠 Scoring</span>
        <span class="rules-caret" aria-hidden="true">▸</span>
      </summary>
      <section id="scoringRules" class="rules"></section>
    </details>

    <!-- Fights -->
    <div id="fightList"></div>

    <!-- FOTN -->
    <div id="fotnBlock" style="display:none;"></div>

    <!-- Submit -->
    <button id="submitBtn" style="display:none;">Submit Picks</button>

    <!-- My Picks (hidden until user has picks) -->
    <section id="myPicks" style="display:none;"></section>

    <!-- Leaderboard title -->
    <h3 class="section-title section-title--leader" id="leaderboardTitle">LEADERBOARD</h3>

    <!-- Tabs -->
    <div class="segmented">
      <button id="tabWeekly" aria-pressed="true">Weekly</button>
      <button id="tabAllTime" aria-pressed="false">All-Time</button>
    </div>

    <!-- Leaderboards -->
    <ul id="leaderboard" class="board weekly"></ul>
    <ul id="allTimeBoard" class="board at-five" style="display:none;"></ul>
  </div>

  <!-- Discord CTA (bottom) -->
  <div class="cta-discord">
    <a class="btn-discord" href="https://discord.gg/azMMVrEB" target="_blank" rel="noopener">
      <span class="discord-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 245 240" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M104.4 103.9c-5.7 0-10.2 5-10.2 11.1 0 6.1 4.6 11.1 10.2 11.1 5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zm36.2 0c-5.7 0-10.2 5-10.2 11.1 0 6.1 4.6 11.1 10.2 11.1 5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z"/>
          <path d="M189.5 20h-134C24.8 20 5 39.8 5 64.5v111C5 200.2 24.8 220 49.5 220h113l-5.3-18.5 12.8 11.9 12.1 11.2 21.4 19.4V64.5C203.5 39.8 183.7 20 159 20zm-26.3 135s-2.5-3-4.6-5.6c9.2-2.6 12.7-8.4 12.7-8.4-2.9 1.9-5.7 3.2-8.2 4.1-3.6 1.5-7.1 2.5-10.5 3.1-6.9 1.3-13.2.9-18.6-.1-4.1-.8-7.7-1.9-10.7-3.1-1.7-.7-3.5-1.5-5.3-2.5-.2-.1-.4-.2-.5-.3-.1 0-.1-.1-.2-.1-.9-.5-1.4-.8-1.4-.8s3.4 5.7 12.4 8.3c-2.1 2.6-4.7 5.7-4.7 5.7-15.5-.5-21.4-10.7-21.4-10.7 0-22.7 10.2-41.1 10.2-41.1 10.2-7.6 19.9-7.4 19.9-7.4l.7.8c-12.8 3.7-18.7 9.4-18.7 9.4s1.6-.9 4.3-2.1c7.8-3.4 14-4.3 16.5-4.5.4-.1.8-.1 1.2-.1 4.3-.6 9.2-.8 14.3-.2 6.7.8 13.8 2.8 21.1 6.8 0 0-5.6-5.3-17.6-9l.9-1s9.7-.2 19.9 7.4c0 0 10.2 18.4 10.2 41.1 0 0-5.9 10.2-21.5 10.7z"/>
        </svg>
      </span>
      Join the trash talk
    </a>
  </div>

  <script src="script.js" defer></script>
</body>
</html>





Codegs
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
function tzNow_() { return new Date(); }
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
 return 1 + Math.floor((n - 100) / 100); // +100–199=+1, +200–299=+2, ...
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


/* Helper: Set of current event fight names (trimmed) */
function currentEventFightSet_() {
 const rows = readFightListFlexible_();
 const s = new Set();
 rows.forEach(r => { const k = String(r.fight || "").trim(); if (k) s.add(k); });
 return s;
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
  LIVE LEADERBOARD + FIGHTS (SCOPED TO CURRENT EVENT)
  ========================= */
function handleLeaderboard() {
 const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
 const picksSheet = ss.getSheetByName("fight_picks");
 const resultsSheet = ss.getSheetByName("fight_results");


 const pickRows = picksSheet.getDataRange().getValues().slice(1);
 const resultRows = resultsSheet.getDataRange().getValues().slice(1);


 // Only consider fights from the current event (fight_list)
 const currentFights = currentEventFightSet_();


 // Results map (current event only)
 const resultsMap = {};
 resultRows.forEach(row => {
   const [fight, winner, method, round] = row;
   const key = String(fight || "").trim();
   if (!key || !currentFights.has(key)) return;
   resultsMap[key] = {
     winner: winner != null ? String(winner).trim() : "",
     method: method != null ? String(method).trim() : "",
     round:  round  != null ? String(round).trim()  : ""
   };
 });


 // Underdog maps from current fight list
 const fightRows = readFightListFlexible_();
 const underdogMap = {};     // fight -> underdog fighter NAME
 const underdogOddsMap = {}; // fight -> "+240"
 fightRows.forEach(r => {
   const key = String(r.fight || "").trim();
   if (!key) return;
   if (r.underdog === "Fighter 1") underdogMap[key] = r.fighter1;
   if (r.underdog === "Fighter 2") underdogMap[key] = r.fighter2;
   if (r.underdogOdds) underdogOddsMap[key] = r.underdogOdds;
 });


 // FOTN official for current event
 const officialFOTN = readOfficialFOTN_();


 const scores = {};
 const fightResults = {};
 const participants = new Set();
 const fotnPoints = {};


 // Score only current-event picks
 pickRows.forEach(row => {
   const [username, fight, pickedWinner, pickedMethod, pickedRound] = row;
   const key = String(fight || "").trim();
   if (!username || !key || !currentFights.has(key)) return;


   participants.add(username);


   const result = resultsMap[key];
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
     const uName = underdogMap[key];
     if (uName && winner === uName) {
       const odds = underdogOddsMap[key];
       s += underdogBonusFromOdds_(odds);
     }
   }


   if (scores[username] == null) scores[username] = 0;
   scores[username] += s;


   if (!fightResults[key]) {
     const underdogF = underdogMap[key];
     const actualUnderdogWon = !!underdogF && underdogF === winner;
     fightResults[key] = { winner, method, round, underdog: actualUnderdogWon ? "Y" : "N" };
   }
 });


 const output = { scores, fightResults, officialFOTN, fotnPoints };


 // Determine progress scoped to current event
 const allFights = Object.keys(resultsMap);
 const completedResults = allFights.filter(f => {
   const r = resultsMap[f];
   if (!r) return false;
   if (!r.winner || !r.method) return false;
   if (r.method !== "Decision" && (!r.round || r.round === "N/A" || r.round === "")) return false;
   return true;
 }).length;
 const resultsStarted = completedResults > 0;


 // If no results yet, suppress exposing participants to the frontend
 if (!resultsStarted) {
   output.scores = {}; // UI won’t list users until results begin
 }


 // banner only when all current-event results complete
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
  CHAMPION BANNER — prefers weekly_leaderboard (latest week with rank=1)
  ========================= */
function findLatestWeekWithRank1InWeekly_(wlSh) {
 const lastRow = wlSh.getLastRow();
 if (lastRow < 2) return "";
 const vals = wlSh.getDataRange().getValues(); // includes header
 let currentWeek = "";
 let seenRank1InCurrent = false;
 for (let i = vals.length - 1; i >= 1; i--) {
   const row = vals[i];
   const week = String(row[0] || "").trim();
   const rank = Number(row[2]);
   if (!week) continue;


   if (currentWeek === "") {
     currentWeek = week;
     seenRank1InCurrent = (rank === 1);
   } else if (week === currentWeek) {
     if (rank === 1) seenRank1InCurrent = true;
   } else {
     // Switched to earlier week
     if (seenRank1InCurrent) return currentWeek;
     currentWeek = week;
     seenRank1InCurrent = (rank === 1);
   }
 }
 return seenRank1InCurrent ? currentWeek : "";
}


function getChampionBanner() {
 const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));


 // 1) Prefer weekly_leaderboard latest week that has rank=1
 const wlSh = ss.getSheetByName("weekly_leaderboard");
 if (wlSh && wlSh.getLastRow() >= 2) {
   const targetWeek = findLatestWeekWithRank1InWeekly_(wlSh);
   if (targetWeek) {
     const rows = wlSh.getDataRange().getValues().slice(1)
       .filter(r => String(r[0] || "").trim() === targetWeek && Number(r[2]) === 1)
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


 // 2) Fallback: champions sheet (last non-empty week in col A)
 const champSh = ss.getSheetByName("champions");
 if (champSh && champSh.getLastRow() >= 2) {
   const week = lastNonEmptyInColumn_(champSh, 1);
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


 // 3) Nothing found
 return ContentService.createTextOutput(JSON.stringify({ message: "" }))
   .setMimeType(ContentService.MimeType.JSON);
}


/* =========================
  SCORE ENGINE (shared, SCOPED)
  ========================= */
function computeScores_() {
 const ss = SpreadsheetApp.openById(getSpreadsheetId("fight_picks"));
 const picks = ss.getSheetByName("fight_picks").getDataRange().getValues().slice(1);
 const results = ss.getSheetByName("fight_results").getDataRange().getValues().slice(1);


 const currentFights = currentEventFightSet_();


 // Underdog maps (current event only)
 const fightRows = readFightListFlexible_();
 const underdogMap = {};
 const underdogOddsMap = {};
 fightRows.forEach(r => {
   const key = String(r.fight || "").trim();
   if (!key) return;
   if (r.underdog === "Fighter 1") underdogMap[key] = r.fighter1;
   if (r.underdog === "Fighter 2") underdogMap[key] = r.fighter2;
   if (r.underdogOdds) underdogOddsMap[key] = r.underdogOdds;
 });


 // Results map (current event only)
 const resultsMap = {};
 results.forEach(row => {
   const [fight, winner, method, round] = row;
   const key = String(fight || "").trim();
   if (!key || !currentFights.has(key)) return;
   resultsMap[key] = {
     winner: winner != null ? String(winner).trim() : "",
     method: method != null ? String(method).trim() : "",
     round:  round  != null ? String(round).trim()  : ""
   };
 });


 const scores = {};
 const participants = new Set();


 // Only current-event picks
 picks.forEach(row => {
   const [user, fight, pickedWinner, pickedMethod, pickedRound] = row;
   const key = String(fight || "").trim();
   if (!user || !key || !currentFights.has(key)) return;


   participants.add(user);
   if (scores[user] == null) scores[user] = 0;


   const r = resultsMap[key];
   if (!r) return;


   const { winner, method, round } = r;
   const isCorrectWinner = pickedWinner === winner;
   const isCorrectMethod = pickedMethod === method;
   const isCorrectRound  = pickedRound == round;


   let s = 0;
   if (isCorrectWinner) {
     s += 3;
     if (isCorrectMethod) {
       s += 2;
       if (method !== "Decision" && isCorrectRound) s += 1;
     }
     const uName = underdogMap[key];
     if (uName && winner === uName) {
       const odds = underdogOddsMap[key];
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
 const resultsSheet = ss.getSheetByName("fight_results");


 const currentFights = currentEventFightSet_();


 // Verify all current-event results are complete (winner+method, round if not Decision)
 const results = resultsSheet.getDataRange().getValues().slice(1);
 const resultsMap = {};
 results.forEach(([fight, winner, method, round]) => {
   const key = String(fight || "").trim();
   if (!key || !currentFights.has(key)) return;
   resultsMap[key] = {
     winner: winner != null ? String(winner).trim() : "",
     method: method != null ? String(method).trim() : "",
     round:  round  != null ? String(round).trim()  : ""
   };
 });
 const allFights = Object.keys(resultsMap);
 if (!allFights.length) { SpreadsheetApp.getUi().alert("No current-event fights in fight_results."); return; }
 const allFilled = allFights.every(f => {
   const r = resultsMap[f];
   if (!r.winner || !r.method) return false;
   if (r.method !== "Decision" && (!r.round || r.round === "N/A" || r.round === "")) return false;
   return true;
 });
 if (!allFilled) { SpreadsheetApp.getUi().alert("Results not complete yet for current event."); return; }


 // Build scores & participants for the current event only
 const { scores, participants } = computeScores_();
 if (!participants.length) { SpreadsheetApp.getUi().alert("No participants (current event)."); return; }


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


 // Build events map from weekly_leaderboard (one row per user per week)
 const eventsMap = {};
 wl.getDataRange().getValues().slice(1).forEach(r => {
   const u = (r[1] || "").toString().trim();
   if (!u) return;
   eventsMap[u] = (eventsMap[u] || 0) + 1;
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


















SERVER JS
const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Google Apps Script Web App URL (defined BEFORE use)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

app.use(express.json());
app.use(express.static("public"));

// ✅ Updated Lockout Time: August 16, 2025 @ 6:00 PM ET
const lockoutTime = new Date("2025-08-16T18:00:00-04:00"); // ET in August = UTC-04:00

// ✅ Endpoint to check lockout status (for frontend)
app.get("/api/lockout", (req, res) => {
  const now = new Date();
  const locked = now >= lockoutTime;
  res.json({ locked });
});

// ✅ Fetch Fights
app.get("/api/fights", async (req, res) => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    const fights = await response.json();
    res.json(fights);
  } catch (error) {
    console.error("getFights error:", error);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

// ✅ Submit Picks (with lockout logic)
app.post("/api/submit", async (req, res) => {
  const now = new Date();
  if (now >= lockoutTime) {
    return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
  }

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "submitPicks", ...req.body }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("submitPicks error:", error);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

// ✅ Get User Picks
app.post("/api/picks", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getUserPicks", ...req.body }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("getUserPicks error:", error);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

// ✅ Get Weekly Leaderboard
app.post("/api/leaderboard", async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getLeaderboard" }),
      headers: { "Content-Type": "application/json" }
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("getLeaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ✅ NEW: All-Time (Hall) via GAS getHall
app.get("/api/hall", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" }
    });
    res.set("Cache-Control", "no-store");
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error("getHall error:", e);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




Script js

document.addEventListener("DOMContentLoaded", () => {
  const BASE = window.API_BASE || "/api";

  const withTimeout = (p, ms = 10000) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), ms);
      p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });

  async function detectApiMode() {
    const cached = localStorage.getItem("apiMode");
    if (cached === "path" || cached === "action") return cached;

    try {
      const r = await withTimeout(fetch(`${BASE.replace(/\/$/,"")}/fights`, { method: "GET" }), 7000);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) { localStorage.setItem("apiMode", "path"); return "path"; }
      }
    } catch (_) {}

    try {
      const sep = BASE.includes("?") ? "&" : "?";
      const r = await withTimeout(fetch(`${BASE}${sep}action=getFights`, { method: "GET" }), 7000);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) { localStorage.setItem("apiMode", "action"); return "action"; }
      }
    } catch (_) {}

    localStorage.setItem("apiMode", "path");
    return "path";
  }
  function clearApiModeCache() { localStorage.removeItem("apiMode"); }

  const api = {
    mode: "path",
    async init() { this.mode = await detectApiMode(); },

    getFights() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/fights`).then(r => r.json());
      } else {
        const sep = BASE.includes("?") ? "&" : "?";
        return fetch(`${BASE}${sep}action=getFights`).then(r => r.json());
      }
    },

    getUserPicks(username) {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/picks`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ username })
        }).then(r => r.json());
      } else {
        return fetch(BASE, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ action:"getUserPicks", username })
        }).then(r => r.json());
      }
    },

    submitPicks(payload) {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/submit`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        return fetch(BASE, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ action:"submitPicks", ...payload })
        }).then(r => r.json());
      }
    },

    getLeaderboard() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/leaderboard`, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({})
        }).then(r => r.json());
      } else {
        return fetch(BASE, {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ action:"getLeaderboard" })
        }).then(r => r.json());
      }
    },

    getChampionBanner() {
      const sep = BASE.includes("?") ? "&" : "?";
      return fetch(`${BASE}${sep}action=getChampionBanner`).then(r => r.json());
    },

    getHall() {
      if (this.mode === "path") {
        return fetch(`${BASE.replace(/\/$/,"")}/hall`).then(r => r.json());
      } else {
        const sep = BASE.includes("?") ? "&" : "?";
        return fetch(`${BASE}${sep}action=getHall`).then(r => r.json());
      }
    },

    resetDetection() { clearApiModeCache(); }
  };

  /* =========================
     DOM refs
     ========================= */
  const welcome = document.getElementById("welcome");
  const fightList = document.getElementById("fightList");
  const submitBtn = document.getElementById("submitBtn");
  const usernamePrompt = document.getElementById("usernamePrompt");
  const usernameInput = document.getElementById("usernameInput");
  const champBanner = document.getElementById("champBanner");
  const leaderboardEl = document.getElementById("leaderboard");
  const allTimeList = document.getElementById("allTimeBoard");
  const weeklyTabBtn = document.getElementById("tabWeekly");
  const allTimeTabBtn = document.getElementById("tabAllTime");
  const fotnBlock = document.getElementById("fotnBlock");
  let fotnSelect = null;

  let username = localStorage.getItem("username");

  const fightMeta = new Map();
  const FOTN_POINTS = 3;

  /* ---------- Perf caches ---------- */
  const now = () => Date.now();
  const FIGHTS_TTL = 5 * 60 * 1000;
  const LB_TTL    = 0; // immediate refresh

  let fightsCache = { data: null, ts: 0, promise: null };
  let lbCache     = { data: null, ts: 0, promise: null };

  function getFightsCached() {
    const fresh = fightsCache.data && (now() - fightsCache.ts < FIGHTS_TTL);
    if (fresh) return Promise.resolve(fightsCache.data);
    if (fightsCache.promise) return fightsCache.promise;

    fightsCache.promise = api.getFights()
      .then(data => {
        fightsCache = { data, ts: now(), promise: null };
        buildFightMeta(data);
        return data;
      })
      .catch(err => { fightsCache.promise = null; throw err; });

    return fightsCache.promise;
  }
  function getLeaderboardCached() {
    const fresh = lbCache.data && (now() - lbCache.ts < LB_TTL);
    if (fresh) return Promise.resolve(lbCache.data);
    if (lbCache.promise) return lbCache.promise;

    lbCache.promise = api.getLeaderboard()
      .then(data => { lbCache = { data, ts: now(), promise: null }; return data; })
      .catch(err => { lbCache.promise = null; throw err; });

    return lbCache.promise;
  }

  function normalizeAmericanOdds(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === "") return null;
    const m = s.match(/[+-]?\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    return isFinite(n) ? n : null;
  }
  function underdogBonusFromOdds(oddsRaw) {
    const n = normalizeAmericanOdds(oddsRaw);
    if (n == null || n < 100) return 0;
    return 1 + Math.floor((n - 100) / 100);
  }

  function doLogin() {
    const input = usernameInput.value.trim();
    if (!input) return alert("Please enter your name.");
    username = input;
    localStorage.setItem("username", username);
    startApp();
  }

  document.querySelector("#usernamePrompt button")?.addEventListener("click", doLogin);
  usernameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  (function renderScoringRules(){
    const el = document.getElementById("scoringRules");
    if (!el) return;
    el.innerHTML = `
      <ul class="rules-list">
        <li>+3 for winner</li>
        <li>+2 for method <span class="muted">(if winner is correct)</span></li>
        <li>+1 for round <span class="muted">(if winner & method are correct)</span></li>
        <li>Bonus points for underdogs</li>
        <li>Pick the correct FOTN for 3 points</li>
      </ul>
    `;
  })();

  if (username) {
    usernameInput.value = username;
    startApp();
  }

  async function startApp() {
    usernamePrompt.style.display = "none";
    welcome.innerText = `🎤 IIIIIIIIIIIIT'S ${String(username || "").toUpperCase()}!`;
    welcome.style.display = "block";

    await api.init();

    Promise.all([ getFightsCached(), api.getUserPicks(username) ])
      .then(([fightsData, pickData]) => {
        const submitted = pickData.success && Array.isArray(pickData.picks) && pickData.picks.length > 0;
        if (submitted) {
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          fotnBlock.style.display = "none";
        } else {
          localStorage.removeItem("submitted");
          renderFightList(fightsData);
          renderFOTN(fightsData, pickData.fotnPick);
          submitBtn.style.display = "block";
        }

        leaderboardEl.classList.add("board","weekly");
        loadMyPicks();
        loadLeaderboard();
        preloadAllTime();
      })
      .catch((err) => {
        console.error("Startup error:", err);
        fightList.innerHTML = `<div class="board-hint">Server unavailable. Check API base in index.html (window.API_BASE).</div>`;
        submitBtn.style.display = "none";
      });
  }

  function buildFightMeta(data) {
    fightMeta.clear();
    (data || []).forEach(({ fight, fighter1, fighter2, underdog, underdogOdds, f1Odds, f2Odds }) => {
      fightMeta.set(fight, {
        f1: fighter1, f2: fighter2,
        f1Odds: f1Odds || "", f2Odds: f2Odds || "",
        underdogSide: underdog || "", underdogOdds: underdogOdds || ""
      });
    });
  }

  /* ---------- Fights ---------- */
  function renderFOTN(fightsData, existingPick = "") {
    fotnBlock.innerHTML = `
      <div class="fotn-title">⭐ Fight of the Night</div>
      <select id="fotnSelect" class="fotn-select"></select>
    `;
    fotnSelect = document.getElementById("fotnSelect");

    const names = (fightsData || []).map(f => f.fight);
    if (!names.length) { fotnBlock.style.display = "none"; return; }
    fotnSelect.innerHTML = `<option value="">— Select your FOTN —</option>` +
      names.map(n => `<option value="${n}">${n}</option>`).join("");
    if (existingPick) fotnSelect.value = existingPick;
    fotnBlock.style.display = "flex";
  }

  function renderFightList(data) {
    fightList.innerHTML = "";
    (data || []).forEach(({ fight, fighter1, fighter2 }) => {
      const meta = fightMeta.get(fight) || {};
      const dogSide = meta.underdogSide;
      const dogTier = underdogBonusFromOdds(meta.underdogOdds);

      const isDog1 = dogSide === "Fighter 1";
      const isDog2 = dogSide === "Fighter 2";

      const dog1 = (isDog1 && dogTier > 0) ? `🐶 +${dogTier} pts` : "";
      const dog2 = (isDog2 && dogTier > 0) ? `🐶 +${dogTier} pts` : "";

      const chip1 = dog1 ? `<span class="dog-tag dog-tag--plain">${dog1}</span>` : "";
      const chip2 = dog2 ? `<span class="dog-tag dog-tag--plain">${dog2}</span>` : "";

      const div = document.createElement("div");
      div.className = "fight";
      div.innerHTML = `
        <h3>${fight}</h3>

        <div class="options">
          <label>
            <input type="radio" name="${fight}-winner" value="${fighter1}">
            <span class="pick-row">
              <span class="fighter-name ${isDog1 ? 'is-underdog' : ''}">
                ${fighter1} ${chip1}
              </span>
            </span>
          </label>

          <label>
            <input type="radio" name="${fight}-winner" value="${fighter2}">
            <span class="pick-row">
              <span class="fighter-name ${isDog2 ? 'is-underdog' : ''}">
                ${fighter2} ${chip2}
              </span>
            </span>
          </label>
        </div>

        <div class="pick-controls">
          <select name="${fight}-method">
            <option value="Decision">Decision</option>
            <option value="KO/TKO">KO/TKO</option>
            <option value="Submission">Submission</option>
          </select>
          <select name="${fight}-round">
            <option value="1">Round 1</option>
            <option value="2">Round 2</option>
            <option value="3">Round 3</option>
            <option value="4">Round 4</option>
            <option value="5">Round 5</option>
          </select>
        </div>
      `;
      fightList.appendChild(div);
    });

    // Decision disables round
    document.querySelectorAll(".fight").forEach(fight => {
      const methodSelect = fight.querySelector(`select[name$="-method"]`);
      const roundSelect = fight.querySelector(`select[name$="-round"]`);
      if (!methodSelect || !roundSelect) return;
      function syncRound() {
        const isDecision = methodSelect.value === "Decision";
        roundSelect.disabled = isDecision;
        roundSelect.value = isDecision ? "" : (roundSelect.value || "1");
      }
      methodSelect.addEventListener("change", syncRound);
      syncRound();
    });

    fightList.style.display = "flex";
    submitBtn.style.display = "block";
  }

  /* ---------- Submit picks ---------- */
  function submitPicks() {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    const picks = [];
    const fights = document.querySelectorAll(".fight");

    for (const fight of fights) {
      const fightName = fight.querySelector("h3").innerText;
      const winner = fight.querySelector(`input[name="${fightName}-winner"]:checked`)?.value;
      const method = fight.querySelector(`select[name="${fightName}-method"]`)?.value;
      const roundRaw = fight.querySelector(`select[name="${fightName}-round"]`);
      const round = roundRaw && !roundRaw.disabled ? roundRaw.value : "";

      if (!winner || !method) {
        alert(`Please complete all picks. Missing data for "${fightName}".`);
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
        return;
      }
      picks.push({ fight: fightName, winner, method, round });
    }

    const fotnPick = fotnSelect?.value || "";

    api.submitPicks({ username, picks, fotnPick })
      .then(data => {
        if (data.success) {
          alert("Picks submitted!");
          localStorage.setItem("submitted", "true");
          fightList.style.display = "none";
          submitBtn.style.display = "none";
          fotnBlock.style.display = "none";
          lbCache = { data: null, ts: 0, promise: null }; // refresh scoreboard immediately
          loadMyPicks();
          loadLeaderboard();
        } else {
          alert(data.error || "Something went wrong.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Picks";
        }
      })
      .catch(() => {
        alert("Network error submitting picks.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Picks";
      });
  }
  submitBtn.addEventListener("click", submitPicks);
  window.submitPicks = submitPicks;

  /* ---------- My Picks ---------- */
  function loadMyPicks() {
    api.getUserPicks(username)
      .then(data => {
        const myPicksDiv = document.getElementById("myPicks");
        if (!data.success || !data.picks.length) {
          myPicksDiv.style.display = "none";
          myPicksDiv.innerHTML = "";
          return;
        }

        myPicksDiv.style.display = "grid";
        myPicksDiv.innerHTML = "<h3>Your Picks:</h3>";

        Promise.all([ getLeaderboardCached(), getFightsCached() ]).then(([resultData, fightsData]) => {
          buildFightMeta(fightsData);

          const fightResults = resultData.fightResults || {};
          const officialFOTN = resultData.officialFOTN || [];
          const myFOTN = data.fotnPick || "";

          if (myFOTN) {
            const gotIt = officialFOTN.length && officialFOTN.includes(myFOTN);
            const badge = gotIt ? `<span class="points">+${FOTN_POINTS} pts</span>` : "";
            myPicksDiv.innerHTML += `
              <div class="scored-pick fotn-strip">
                <div class="fight-name">⭐ Fight of the Night</div>
                <div class="user-pick ${gotIt ? 'correct' : (officialFOTN.length ? 'wrong' : '')}">
                  ${myFOTN} ${badge}
                  ${officialFOTN.length ? `<div class="hint">Official: ${officialFOTN.join(", ")}</div>` : ""}
                </div>
              </div>
            `;
          }

          data.picks.forEach(({ fight, winner, method, round }) => {
            const actual = fightResults[fight] || {};
            const hasResult = actual.winner && actual.method;

            const matchWinner = hasResult && winner === actual.winner;
            const matchMethod = hasResult && method === actual.method;
            const matchRound  = hasResult && round == actual.round;

            const meta = fightMeta.get(fight) || {};
            const dogSide = meta.underdogSide;
            const dogTier = underdogBonusFromOdds(meta.underdogOdds);
            const chosenIsUnderdog =
              (dogSide === "Fighter 1" && winner === meta.f1) ||
              (dogSide === "Fighter 2" && winner === meta.f2);

            const dogChip = (chosenIsUnderdog && dogTier > 0)
              ? `<span class="dog-tag dog-tag--chip">🐶 +${dogTier} pts</span>`
              : "";

            let score = 0;
            if (matchWinner) {
              score += 3;
              if (matchMethod) {
                score += 2;
                if (method !== "Decision" && matchRound) score += 1;
              }
              if (hasResult && actual.underdog === "Y" && chosenIsUnderdog) {
                score += dogTier;
              }
            }

            const winnerClass = hasResult ? (matchWinner ? "correct" : "wrong") : "";
            const methodClass = hasResult && matchWinner ? (matchMethod ? "correct" : "wrong") : "";
            const roundClass  = hasResult && matchWinner && matchMethod && method !== "Decision"
              ? (matchRound ? "correct" : "wrong")
              : "";

            let winnerHtml, methodHtml, roundHtml;

            if (!hasResult) {
              winnerHtml = `<span class="winner-text pre">${winner}</span>`;
              methodHtml = `<span class="method-text pre">${method}</span>`;
              roundHtml  = (method === "Decision") ? "" : `in Round <span class="chip chip-round">${round}</span>`;
            } else {
              winnerHtml = `<span class="winner-text ${winnerClass}">${winner}</span>`;
              methodHtml = `<span class="${methodClass}">${method}</span>`;
              roundHtml  = (method === "Decision") ? "" : `in Round <span class="chip chip-round ${roundClass}">${round}</span>`;
            }

            const pointsChip = hasResult ? `<span class="points">+${score} pts</span>` : "";

            const earnNote = (hasResult && matchWinner && actual.underdog === "Y" && chosenIsUnderdog && dogTier > 0)
              ? `<span class="earn-note">🐶 +${dogTier} bonus points</span>`
              : (!hasResult && chosenIsUnderdog && dogTier > 0)
                ? `<span class="earn-note">🐶 +${dogTier} potential bonus if correct</span>`
                : "";

            myPicksDiv.innerHTML += `
              <div class="scored-pick">
                <div class="fight-name">${fight}</div>
                <div class="user-pick">
                  ${winnerHtml} ${dogChip}
                  &nbsp;by&nbsp; ${methodHtml} ${roundHtml}
                  ${earnNote}
                </div>
                ${pointsChip}
              </div>`;
          });
        });
      });
  }

  /* ---------- Champion banner + Weekly Leaderboard ---------- */
  function showPreviousChampionBanner() {
    api.getChampionBanner()
      .then(data => {
        const msg = (data && typeof data.message === "string") ? data.message.trim() : "";
        if (msg) {
          champBanner.textContent = `🏆 ${msg.replace(/^🏆\s*/,"")}`;
          champBanner.style.display = "block";
        }
      })
      .catch(() => { /* silent */ });
  }

  function loadLeaderboard() {
    showPreviousChampionBanner();

    Promise.all([ getFightsCached(), getLeaderboardCached() ]).then(([fightsData, leaderboardData]) => {
      const board = leaderboardEl;
      board.classList.add("board","weekly");
      board.innerHTML = "";

      const resultsArr = Object.values(leaderboardData.fightResults || {});
      const resultsStarted = resultsArr.some(r => r && r.winner && r.method);

      if (!resultsStarted) {
        const hint = document.createElement("li");
        hint.className = "board-hint";
        hint.textContent = "Weekly standings will appear once results start.";
        board.appendChild(hint);
        return;
      }

      const scores = Object.entries(leaderboardData.scores || {}).sort((a, b) => b[1] - a[1]);

      let rank = 1;
      let prevScore = null;
      let actualRank = 1;

      scores.forEach(([user, score], index) => {
        if (score !== prevScore) actualRank = rank;

        const li = document.createElement("li");
        let displayName = user;
        const classes = [];

        if (leaderboardData.champs?.includes(user)) {
          classes.push("champ-glow");
          displayName = `<span class="crown">👑</span> ${displayName}`;
        }
        if (scores.length >= 3 && index === scores.length - 1) {
          classes.push("loser");
          displayName = `💩 ${displayName}`;
        }
        if (user === username) classes.push("current-user");

        li.className = classes.join(" ");
        li.innerHTML = `<span>#${actualRank}</span> <span>${displayName}</span><span>${score} pts</span>`;
        board.appendChild(li);

        prevScore = score;
        rank++;
      });

      const lis = board.querySelectorAll("li");
      if (lis.length > 0) {
        const topScore = parseInt(lis[0].lastElementChild.textContent, 10);
        lis.forEach(li => {
          const val = parseInt(li.lastElementChild.textContent, 10);
          if (val === topScore) li.classList.add("tied-first");
        });
      }

      const totalFights = (fightsData || []).length;
      const completedResults = resultsArr.filter(res => res.winner && res.method && (res.method === "Decision" || (res.round && res.round !== "N/A"))).length;

      if (leaderboardData.champMessage && totalFights > 0 && completedResults === totalFights) {
        champBanner.textContent = `🏆 ${leaderboardData.champMessage}`;
        champBanner.style.display = "block";
      }
    });
  }

  /* ---------- All-Time Leaderboard ---------- */
  let allTimeLoaded = false;
  let allTimeData = [];

  function sortAllTime(rows) {
    const cleaned = (rows || []).filter(r => r && r.username && String(r.username).trim() !== "");
    return cleaned
      .map(r => ({ user: r.username, crowns: +r.crowns || 0, events: +r.events_played || 0, rate: +r.crown_rate || 0 }))
      .sort((a,b) => (b.rate - a.rate) || (b.crowns - a.crowns) || (b.events - a.events) || (a.user || "").localeCompare(b.user || ""));
  }
  function rowsEqual(a, b) { return a && b && a.rate === b.rate && a.crowns === b.crowns && a.events === b.events; }

  function renderAllTimeHeader() {
    const li = document.createElement("li");
    li.className = "board-header at-five";
    li.innerHTML = `
      <span>Rank</span>
      <span>Player</span>
      <span>%</span>
      <span>👑</span>
      <span>Events</span>
    `;
    allTimeList.appendChild(li);
  }

  function drawAllTime(data) {
    allTimeList.innerHTML = "";
    if (!data.length) { allTimeList.innerHTML = "<li>No All-Time data yet.</li>"; return; }

    renderAllTimeHeader();

    let rank = 0;
    let prev = null;

    data.forEach((row, idx) => {
      rank = (idx === 0 || !rowsEqual(row, prev)) ? (idx + 1) : rank;
      const isTop = rank === 1;

      const li = document.createElement("li");
      const classes = [];
      if (row.user === username) classes.push("current-user");
      if (isTop) classes.push("tied-first");
      li.className = classes.join(" ") + " at-five";

      const rankLabel = isTop ? "🥇" : `#${rank}`;
      const pct = (row.rate * 100).toFixed(1) + "%";

      li.innerHTML = `
        <span class="rank">${rankLabel}</span>
        <span class="user" title="${row.user}">${row.user}</span>
        <span class="num rate">${pct}</span>
        <span class="num crowns">${row.crowns}</span>
        <span class="num events">${row.events}</span>
        <span class="mobile-meta" aria-hidden="true">👑 ${row.crowns}/${row.events} events • ${pct}</span>
      `;
      allTimeList.appendChild(li);
      prev = row;
    });
  }

  function preloadAllTime() {
    api.getHall().then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; }).catch(() => {});
  }

  function loadAllTimeInteractive() {
    if (allTimeLoaded) { drawAllTime(allTimeData); return; }
    const keepHeight = leaderboardEl?.offsetHeight || 260;
    allTimeList.style.minHeight = `${keepHeight}px`;
    allTimeList.innerHTML = "";

    api.getHall()
      .then(rows => { allTimeData = sortAllTime(rows); allTimeLoaded = true; drawAllTime(allTimeData); })
      .catch(() => { allTimeList.innerHTML = `<li>All-Time unavailable.</li>`; })
      .finally(() => { allTimeList.style.minHeight = ""; });
  }

  /* ---------- Tabs ---------- */
  weeklyTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    leaderboardEl.style.display = "block";
    allTimeList.style.display = "none";
    weeklyTabBtn.setAttribute("aria-pressed","true");
    allTimeTabBtn.setAttribute("aria-pressed","false");
  });

  allTimeTabBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    loadAllTimeInteractive();
    leaderboardEl.style.display = "none";
    allTimeList.style.display = "block";
    weeklyTabBtn.setAttribute("aria-pressed","false");
    allTimeTabBtn.setAttribute("aria-pressed","true");
  });
});




