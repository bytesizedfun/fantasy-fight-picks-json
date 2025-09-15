# Fantasy Fight Picks — Simple, Fast, Secure (PWA)

## What’s inside
- **Frontend**: `index.html`, `style.css`, `script.js`, `manifest.json`, `sw.js`
- **Server** (Render): `server.js` (thin proxy + UFCStats scraper with polling)
- **Google Apps Script**: `code.gs` (Sheets source of truth)

## Google Sheets (tabs)

Create tabs with these headers:

### `meta`
`event_id | event_name | lock_at | event_url | status`
- `lock_at` ISO, e.g. `2025-09-13T17:59:59-04:00`
- `event_url` = UFCStats event page URL
- `status` = `scheduled | live | final`

### `fight_list`
`fight | fighter_1 | fighter_2 | underdog | is_main_event`
- `underdog` = `Fighter 1` or `Fighter 2`
- `is_main_event` = `TRUE/FALSE`

### `users`
`username | pin_salt | pin_hash | created_at | is_active`

### `sessions`
`username | token | expires_at`

### `picks`
`timestamp | username | fight | winner | method | round`

### `results`
`fight | winner | method | round | source | updated_at`

### `all_time`
`username | points` (manual, read-only)

### `champions`
`week_id | username(s) | points | date | note` (collected only for now)

---

## Deploy Google Apps Script

1. Create a new Apps Script project (bound to the Sheet or standalone).
2. Paste **all** of `code.gs`.
3. Deploy → **New deployment** → Web app
   - Execute as **Me**
   - Who has access: **Anyone**
4. Copy the web app URL → set as `GAS_URL` in Render.

---

## Deploy Server (Render)

1. Create a Render **Web Service** from your repo.
2. Set **Start Command**: `node server.js`
3. Environment Variables:
   - `GAS_URL`: (your GAS web app URL ending in `/exec`)
   - `FRONTEND_ORIGIN`: e.g. `https://fantasy-fight-picks-json.onrender.com`
   - `ADMIN_API_KEY`: a random string (keep secret)
   - `SCRAPE_LOOP`: `1` (to enable continuous 30s polling) or unset to disable
4. (Optional) Serve the frontend from the same service by placing the web files in `/public`.

---

## Local Dev

```bash
npm i express node-fetch cheerio express-rate-limit
# start
node server.js
# open http://localhost:3000
