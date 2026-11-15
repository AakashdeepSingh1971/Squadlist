// Rooms, and who you are in each one. Everything here stays on this phone.

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const read = (k) => safe(() => JSON.parse(localStorage.getItem(k)), null);
const write = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));
export const store = { get: read, set: write };

const ROOM_RE = /^[a-z0-9]{6,40}$/;
export const isRoomCode = (s) => typeof s === "string" && ROOM_RE.test(s);

export function makeRoomCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export const normalizeName = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

// Room name + passcode -> room code. The same pair gives the same room on any
// phone, and the code can't be worked back to the passcode (PBKDF2 makes each
// guess slow).
export async function roomFromSecret(name, passcode) {
  if (!globalThis.crypto?.subtle) throw new Error("insecure");
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode("squadlist:v1:" + normalizeName(name)), iterations: 200000 },
    base, 120
  );
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "", acc = 0, len = 0;
  for (const b of new Uint8Array(bits)) {
    acc = (acc << 8) | b; len += 8;
    while (len >= 5) { len -= 5; out += alphabet[(acc >> len) & 31]; }
  }
  return out; // 24 chars
}

export function getRoomFromUrl() {
  const r = new URLSearchParams(location.search).get("room");
  return isRoomCode(r) ? r : null;
}
export function setRoomInUrl(code) {
  const u = new URL(location.href);
  if (code) u.searchParams.set("room", code); else u.searchParams.delete("room");
  history.replaceState(null, "", u);
}
export const shareUrl = (code) => `${location.origin}${location.pathname}?room=${code}`;

// Rooms you've opened, newest first
const RECENT = "sl.rooms";
export const recentRooms = () => (read(RECENT) || []).sort((a, b) => b.at - a.at);
export function rememberRoom(code, patch = {}) {
  const all = read(RECENT) || [];
  const old = all.find((r) => r.code === code) || {};
  write(RECENT, [{ ...old, ...patch, code, at: Date.now() }, ...all.filter((r) => r.code !== code)].slice(0, 8));
}
export const forgetRoom = (code) => {
  write(RECENT, (read(RECENT) || []).filter((r) => r.code !== code));
  write("sl.me:" + code, null);
};

// Which member you are in a room. In demo mode it's per tab, so two tabs can
// play two friends.
const demo = !import.meta.env?.VITE_SUPABASE_URL || /your-project/.test(import.meta.env.VITE_SUPABASE_URL);
const tabStore = {
  get: (k) => safe(() => JSON.parse(sessionStorage.getItem(k)), null),
  set: (k, v) => safe(() => sessionStorage.setItem(k, JSON.stringify(v))),
};
const meStore = demo ? tabStore : store;
export const myMemberId = (code) => meStore.get("sl.me:" + code);
export const setMyMemberId = (code, id) => meStore.set("sl.me:" + code, id);

// Light / dark / follow the phone
export const getTheme = () => read("sl.theme") || "system";
export function applyTheme(theme = getTheme()) {
  write("sl.theme", theme);
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141210" : "#fbf7f1");
}
