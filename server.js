// server.js
// Express server + UFCStats scraper + GAS bridge (Render-ready, Node 16–20 safe)

const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

// ---- fetch fallback for Node <18 ----
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // cross-fetch works with CommonJS require
    fetchFn = require("cross-fetch");
  } catch {
    // dynamic import fallback to node-fetch (ESM)
    fetchFn = (...args) =>
      import("node-fetch").then(({ default: f }) => f(...args));
  }
}
const fetch = fetchFn;

// AbortController fallback (Node 16)
const AC = global.AbortController || require("abort-controller");
const app = express();
const PORT = process.env.PORT || 3000;

// ======== CONFIG ========
const GOOGLE_SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

const UFC_BASE = "http://www.ufcstats.com"; // UFCStats is http

// ======== MIDDLEWARE ========
app.use(express.json());

// Serve static from /public; disable caching for HTML
app.use(
  express.static("public", {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");
        res.set("Surrogate-Control", "no-store");
      }
    },
  })
);

// Explicit root -> public/index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// tiny logger
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Kill caching on API
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});

// ======== HEALTH ========
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ======== GAS PROXY (frontend) ========
app.get("/api/fights", async (_req, res, next) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFightList`, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) throw new Error(`GAS ${r.status}`);
    return res.json(await r.json());
  } catch (e1) {
    try {
      const r2 = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!r2.ok) throw new Error(`GAS ${r2.status}`);
      return res.json(await r2.json());
    } catch (e2) {
      console.error("getFights error:", e1, e2);
      return next(e2);
    }
  }
});

app.post("/api/leaderboard", async (_req, res, next) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getLeaderboard" }),
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getLeaderboard (POST):", e);
    next(e);
  }
});

app.get("/api/leaderboard", async (_req, res, next) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLeaderboard`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getLeaderboard (GET):", e);
    next(e);
  }
});

app.get("/api/hall", async (_req, res, next) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.set("Cache-Control", "no-store");
    res.json(await r.json());
  } catch (e) {
    console.error("getHall:", e);
    next(e);
  }
});

app.get("/api/champion", async (_req, res, next) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getChampionBanner:", e);
    next(e);
  }
});

app.get("/api/champion-banner", async (_req, res, next) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getChampionBanner`, {
      headers: { "Cache-Control": "no-cache" },
    });
    res.json(await r.json());
  } catch (e) {
    console.error("getChampionBanner alias:", e);
    next(e);
  }
});

app.post("/api/submit", async (req, res, next) => {
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
    next(e);
  }
});

app.post("/api/picks", async (req, res, next) => {
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
    next(e);
  }
});

// ======== SCRAPER CORE (Cheerio) ========
async function fetchHTML(url, ms = 15000) {
  const controller = new AC();
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

function readMetaBlock($) {
  return $(".b-fight-details__content .b-fight-details__text")
    .text()
    .replace(/\s+/g, " ")
    .trim();
}
function parseMethodAndRound(metaText) {
  const m = metaText.match(/Method:\s*([A-Za-z/ \-]+?)(?=\s{2,}|Round:|Time:|Referee:|$)/i);
  const methodRaw = (m && m[1] ? m[1].trim() : "");
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

  const metaText = readMetaBlock($);
  const { methodRaw, roundRaw } = parseMethodAndRound(metaText);

  const method = normalizeMethod(methodRaw);
  const round = method === "Decision" ? "N/A" : roundRaw || "";
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

// ======== SCRAPER ROUTES ========
app.get("/api/scrape/ufcstats/event/:id", async (req, res, next) => {
  try {
    res.json(await scrapeEvent(req.params.id));
  } catch (e) {
    console.error("scrape by id:", e);
    next(e);
  }
});

app.get("/api/scrape/ufcstats/event", async (req, res, next) => {
  try {
    const url = String(req.query.url || "").trim();
    if (!url) return res.status(400).json({ error: "Missing ?url" });
    res.json(await scrapeEvent(url));
  } catch (e) {
    console.error("scrape by url:", e);
    next(e);
  }
});

app.get("/api/scrape/ufcstats/latest-upcoming", async (_req, res, next) => {
  try {
    res.json(await scrapeEvent(await firstEventUrl("upcoming")));
  } catch (e) {
    console.error("latest-upcoming:", e);
    next(e);
  }
});

app.get("/api/scrape/ufcstats/latest-completed", async (_req, res, next) => {
  try {
    res.json(await scrapeEvent(await firstEventUrl("completed")));
  } catch (e) {
    console.error("latest-completed:", e);
    next(e);
  }
});

// ======== ADMIN: SYNC RESULTS INTO SHEETS ========
function publicBase(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

app.get("/api/admin/syncFromUFCStats", async (req, res, next) => {
  try {
    const refRaw = (req.query.ref || "").toString().trim();
    if (!refRaw) return res.status(400).json({ error: "Missing ?ref=<eventId|url|upcoming|completed>" });

    const base = publicBase(req);
    const gasUrl = `${GOOGLE_SCRIPT_URL}?action=syncFromScraper&ref=${encodeURIComponent(
      refRaw
    )}&base=${encodeURIComponent(base)}&mode=resultsOnly`;

    const r = await fetch(gasUrl, { headers: { "cache-control": "no-cache" } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).type("text/plain").send(text);
    res.set("Cache-Control", "no-store").type("application/json").send(text);
  } catch (e) {
    console.error("syncFromUFCStats:", e);
    next(e);
  }
});

// ======== ERROR HANDLER ========
app.use((err, _req, res, _next) => {
  const msg = (err && (err.message || err.toString())) || "Internal Server Error";
  console.error("ERROR:", msg);
  if (process.env.NODE_ENV !== "production") {
    res.status(500).json({ error: msg, stack: err?.stack });
  } else {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ======== START ========
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
