const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Config ----------
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

const UFCSTATS_BASE = "http://ufcstats.com"; // site uses http
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache"
};

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static("public"));

// ---------- Health ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- Lockout ----------
const lockoutTime = new Date("2025-08-16T18:00:00-04:00"); // ET in Aug = UTC-04
app.get("/api/lockout", (req, res) => {
  const locked = new Date() >= lockoutTime;
  res.json({ locked });
});

// ---------- GAS Proxy Endpoints (unchanged) ----------
app.get("/api/fights", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getFights`, { headers: DEFAULT_HEADERS });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getFights error:", err);
    res.status(500).json({ error: "Failed to fetch fights" });
  }
});

app.post("/api/submit", async (req, res) => {
  const now = new Date();
  if (now >= lockoutTime) {
    return res.json({ success: false, error: "⛔ Picks are locked. The event has started." });
  }
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...DEFAULT_HEADERS },
      body: JSON.stringify({ action: "submitPicks", ...req.body })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("submitPicks error:", err);
    res.status(500).json({ error: "Failed to submit picks" });
  }
});

app.post("/api/picks", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...DEFAULT_HEADERS },
      body: JSON.stringify({ action: "getUserPicks", ...req.body })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getUserPicks error:", err);
    res.status(500).json({ error: "Failed to fetch picks" });
  }
});

app.post("/api/leaderboard", async (req, res) => {
  try {
    const r = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...DEFAULT_HEADERS },
      body: JSON.stringify({ action: "getLeaderboard" })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("getLeaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.get("/api/hall", async (req, res) => {
  try {
    const r = await fetch(`${GOOGLE_SCRIPT_URL}?action=getHall`, {
      headers: { ...DEFAULT_HEADERS, "Cache-Control": "no-cache" }
    });
    res.set("Cache-Control", "no-store");
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error("getHall error:", e);
    res.status(500).json([]);
  }
});

// ---------- Scraper Utilities ----------
async function fetchHtml(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.text();
  } finally {
    clearTimeout(id);
  }
}

function clean(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

// Parse Event page: get event meta + fight-details links
function parseEventPage(html) {
  const $ = cheerio.load(html);
  const title = clean($("h2.b-content__title").text());
  const meta = {};
  $("ul.b-list__box-list > li").each((_, li) => {
    const text = clean($(li).text());
    if (/Date:/i.test(text)) meta.date = clean(text.replace(/Date:\s*/i, ""));
    if (/Location:/i.test(text)) meta.location = clean(text.replace(/Location:\s*/i, ""));
    if (/Venue:/i.test(text)) meta.venue = clean(text.replace(/Venue:\s*/i, ""));
  });

  // Collect unique fight details links
  const links = new Set();
  $('a[href*="/fight-details/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (href && href.includes("/fight-details/")) links.add(href.split("?")[0]);
  });

  return {
    eventName: title || undefined,
    ...meta,
    fights: Array.from(links)
  };
}

// Parse Fight page: get red/blue fighters, winner, method, round, time, weight class
function parseFightPage(html) {
  const $ = cheerio.load(html);

  const weightClass = clean($('i.b-fight-details__fight-title').parent().text())
    .replace(/\s*Fight\s*Details\s*$/i, "") || clean($("h2.b-content__title").text());

  const persons = $("div.b-fight-details__persons div.b-fight-details__person");
  const getPerson = (el) => {
    const name = clean($(el).find("h3.b-fight-details__person-name a").text()) ||
                 clean($(el).find("h3.b-fight-details__person-name").text());
    const status = clean($(el).find(".b-fight-details__person-status").text()); // "W" or "L"
    return { name, status };
  };

  const red = getPerson(persons.eq(0));
  const blue = getPerson(persons.eq(1));

  let winner = null;
  if (/^W$/i.test(red.status)) winner = red.name || "Red";
  if (/^W$/i.test(blue.status)) winner = blue.name || "Blue";

  // Method / Round / Time block
  let method = undefined, round = undefined, time = undefined;
  $("p.b-fight-details__text").each((_, p) => {
    const txt = clean($(p).text());
    if (/Method:/i.test(txt)) method = clean(txt.replace(/Method:\s*/i, ""));
    if (/Round:/i.test(txt)) round = clean(txt.replace(/Round:\s*/i, ""));
    if (/Time:/i.test(txt)) time = clean(txt.replace(/Time:\s*/i, ""));
  });

  return {
    weightClass: weightClass || undefined,
    red: red.name || undefined,
    blue: blue.name || undefined,
    winner: winner || undefined,
    method,
    round,
    time
  };
}

// ---------- Scraper Routes ----------
app.get("/api/scrape/ufcstats/event/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const eventUrl = `${UFCSTATS_BASE}/event-details/${eventId}`;
  try {
    // 1) Event page
    const eventHtml = await fetchHtml(eventUrl);
    const eventData = parseEventPage(eventHtml);

    // 2) Fetch each fight details (limit to reasonable concurrency)
    const fights = eventData.fights.slice(0, 50); // safety cap
    const results = [];
    for (const href of fights) {
      try {
        const fightHtml = await fetchHtml(href);
        const parsed = parseFightPage(fightHtml);
        results.push({ fightUrl: href, ...parsed });
      } catch (e) {
        console.warn("fight scrape failed:", href, e.message);
        results.push({ fightUrl: href, error: e.message });
      }
      // tiny delay to be polite
      await new Promise((r) => setTimeout(r, 150));
    }

    res.json({
      source: "ufcstats.com",
      eventId,
      eventUrl,
      eventName: eventData.eventName,
      date: eventData.date,
      venue: eventData.venue,
      location: eventData.location,
      fights: results
    });
  } catch (e) {
    console.error("event scrape failed:", eventUrl, e);
    res.status(502).json({ error: "Failed to scrape event", details: e.message, eventUrl });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
