// server.js
// Express server + UFCStats result scraper + GAS bridge (Render-ready)

const express = require("express");
const cheerio = require("cheerio"); // use cheerio.load(html) -> $
const app = express();
const PORT = process.env.PORT || 3000;

// ======== CONFIG ========
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

const UFC_BASE = "http://www.ufcstats.com"; // UFCStats is served over http

// ======== MIDDLEWARE ========
app.use(express.json());
app.use(express.static("public"));
// tiny request logger so you can see traffic in Render logs
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ======== HEALTH ========
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ======== GAS PROXY ENDPOINTS FOR YOUR FRONTEND ========
app.get("/api/fights", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`);
    res.json(await r.json());
  } catch (e) {
    console.error("getFights:", e);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

app.post("/api/leaderboard", async (_req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" }),
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getLeaderboard:", e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.get("/api/hall", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.set("Cache-Control", "no-store");
    res.json(await r.json());
  } catch (e) {
    console.error("getHall:", e);
    res.status(500).json([]);
  }
});

app.get("/api/champion", async (_req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`);
    res.json(await r.json());
  } catch (e) {
    console.error("getChampionBanner:", e);
    res.status(500).json({ message: "" });
  }
});

// ✅ Submit picks -> GAS
app.post("/api/submit", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitPicks", ...req.body }),
    });
    const j = await r.json();
    res.json(j);
  } catch (e) {
    console.error("submitPicks:", e);
    res.status(500).json({ success: false, error: "Failed to submit picks" });
  }
});

// ✅ Get user picks -> GAS
app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getUserPicks", ...req.body }),
    });
    const j = await r.json();
    res.json(j);
  } catch (e) {
    console.error("getUserPicks:", e);
    res.status(500).json({ success: false, error: "Failed to fetch picks" });
  }
});

// ======== SCRAPER CORE (Cheerio) ========
async function fetchHTML(url, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function toEventUrl(ref) {
  if (/^https?:\/\/.+\/event-details\/[a-z0-9]+/i.test(ref))
    return ref.replace(/^http:/i, "http:");
  if (/^[a-z0-9]+$/i.test(ref)) return `${UFC_BASE}/event-details/${ref}`;
  throw new Error("Bad UFCStats ref. Provide full event URL or the event ID.");
}

function normalizeMethod(txt) {
  const s = (txt || "").toUpperCase();
  if (s.includes("DECISION")) return "Decision";
  if (s.includes("KO") || s.includes("TKO")) return "KO/TKO";
  if (s.includes("SUB")) return "Submission";
  return "";
}

// --- NEW robust metadata readers (fixes Round 0 issue) ---
function readMetaBlock($) {
  // Grab the combined text that contains "Method:", "Round:", "Time:", "Referee:"
  // This selector covers current UFCStats markup reliably.
  const txt = $(".b-fight-details__content .b-fight-details__text")
    .text()
    .replace(/\s+/g, " ")
    .trim();
  return txt;
}

function parseMethodAndRound(metaText) {
  // Method: take the token after "Method:" until a known next field
  const m = metaText.match(/Method:\s*([A-Za-z/ \-]+?)(?=\s{2,}|Round:|Time:|Referee:|$)/i);
  const methodRaw = (m && m[1] ? m[1].trim() : "");
  // Round: strictly the integer after "Round:", not the Time line
  const r = metaText.match(/Round:\s*(\d+)/i);
  const roundRaw = (r && r[1] ? r[1].trim() : "");
  return { methodRaw, roundRaw };
}

async function scrapeFightDetails(fightId) {
  const html = await fetchHTML(`${UFC_BASE}/fight-details/${fightId}`);
  const $ = cheerio.load(html);

  const persons = $(".b-fight-details__person");
  const names = persons
    .map((_, el) =>
      $(el).find(".b-fight-details__person-name a").first().text().trim()
    )
    .get();

  let winner = "";
  persons.each((_, el) => {
    const status = $(el).find(".b-fight-details__person-status").text().trim();
    if (/^W\b/i.test(status)) {
      const n = $(el)
        .find(".b-fight-details__person-name a")
        .first()
        .text()
        .trim();
      if (n) winner = n;
    }
  });

  // NEW: robust meta parsing to avoid grabbing "Time: 0:xx" as the round
  const metaText = readMetaBlock($);
  const { methodRaw, roundRaw } = parseMethodAndRound(metaText);

  const method = normalizeMethod(methodRaw);
  const round = method === "Decision" ? "N/A" : (roundRaw || "");
  const finished = !!(winner && method && (method === "Decision" || round));

  return {
    fighter1: names[0] || "",
    fighter2: names[1] || "",
    result: finished
      ? { status: "Final", winner, method, round }
      : { status: "Scheduled" },
  };
}

async function firstEventUrl(listPath /* "upcoming" | "completed" */) {
  const html = await fetchHTML(`${UFC_BASE}/statistics/events/${listPath}`);
  const $ = cheerio.load(html);
  const first = $('a[href*="/event-details/"]').first().attr("href");
  if (!first) throw new Error("No events found");
  return first.replace(/^http:/i, "http:");
}

async function scrapeEvent(ref) {
  const eventUrl = toEventUrl(ref);
  const html = await fetchHTML(eventUrl);
  const $ = cheerio.load(html);

  const eventName = $(".b-content__title-highlight").first().text().trim();

  let eventDate = "";
  $(".b-list__box-list-item").each((_, el) => {
    const t = $(el).text().trim();
    if (/^Date:/i.test(t)) eventDate = t.replace(/^Date:\s*/i, "").trim();
  });

  const idSet = new Set();
  $('a[href*="/fight-details/"]').each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    const m = href.match(/fight-details\/([a-z0-9]+)/i);
    if (m) idSet.add(m[1]);
  });
  const fightIds = Array.from(idSet);

  // limit concurrency to 5
  async function mapLimit(items, limit, fn) {
    let i = 0;
    const out = new Array(items.length);
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        out[idx] = await fn(items[idx], idx);
      }
    });
    await Promise.all(workers);
    return out;
  }

  const fights = await mapLimit(fightIds, 5, (id) => scrapeFightDetails(id));
  const cleaned = fights.filter((f) => f && f.fighter1 && f.fighter2);
  const eventId = (eventUrl.match(/event-details\/([a-z0-9]+)/i) || [])[1] || "";
  return { provider: "ufcstats", eventId, eventName, eventDate, fights: cleaned };
}

