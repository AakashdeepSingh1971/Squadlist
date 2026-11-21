// What the notify server does, without the web parts, so it's easy to test.
// api/notify.js wires it to Supabase and to the push services.

export const TYPES = ["nudge", "task", "comment"];

/** check what the app sent: { type, room, id } */
export function readRequest(body) {
  const b = typeof body === "string" ? safeJson(body) : body || {};
  const type = String(b.type || "");
  const room = String(b.room || "");
  const id = String(b.id || "");
  if (type === "remind") return { type };
  if (!TYPES.includes(type)) throw new Error("bad type");
  if (!/^[a-z0-9]{6,40}$/.test(room)) throw new Error("bad room");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("bad id");
  return { type, room, id };
}

// one push to many phones; forget phones that uninstalled (404 / 410)
async function fanOut(subs, payload, opts, { send, drop }) {
  let sent = 0, dropped = 0;
  await Promise.all(subs.map(async (s) => {
    try { await send(s.sub, payload, opts); sent++; }
    catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) { dropped++; await drop(s.endpoint).catch(() => {}); }
    }
  }));
  return { sent, dropped };
}

const topic = (tag) => String(tag || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined;

/**
 * Something just happened in a room.
 *   job(type, room, id) -> { title, body, tag, room, subs: [{ endpoint, sub }] } or null
 *   send(sub, payloadJson, { TTL, urgency, topic }), drop(endpoint)
 */
export async function notifyEvent(input, { job, send, drop }) {
  const j = await job(input.type, input.room, input.id);
  if (!j || !j.subs?.length) return { sent: 0, dropped: 0, total: 0 };
  const payload = JSON.stringify({ title: j.title, body: j.body, tag: j.tag, url: `/?room=${j.room}` });
  const out = await fanOut(j.subs, payload, { TTL: 6 * 3600, urgency: "high", topic: topic(j.tag) }, { send, drop });
  return { ...out, total: j.subs.length };
}

/**
 * The hourly reminder.
 *   reminders() -> [{ endpoint, sub, room, left }]
 */
export async function notifyReminders({ reminders, send, drop }) {
  const list = (await reminders()) || [];
  let sent = 0, dropped = 0;
  for (const r of list) {
    const payload = JSON.stringify({
      title: `🔥 ${r.left} ${r.left === 1 ? "task" : "tasks"} left today`,
      body: "Finish at least half to keep your streak (and the squad's) alive.",
      tag: "remind", url: `/?room=${r.room}`,
    });
    const o = await fanOut([r], payload, { TTL: 2 * 3600, urgency: "normal", topic: "remind" }, { send, drop });
    sent += o.sent; dropped += o.dropped;
  }
  return { sent, dropped, total: list.length };
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
