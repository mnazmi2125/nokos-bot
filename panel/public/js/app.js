const API = "/api";
let token = null;

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API + path, { ...opts, headers, credentials: "include" });
  if (res.status === 401) { location.href = "/login.html"; return null; }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function me() {
  const d = await api("/me");
  if (!d || !d.user) { location.href = "/login.html"; return; }
  document.getElementById("userinfo").textContent = "Admin (" + d.user.username + ")";
}

async function logout() {
  await api("/logout", { method: "POST" });
  location.href = "/login.html";
}

function fmtDate(s) {
  if (!s) return "-";
  const d = new Date(s + (s.includes("T") ? "" : "Z"));
  return isNaN(d) ? s : d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
}

function statusBadge(s) {
  const map = { PENDING: "PENDING", ACTIVE: "ACTIVE", COMPLETED: "COMPLETED", CANCELED: "CANCELED", EXPIRED: "EXPIRED", FAILED: "FAILED", OTP_RECEIVED: "OTP_RECEIVED", PAID: "PAID", APPROVED: "APPROVED", REJECTED: "REJECTED" };
  return '<span class="badge ' + (s || "PENDING") + '">' + (map[s] || s) + "</span>";
}

function pageTitle(t) { document.getElementById("pagetitle").textContent = t; }

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnLogout").addEventListener("click", (e) => { e.preventDefault(); logout(); });
  me();
});
