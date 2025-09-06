// CLIENT-SIDE ONLY — paste as the first lines of public/script.js
(function () {
  const qp = new URLSearchParams(location.search);
  const override = qp.get("api");
  const DEFAULT_BASE = "/api"; // if your front-end is served by the same server
  window.API_BASE = override || window.API_BASE || DEFAULT_BASE;

  window.fetchJSON = async function fetchJSON(url, opts = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeout || 12000);
    try {
      const r = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      console.error("fetchJSON error:", e);
      const statusEl = document.getElementById("status") || document.getElementById("appStatus");
      if (statusEl) statusEl.textContent = "Network error loading data. Pull-to-refresh or try again.";
      throw e;
    }
  };

  window.loadFightList = async () => {
    const base = window.API_BASE;
    try { return await fetchJSON(`${base}/fights`); }
    catch { return await fetchJSON(`${base}/gas?action=getFightList`); }
  };

  window.loadLeaderboard = async () => {
    const base = window.API_BASE;
    try { return await fetchJSON(`${base}/leaderboard`); }
    catch { return await fetchJSON(`${base}/gas?action=getLeaderboard`); }
  };

  window.loadChampionBanner = async () => {
    const base = window.API_BASE;
    try { return await fetchJSON(`${base}/champion-banner`); }
    catch { return await fetchJSON(`${base}/gas?action=getChampionBanner`); }
  };

  console.log("[FPP] API_BASE =", window.API_BASE);
})();
