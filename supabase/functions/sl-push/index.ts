// Squadlist notifications (Supabase Edge Function).
//
// Called by the app right after something happens:
//   { type: "nudge" | "task" | "comment", room, id }
// It looks the thing up itself (so the app can't send made-up messages), only
// for things from the last 2 minutes, and sends each one once.
//
// Called every hour by pg_cron (see supabase/push.sql) with the CRON_SECRET:
//   { type: "remind" }
// Sends "N tasks left today" to phones whose chosen hour it is now, in their
// own time zone, if they have tasks left.
//
// Secrets (supabase secrets set ...): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:you@example.com), CRON_SECRET, APP_URL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const RECENT_MS = 2 * 60 * 1000;
const recent = (iso: string) => Date.now() - new Date(iso).getTime() < RECENT_MS;

type Push = { title: string; body: string; room: string; tag?: string };

async function once(key: string) {
  const { error } = await db.from("sl_push_log").insert({ key });
  return !error; // duplicate key = already sent
}

async function sendTo(members: string[], msg: Push) {
  if (!members.length) return 0;
  const { data: subs } = await db.from("sl_push").select("endpoint, sub").in("member", members);
  const url = `${env("APP_URL") || "/"}?room=${msg.room}`;
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, url }), { TTL: 60 * 60 * 6 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("sl_push").delete().eq("endpoint", s.endpoint); // phone unsubscribed
    }
  }));
  return sent;
}

const nameOf = async (id: string) =>
  (await db.from("sl_members").select("name, emoji").eq("id", id).single()).data ?? { name: "A friend", emoji: "" };

async function onNudge(room: string, id: string) {
  const { data: e } = await db.from("sl_events").select("*").eq("id", id).eq("room", room).eq("kind", "nudge").single();
  if (!e || !recent(e.created_at) || !e.to_member || !(await once("nudge:" + id))) return 0;
  const [from, task] = await Promise.all([nameOf(e.from_member), db.from("sl_tasks").select("title").eq("id", e.task_id).single()]);
  return sendTo([e.to_member], { title: `👉 ${from.name} nudged you`, body: task.data?.title ?? "", room, tag: "nudge-" + e.task_id });
}

async function onTask(room: string, id: string) {
  const { data: t } = await db.from("sl_tasks").select("*").eq("id", id).eq("room", room).single();
  if (!t || !recent(t.created_at) || t.created_by === t.assigned_to || !(await once("task:" + id))) return 0;
  const from = await nameOf(t.created_by);
  return sendTo([t.assigned_to], { title: `🎁 ${from.name} gave you a task`, body: t.title, room });
}

async function onComment(room: string, id: string) {
  const { data: c } = await db.from("sl_comments").select("*").eq("id", id).eq("room", room).single();
  if (!c || !recent(c.created_at) || !(await once("comment:" + id))) return 0;
  const { data: t } = await db.from("sl_tasks").select("title, created_by, assigned_to").eq("id", c.task_id).single();
  if (!t) return 0;
  const to = [...new Set([t.assigned_to, t.created_by])].filter((m) => m !== c.member);
  const from = await nameOf(c.member);
  return sendTo(to, { title: `💬 ${from.name} on “${t.title}”`, body: c.body, room, tag: "comment-" + c.task_id });
}

// local date and hour in a time zone
function localNow(tz: string) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: wd };
  } catch {
    return null;
  }
}

async function tasksLeft(member: string, day: string, weekday: number) {
  const { data: tasks } = await db.from("sl_tasks").select("id, repeat, due, created_day, deleted_day").eq("assigned_to", member);
  const live = (tasks ?? []).filter((t) => t.created_day <= day && !(t.deleted_day && t.deleted_day <= day));
  const ids = live.map((t) => t.id);
  if (!ids.length) return 0;
  const { data: done } = await db.from("sl_done").select("task_id, day").in("task_id", ids);
  const doneToday = new Set((done ?? []).filter((d) => d.day === day).map((d) => d.task_id));
  const doneEver = new Set((done ?? []).map((d) => d.task_id));
  return live.filter((t) => t.repeat?.length
    ? t.repeat.includes(weekday) && !doneToday.has(t.id)
    : !doneEver.has(t.id) && (!t.due || t.due <= day)).length;
}

async function remind() {
  const { data: subs } = await db.from("sl_push").select("*").not("remind_hour", "is", null);
  let sent = 0;
  for (const s of subs ?? []) {
    const now = localNow(s.tz);
    if (!now || now.hour !== s.remind_hour || s.last_reminded === now.day) continue;
    await db.from("sl_push").update({ last_reminded: now.day }).eq("endpoint", s.endpoint);
    const left = await tasksLeft(s.member, now.day, now.weekday);
    if (!left) continue;
    try {
      await webpush.sendNotification(s.sub, JSON.stringify({
        title: `🔥 ${left} ${left === 1 ? "task" : "tasks"} left today`,
        body: "Finish at least half to keep your streak (and the squad's) alive.",
        room: s.room, tag: "remind", url: `${env("APP_URL") || "/"}?room=${s.room}`,
      }), { TTL: 60 * 60 * 2 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("sl_push").delete().eq("endpoint", s.endpoint);
    }
  }
  // keep the "sent once" log small
  await db.from("sl_push_log").delete().lt("at", new Date(Date.now() - 864e5).toISOString());
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  let body: { type?: string; room?: string; id?: string };
  try { body = await req.json(); } catch { return reply({ error: "bad json" }, 400); }

  if (body.type === "remind") {
    if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return reply({ error: "no" }, 401);
    return reply({ sent: await remind() });
  }
  const { type, room, id } = body;
  if (!room || !/^[a-z0-9]{6,40}$/.test(room) || !id || !/^[0-9a-f-]{36}$/.test(id)) return reply({ error: "bad request" }, 400);
  const handler = { nudge: onNudge, task: onTask, comment: onComment }[type ?? ""];
  if (!handler) return reply({ error: "unknown type" }, 400);
  return reply({ sent: await handler(room, id) });
});
