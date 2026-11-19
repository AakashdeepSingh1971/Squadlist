// Notifications: nudges and new tasks reach your phone, plus an optional
// daily reminder when your tasks aren't done. Needs the sl-push Edge Function
// (supabase/functions/sl-push) and a VAPID key (see README).
// On iPhone this only works once the app is added to the home screen (iOS 16.4+).
import { supabase, rpc, pushConfigured, VAPID_PUBLIC_KEY } from "./supabase.js";
import { addUsage } from "./usage.js";
import { store } from "./identity.js";

export const pushSupported = () =>
  pushConfigured && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const isIOSBrowser = () =>
  /iPhone|iPad/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches;

const keyBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushPrefs = (room) => store.get("sl.push:" + room) || { on: false, hour: 21 };

/** turn notifications on (asks permission) and save which room/person this phone is */
export async function enablePush(room, member, hour) {
  if (!pushSupported()) throw new Error("This browser can't do notifications");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const { error } = await rpc("sl_save_push", {
    p_room: room, p_member: member, p_sub: sub.toJSON(),
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", p_hour: hour,
  });
  if (error) throw new Error(error.message);
  store.set("sl.push:" + room, { on: true, hour });
}

export async function disablePush(room) {
  store.set("sl.push:" + room, { ...pushPrefs(room), on: false });
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await rpc("sl_delete_push", { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}

/** ask the server to notify a friend about something that just happened (best effort) */
export function notify(body) {
  if (!pushConfigured) return;
  addUsage("pushes", 1);
  supabase.functions.invoke("sl-push", { body }).catch(() => {});
}