// ======== SCRAPER ROUTES (for debugging / GAS) ========
app.get("/api/scrape/ufcstats/event/:id", async (req, res) => {
  try {
    res.json(await scrapeEvent(req.params.id));
  } catch (e) {
    console.error("scrape by id:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/scrape/ufcstats/event", async (req, res) => {
  try {
    const url = String(req.query.url || "").trim();
    if (!url) return res.status(400).json({ error: "Missing ?url" });
    res.json(await scrapeEvent(url));
  } catch (e) {
    console.error("scrape by url:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/scrape/ufcstats/latest-upcoming", async (_req, res) => {
  try {
    res.json(await scrapeEvent(await firstEventUrl("upcoming")));
  } catch (e) {
    console.error("latest-upcoming:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/scrape/ufcstats/latest-completed", async (_req, res) => {
  try {
    res.json(await scrapeEvent(await firstEventUrl("completed")));
  } catch (e) {
    console.error("latest-completed:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ======== ADMIN: SYNC RESULTS INTO SHEETS (calls your GAS) ========
function publicBase(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * GAS handler: action=syncFromScraper&ref=...&base=...&mode=resultsOnly
 * ref can be event ID or full UFCStats event URL
 */
app.get("/api/admin/syncFromUFCStats", async (req, res) => {
  try {
    const refRaw = (req.query.ref || "").toString().trim();
    if (!refRaw) return res.status(400).json({ error: "Missing ?ref=<eventId|url|upcoming|completed>" });

    const base = publicBase(req);
    const gasUrl = `${GOOGLE_SCRIPT_URL}?action=syncFromScraper&ref=${encodeURIComponent(refRaw)}&base=${encodeURIComponent(base)}&mode=resultsOnly`;

    const r = await fetch(gasUrl, { headers: { "cache-control": "no-cache" } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).type("text/plain").send(text);
    res.set("Cache-Control", "no-store").type("application/json").send(text);
  } catch (e) {
    console.error("syncFromUFCStats:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ======== START ========
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
