// POST /api/notify   (Vercel serverless function)
//
// From the app, right after something happens:  { type: "nudge" | "task" | "comment" | "done" | "react" | "challenge" | "member", room, id }
//   The database checks it's real and recent, says who to tell, and makes sure
//   it's sent once (sl_push_job), so a page can't send made-up notifications.
// From pg_cron every hour (supabase/push.sql), header x-push-token: PUSH_TOKEN:  { type: "remind" }
//
// Environment variables on Vercel (see README → Notifications):
//   VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   the push key pair (npm run push:keys)
//   PUSH_TOKEN                                 long random text; also saved with sl_set_push_token()
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  already there for the app
//   VAPID_SUBJECT (optional)                   mailto:you@example.com
import webpush from "web-push";
import { notifyEvent, notifyReminders, readRequest } from "./_lib/notify-core.js";

const env = (k) => process.env[k] || "";

async function rpc(fn, args) {
  const key = env("VITE_SUPABASE_ANON_KEY");
  const r = await fetch(`${env("VITE_SUPABASE_URL")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", ...(key.startsWith("sb_") ? {} : { Authorization: "Bearer " + key }) },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
  if (req.method !== "POST") return send(405, { error: "POST only" });

  if (!env("VAPID_PRIVATE_KEY") || !env("VITE_VAPID_PUBLIC_KEY") || !env("PUSH_TOKEN") || !env("VITE_SUPABASE_URL")) {
    return send(503, { error: "not_configured", hint: "Set VAPID_PRIVATE_KEY and PUSH_TOKEN on Vercel, then redeploy" });
  }

  let input;
  try { input = readRequest(req.body); } catch (e) { return send(400, { error: e.message }); }

  const token = env("PUSH_TOKEN");
  if (input.type === "remind") {
    if (req.headers["x-push-token"] !== token) return send(401, { error: "no" });
  } else {
    // only from our own pages
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(403, { error: "origin" });
  }

  webpush.setVapidDetails(env("VAPID_SUBJECT") || `https://${req.headers.host}`, env("VITE_VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  const deps = {
    send: (sub, payload, opts) => webpush.sendNotification(sub, payload, opts),
    drop: (endpoint) => rpc("sl_push_drop", { p_token: token, p_endpoint: endpoint }),
    job: (type, room, id) => rpc("sl_push_job", { p_token: token, p_type: type, p_room: room, p_id: id }),
    reminders: () => rpc("sl_push_reminders", { p_token: token }),
  };
  try {
    return send(200, input.type === "remind" ? await notifyReminders(deps) : await notifyEvent(input, deps));
  } catch (e) {
    console.error("notify failed:", e.message);
    // the two set-up mistakes, said plainly
    if (/Could not find the function|: 404/.test(e.message)) return send(503, { error: "db_not_set_up", hint: "Run supabase/schema.sql again" });
    if (/not allowed/.test(e.message)) return send(503, { error: "token_mismatch", hint: "PUSH_TOKEN must match sl_set_push_token()" });
    return send(502, { error: "push_failed" });
  }
}
