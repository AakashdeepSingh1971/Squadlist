// Counts how much data this phone uses, for the admin page (/admin).
// Only sizes and counts, never what anyone writes.
//   sync  - live updates over realtime (estimate: message size + overhead)
//   api   - loading and saving through the database functions (estimate)
//   photo - photo proofs uploaded and viewed
//   app   - downloading the app itself (only real downloads, not the cache)
// Saved once a minute, and when the page is hidden or closed.
import { supabase, SUPABASE_URL, SUPABASE_KEY } from "./supabase.js";
import { store } from "./identity.js";
import { dayKey } from "./days.js";

const zero = () => ({ sync: 0, api: 0, photo: 0, app: 0, msgs: 0, calls: 0, pushes: 0 });
let pending = zero();
let ctx = { name: "", room: "" };
let started = false;

export function getClientId() {
  let id = store.get("sl.cid");
  if (!id) { id = crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36); store.set("sl.cid", id); }
  return id;
}

export const setUsageContext = (next) => { ctx = { ...ctx, ...next }; };

export function addUsage(kind, n = 1) {
  if (!(kind in pending) || !Number.isFinite(n) || n <= 0) return;
  pending[kind] += n;
}

// rough size of a message or request on the wire (JSON + headers/framing)
export const wireBytes = (payload, overhead = 120) => {
  try { return (JSON.stringify(payload ?? null)?.length || 0) + overhead; } catch { return overhead; }
};

function device() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const app = matchMedia?.("(display-mode: standalone)").matches ? " (app)" : "";
  return `${br} on ${os}${app}`;
}

export function flushUsage() {
  const p = pending;
  if (!supabase || !Object.values(p).some((v) => v > 0)) return;
  pending = zero();
  const body = {
    p_cid: getClientId(), p_day: dayKey(), p_name: ctx.name || "", p_device: device(), p_room: ctx.room || "",
    p_sync: Math.round(p.sync), p_api: Math.round(p.api), p_photo: Math.round(p.photo), p_app: Math.round(p.app),
    p_msgs: p.msgs, p_calls: p.calls, p_pushes: p.pushes,
  };
  // keepalive lets this finish while the page is closing
  fetch(`${SUPABASE_URL}/rest/v1/rpc/sl_log_usage`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json",
      ...(SUPABASE_KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + SUPABASE_KEY }) },
    body: JSON.stringify(body),
  }).catch(() => {});
}

// the app's own files (code, styles, fonts, icons). transferSize is 0 when it
// came from the cache, so only real downloads count.
function watchAppDownloads() {
  const ours = (url) => url.startsWith(location.origin) || /fonts\.(googleapis|gstatic)\.com/.test(url);
  const count = (list) => list.forEach((e) => { if (ours(e.name)) addUsage("app", e.transferSize || 0); });
  try {
    new PerformanceObserver((l) => count(l.getEntries())).observe({ type: "resource", buffered: true });
    count(performance.getEntriesByType("navigation"));
  } catch { /* old browser: skip */ }
}

export function startUsage() {
  if (started || !supabase) return;
  started = true;
  watchAppDownloads();
  setInterval(flushUsage, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushUsage(); });
  window.addEventListener("pagehide", flushUsage);
}

// a photo counts once per page load (after that the browser has it cached)
const seenPhotos = new Set();
export function countPhotoView(url, bytes) {
  if (!url || seenPhotos.has(url) || url.startsWith("data:")) return;
  seenPhotos.add(url);
  addUsage("photo", bytes || 150000);
}
