import test from "node:test";
import assert from "node:assert/strict";
import { readRequest, notifyEvent, notifyReminders } from "../../api/_lib/notify-core.js";

const id = "123e4567-e89b-12d3-a456-426614174000";

test("readRequest accepts app events and the reminder, refuses junk", () => {
  assert.deepEqual(readRequest({ type: "nudge", room: "abcdef12", id }), { type: "nudge", room: "abcdef12", id });
  assert.deepEqual(readRequest('{"type":"remind"}'), { type: "remind" });
  assert.throws(() => readRequest({ type: "spam", room: "abcdef12", id }), /bad type/);
  assert.throws(() => readRequest({ type: "task", room: "AB", id }), /bad room/);
  assert.throws(() => readRequest({ type: "task", room: "abcdef12", id: "x" }), /bad id/);
});

test("notifyEvent sends to every phone the database names and drops dead ones", async () => {
  const sent = [], dropped = [];
  const out = await notifyEvent({ type: "nudge", room: "abcdef12", id }, {
    job: async () => ({ title: "👉 Ann nudged you", body: "Read", tag: "nudge-1", room: "abcdef12",
      subs: [{ endpoint: "e1", sub: { endpoint: "e1" } }, { endpoint: "e2", sub: { endpoint: "e2" } }] }),
    send: async (sub, payload) => { if (sub.endpoint === "e2") throw Object.assign(new Error("gone"), { statusCode: 410 }); sent.push(JSON.parse(payload)); },
    drop: async (e) => dropped.push(e),
  });
  assert.deepEqual(out, { sent: 1, dropped: 1, total: 2 });
  assert.equal(sent[0].title, "👉 Ann nudged you");
  assert.equal(sent[0].url, "/?room=abcdef12");
  assert.deepEqual(dropped, ["e2"]);
});

test("notifyEvent does nothing when the database says no", async () => {
  const out = await notifyEvent({ type: "task", room: "abcdef12", id }, { job: async () => null, send: assert.fail, drop: assert.fail });
  assert.equal(out.sent, 0);
});

test("notifyReminders words the count", async () => {
  const sent = [];
  await notifyReminders({
    reminders: async () => [{ endpoint: "e", sub: {}, room: "abcdef12", left: 1 }, { endpoint: "f", sub: {}, room: "abcdef12", left: 3 }],
    send: async (_s, p) => sent.push(JSON.parse(p).title), drop: async () => {},
  });
  assert.deepEqual(sent, ["🔥 1 task left today", "🔥 3 tasks left today"]);
});
