// Place near the top of script.js
(function () {
  // Allow override via query param for quick testing on phone:
  // e.g. https://yourapp/?api=https://your-render-service.onrender.com/api
  const qp = new URLSearchParams(location.search);
  const override = qp.get("api");

  // If your front-end is served by the same Express app, /api works.
  // If you host the front-end elsewhere (GoDaddy/GitHub Pages), set window.API_BASE globally or use ?api=
  const DEFAULT_BASE = "/api";
  window.API_BASE = override || window.API_BASE || DEFAULT_BASE;

  // Basic fetch with timeout + hard errors surfaced to console/UI
  window.fetchJSON = async function fetchJSON(url, opts = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeout || 12000);

    try {
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!r.ok) {
        const raw = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} on ${url} :: ${raw.slice(0, 200)}`);
      }
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      console.error("fetchJSON error:", e.message || e);
      const statusEl = document.getElementById("status") || document.getElementById("appStatus");
      if (statusEl) {
        statusEl.textContent = "Network error loading data. Pull-to-refresh or try again.";
      }
      throw e;
    }
  };

  // Drop-in loaders that your existing code can call
  window.loadFightList = async function loadFightList() {
    const base = window.API_BASE;
    try {
      // Preferred alias
      return await fetchJSON(`${base}/fights`);
    } catch {
      // Fallback to generic GAS passthrough
      return await fetchJSON(`${base}/gas?action=getFightList`);
    }
  };

  window.loadLeaderboard = async function loadLeaderboard() {
    const base = window.API_BASE;
    try {
      return await fetchJSON(`${base}/leaderboard`);
    } catch {
      return await fetchJSON(`${base}/gas?action=getLeaderboard`);
    }
  };

  window.loadChampionBanner = async function loadChampionBanner() {
    const base = window.API_BASE;
    try {
      return await fetchJSON(`${base}/champion-banner`);
    } catch {
      return await fetchJSON(`${base}/gas?action=getChampionBanner`);
    }
  };

  console.log("[FPP] API_BASE =", window.API_BASE);
})();
