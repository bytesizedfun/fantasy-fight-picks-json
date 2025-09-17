// ====== CONFIG ======
const GAS_URL = "https://script.google.com/macros/s/AKfycbyQOfLKyM3aHW1xAZ7TCeankcgOSp6F2Ux1tEwBTp4A6A7tIULBoEyxDnC6dYsNq-RNGA/exec";

// ====== HELPERS ======
const el = id => document.getElementById(id);
const msg = el("msg");
const debug = el("debug");
const btn = el("loginBtn");

function setMsg(text, cls = "") {
  msg.className = `msg ${cls}`;
  msg.textContent = text || "";
}
function setDebug(text) { debug.textContent = text || ""; }

// Simple GET with query params to avoid CORS preflight
async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${GAS_URL}?${qs}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  return data;
}

async function checkMeta() {
  try {
    const data = await apiGet({ action: "getmeta" });
    if (data && data.ok) {
      setDebug(`Backend OK @ ${new Date().toLocaleTimeString()}`);
    } else {
      setDebug(`Backend responded but not OK: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    setDebug("Meta check failed. Likely wrong GAS URL or not deployed as Web App (Anyone).");
  }
}

async function login(username, pin) {
  const data = await apiGet({ action: "login", username, pin });
  return data;
}

// ====== UI ======
btn.addEventListener("click", async () => {
  const username = el("username").value.trim();
  const pin = el("pin").value.trim();
  setMsg("", "");
  if (!username || !pin) {
    setMsg("Enter username and PIN.", "err");
    return;
  }
  btn.disabled = true;
  setMsg("Signing in...", "");

  try {
    const res = await login(username, pin);
    if (res && res.user && res.user.username) {
      setMsg(`Welcome, ${res.user.username}!`, "ok");
      localStorage.setItem("ffp_user", res.user.username);
      // redirect when you build your main app:
      // location.href = "./app.html";
    } else if (res && res.error) {
      setMsg(res.error, "err");
    } else {
      setMsg("Unexpected response. Check GAS logs.", "err");
    }
  } catch (e) {
    setMsg("Network error hitting Apps Script. See debug.", "err");
    setDebug(String(e));
  } finally {
    btn.disabled = false;
  }
});

// Run a quick health check on load
checkMeta();
