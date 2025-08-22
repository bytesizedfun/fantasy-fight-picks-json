// server.js
// Express server + Cheerio scraper + GAS bridge (Render-ready)

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

async function fetchJSON(url, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
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

function pickValueAfterLabel($, label) {
  let val = "";
  $("i").each((_, el) => {
    const t = $(el).text().trim();
    if (t.toLowerCase().startsWith(label.toLowerCase())) {
      const next = $(el).next("i");
      if (next.length) val = next.text().trim();
    }
  });
  return val;
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

  const methodRaw = pickValueAfterLabel($, "Method:");
  const roundRaw = pickValueAfterLabel($, "Round:");
  const method = normalizeMethod(methodRaw);
  const round = method === "Decision" ? "N/A" : roundRaw.match(/\d+/)?.[0] || "";
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

// ======== ESPN SCRAPER (Card + Moneylines) ========

function toEspnIdAndUrl(refRaw) {
  const ref = String(refRaw || "").trim();
  if (!ref) throw new Error("Missing ESPN ref");
  if (/^\d+$/.test(ref)) {
    return {
      id: ref,
      url: `https://www.espn.com/mma/fightcenter/_/id/${ref}`,
    };
  }
  if (/^https?:\/\/.+espn\.com/i.test(ref)) {
    // Try to pull /id/<digits> from URL
    const m = ref.match(/\/id\/(\d+)/);
    const id = m ? m[1] : "";
    return { id, url: ref };
  }
  throw new Error("Provide an ESPN FightCenter URL or numeric event ID.");
}

function fmtMoneyline(n) {
  if (n == null || n === "" || isNaN(Number(n))) return "";
  const v = Number(n);
  return v > 0 ? `+${v}` : `${v}`;
}

async function scrapeEspnEvent(ref) {
  const { id, url } = toEspnIdAndUrl(ref);

  // Helper: limit concurrency
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

  // First, try ESPN Core API (most reliable)
  if (id) {
    try {
      const ev = await fetchJSON(
        `https://sports.core.api.espn.com/v2/sports/mma/ufc/events/${id}?lang=en&region=us`
      );

      const eventName =
        ev?.name || ev?.shortName || ev?.slug || `ESPN Event ${id}`;
      const eventDate = ev?.date || "";

      // competitions is an array of $ref URLs
      let compRefs = [];
      if (Array.isArray(ev?.competitions)) {
        compRefs = ev.competitions
          .map((c) => (typeof c === "string" ? c : c?.$ref || c?.href))
          .filter(Boolean);
      } else if (ev?.competitions?.$ref) {
        const list = await fetchJSON(ev.competitions.$ref);
        if (Array.isArray(list?.items)) {
          compRefs = list.items
            .map((x) => x?.$ref || x?.href)
            .filter(Boolean);
        }
      }

      const comps = await mapLimit(compRefs, 6, (href) => fetchJSON(href));

      const fights = [];
      await mapLimit(comps, 6, async (comp) => {
        try {
          let f1 = "";
          let f2 = "";

          // Prefer comp.name like "A vs B"
          const label = comp?.name || comp?.shortName || "";
          if (/\bvs\.?\b/i.test(label)) {
            const parts = label.split(/\s+vs\.?\s+/i);
            if (parts.length >= 2) {
              f1 = parts[0].trim();
              f2 = parts.slice(1).join(" vs ").trim();
            }
          }

          // If names not parsed, try loaded competitor list
          if ((!f1 || !f2) && comp?.competitors?.$ref) {
            const compList = await fetchJSON(comp.competitors.$ref);
            const items = Array.isArray(compList?.items)
              ? compList.items
              : [];
            const names = items
              .map((it) => it?.displayName || it?.name || "")
              .filter(Boolean);
            if (names.length >= 2) {
              f1 = names[0];
              f2 = names[1];
            }
          }

          // Odds: fetch odds collection if available
          let o1 = "";
          let o2 = "";
          let competitorSide = {}; // key: displayName -> 'home'/'away'
          try {
            if (comp?.competitors?.$ref) {
              const compList = await fetchJSON(comp.competitors.$ref);
              const items = Array.isArray(compList?.items)
                ? compList.items
                : [];
              items.forEach((it, idx) => {
                const name =
                  it?.displayName || it?.name || (idx === 0 ? f1 : f2);
                if (name) competitorSide[name] = it?.homeAway || "";
              });
            }

            if (comp?.odds?.$ref) {
              const oddsList = await fetchJSON(comp.odds.$ref);
              const first =
                (Array.isArray(oddsList?.items) && oddsList.items[0]) || null;

              const homeML =
                first?.homeTeamOdds?.moneyLine ??
                first?.home?.moneyLine ??
                first?.moneyLineHome ??
                null;
              const awayML =
                first?.awayTeamOdds?.moneyLine ??
                first?.away?.moneyLine ??
                first?.moneyLineAway ??
                null;

              if (homeML != null || awayML != null) {
                // If we know which fighter is home/away, map properly
                if (competitorSide[f1] && competitorSide[f2]) {
                  o1 =
                    competitorSide[f1] === "home"
                      ? fmtMoneyline(homeML)
                      : fmtMoneyline(awayML);
                  o2 =
                    competitorSide[f2] === "home"
                      ? fmtMoneyline(homeML)
                      : fmtMoneyline(awayML);
                } else {
                  // Fallback: assume listing order == away vs home (common in APIs)
                  o1 = fmtMoneyline(awayML);
                  o2 = fmtMoneyline(homeML);
                }
              }
            }
          } catch (_) {
            // ignore odds failures
          }

          if (f1 && f2) {
            fights.push({
              fighter1: f1,
              fighter2: f2,
              f1Odds: o1 || "",
              f2Odds: o2 || "",
            });
          }
        } catch (_) {}
      });

      if (fights.length) {
        return {
          provider: "espn",
          eventId: id,
          eventName,
          eventDate,
          fights,
        };
      }
      // Fall through to HTML scrape if API didn't yield fights
    } catch (e) {
      // API path failed, attempt HTML next
    }
  }

  // Fallback: HTML scrape ESPN FightCenter (best-effort)
  try {
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    // Try __NEXT_DATA__ first (Next.js data blob)
    let nextData = null;
    try {
      const txt = $('script#__NEXT_DATA__').first().text();
      if (txt) nextData = JSON.parse(txt);
    } catch (_) {}

    const fights = [];
    function maybePush(f1, f2, o1 = "", o2 = "") {
      const a = (f1 || "").trim();
      const b = (f2 || "").trim();
      if (!a || !b) return;
      fights.push({ fighter1: a, fighter2: b, f1Odds: o1 || "", f2Odds: o2 || "" });
    }

    // Walk the JSON looking for "vs" labels or competitors arrays
    function deepCollect(obj) {
      if (!obj) return;
      if (typeof obj === "string") {
        if (/\bvs\.?\b/i.test(obj)) {
          const parts = obj.split(/\s+vs\.?\s+/i);
          if (parts.length >= 2) {
            const f1 = parts[0].trim();
            const f2 = parts.slice(1).join(" vs ").trim();
            maybePush(f1, f2);
          }
        }
        return;
      }
      if (Array.isArray(obj)) {
        obj.forEach(deepCollect);
        return;
      }
      if (typeof obj === "object") {
        // ESPN nodes often have 'competitors' with displayName fields
        if (Array.isArray(obj.competitors)) {
          const names = obj.competitors
            .map((c) => c?.displayName || c?.name || c?.shortName || "")
            .filter(Boolean);
          if (names.length >= 2) maybePush(names[0], names[1]);
        }
        // Odds-style keys
        const mlHome =
          obj?.homeTeamOdds?.moneyLine ??
          obj?.home?.moneyLine ??
          obj?.moneyLineHome ??
          null;
        const mlAway =
          obj?.awayTeamOdds?.moneyLine ??
          obj?.away?.moneyLine ??
          obj?.moneyLineAway ??
          null;
        if (
          typeof obj.name === "string" &&
          /\bvs\.?\b/i.test(obj.name) &&
          (mlHome != null || mlAway != null)
        ) {
          const parts = obj.name.split(/\s+vs\.?\s+/i);
          if (parts.length >= 2) {
            const f1 = parts[0].trim();
            const f2 = parts.slice(1).join(" vs ").trim();
            // Assume listing order == away vs home if no explicit mapping
            maybePush(f1, f2, fmtMoneyline(mlAway), fmtMoneyline(mlHome));
          }
        }
        Object.values(obj).forEach(deepCollect);
      }
    }

    if (nextData) deepCollect(nextData);

    // As a last resort, parse visible "A vs B" headings
    if (fights.length === 0) {
      const text = $.root().text();
      const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const seen = new Set();
      lines.forEach((ln) => {
        if (/\bvs\.?\b/i.test(ln) && ln.length < 100) {
          const parts = ln.split(/\s+vs\.?\s+/i);
          if (parts.length >= 2) {
            const f1 = parts[0].trim();
            const f2 = parts.slice(1).join(" vs ").trim();
            const key = `${f1}__${f2}`;
            if (!seen.has(key)) {
              seen.add(key);
              fights.push({ fighter1: f1, fighter2: f2, f1Odds: "", f2Odds: "" });
            }
          }
        }
      });
    }

    return {
      provider: "espn",
      eventId: id || "",
      eventName: $("title").text().trim() || "ESPN Event",
      eventDate: "",
      fights,
    };
  } catch (e) {
    throw new Error(`Failed to scrape ESPN: ${e.message || e}`);
  }
}

// ======== SCRAPER ROUTES (for debugging, optional) ========
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

// ======== ESPN: SCRAPER ROUTES (card + odds) ========
app.get("/api/scrape/espn/event/:id", async (req, res) => {
  try {
    res.json(await scrapeEspnEvent(req.params.id));
  } catch (e) {
    console.error("espn scrape by id:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/scrape/espn/event", async (req, res) => {
  try {
    const url = String(req.query.url || "").trim();
    if (!url) return res.status(400).json({ error: "Missing ?url" });
    res.json(await scrapeEspnEvent(url));
  } catch (e) {
    console.error("espn scrape by url:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ======== ADMIN: SYNC INTO SHEETS (calls your GAS) ========
function publicBase(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

async function resolveRefToIdOrUrl(ref) {
  const r = (ref || "").toString().trim().toLowerCase();
  if (r === "upcoming") return await firstEventUrl("upcoming");
  if (r === "completed") return await firstEventUrl("completed");
  return ref; // id or full url
}

/**
 * Writes into Sheets via GAS:
 * - replaces "fight_list" with the event card
 * - upserts finished bouts into "fight_results"
 *
 * GAS handler: action=syncFromScraper&ref=...&base=...
 */
app.get("/api/admin/syncFromUFCStats", async (req, res) => {
  try {
    const refRaw = (req.query.ref || "").toString().trim();
    if (!refRaw) return res.status(400).json({ error: "Missing ?ref=<eventId|url|upcoming|completed>" });

    const resolved = await resolveRefToIdOrUrl(refRaw);
    const base = publicBase(req);
    const gasUrl = `${GOOGLE_SCRIPT_URL}?action=syncFromScraper&ref=${encodeURIComponent(resolved)}&base=${encodeURIComponent(base)}`;

    const r = await fetch(gasUrl, { headers: { "cache-control": "no-cache" } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).type("text/plain").send(text);
    res.set("Cache-Control", "no-store").type("application/json").send(text);
  } catch (e) {
    console.error("syncFromUFCStats:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ESPN: Convenience admin endpoint to push ESPN card+odds into Sheets
// GAS handler: action=syncFromESPN&ref=...&base=...
app.get("/api/admin/syncFromESPN", async (req, res) => {
  try {
    const refRaw = (req.query.ref || "").toString().trim();
    if (!refRaw) return res.status(400).json({ error: "Missing ?ref=<espnEventId|espnUrl>" });

    const base = publicBase(req);
    const gasUrl = `${GOOGLE_SCRIPT_URL}?action=syncFromESPN&ref=${encodeURIComponent(refRaw)}&base=${encodeURIComponent(base)}`;

    const r = await fetch(gasUrl, { headers: { "cache-control": "no-cache" } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).type("text/plain").send(text);
    res.set("Cache-Control", "no-store").type("application/json").send(text);
  } catch (e) {
    console.error("syncFromESPN:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ======== START ========
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
