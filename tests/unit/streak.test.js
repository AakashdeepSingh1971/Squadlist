import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayKey, weekday, repeatLabel } from "../../src/lib/days.js";
import { indexDone, dayScore, dayStatus, streak, countsOn, weekCounts } from "../../src/lib/streak.js";

const TODAY = "2026-11-15"; // a Sunday
const daily = (id, who, from = "2026-11-01", extra = {}) =>
  ({ id, assigned_to: who, repeat: [0, 1, 2, 3, 4, 5, 6], due: null, created_day: from, deleted_day: null, ...extra });
const once = (id, who, due, extra = {}) =>
  ({ id, assigned_to: who, repeat: null, due, created_day: "2026-11-01", deleted_day: null, ...extra });
const did = (task_id, member, day) => ({ task_id, member, day });

test("day helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(weekday(TODAY), 0);
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(repeatLabel([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(repeatLabel([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.equal(repeatLabel(null), null);
});

test("half the tasks is enough, less isn't", () => {
  const tasks = [daily("a", "me"), daily("b", "me"), daily("c", "me")];
  const one = indexDone([did("a", "me", TODAY)]);
  const two = indexDone([did("a", "me", TODAY), did("b", "me", TODAY)]);
  assert.deepEqual(dayScore(tasks, one, "me", TODAY), { total: 3, done: 1 });
  assert.equal(dayStatus(tasks, one, ["me"], TODAY), "miss");
  assert.equal(dayStatus(tasks, two, ["me"], TODAY), "ok");
  // exactly half
  const even = [daily("a", "me"), daily("b", "me")];
  assert.equal(dayStatus(even, one, ["me"], TODAY), "ok");
});

test("squad day needs every friend with tasks at half", () => {
  const tasks = [daily("a", "me"), daily("b", "you"), daily("c", "you")];
  const onlyMe = indexDone([did("a", "me", TODAY)]);
  assert.equal(dayStatus(tasks, onlyMe, ["me", "you"], TODAY), "miss");
  const both = indexDone([did("a", "me", TODAY), did("c", "you", TODAY)]);
  assert.equal(dayStatus(tasks, both, ["me", "you"], TODAY), "ok");
  // a friend with nothing on their list that day doesn't hold the squad back
  assert.equal(dayStatus([daily("a", "me")], onlyMe, ["me", "you", "them"], TODAY), "ok");
  assert.equal(dayStatus([], onlyMe, ["me"], TODAY), "empty");
});

test("streak counts back from yesterday while today is unfinished", () => {
  const tasks = [daily("a", "me", "2026-11-10")];
  const done = ["2026-11-12", "2026-11-13", "2026-11-14"].map((d) => did("a", "me", d));
  assert.deepEqual(streak(tasks, done, ["me"], TODAY), { current: 3, best: 3, todayOk: false });
  const withToday = [...done, did("a", "me", TODAY)];
  assert.deepEqual(streak(tasks, withToday, ["me"], TODAY), { current: 4, best: 4, todayOk: true });
});

test("a missed day breaks it, best is remembered", () => {
  const tasks = [daily("a", "me", "2026-11-01")];
  const done = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-14"].map((d) => did("a", "me", d));
  const s = streak(tasks, done, ["me"], TODAY);
  assert.equal(s.current, 1);
  assert.equal(s.best, 4);
});

test("days with nothing to do don't break the streak", () => {
  const tasks = [daily("a", "me", "2026-11-01", { repeat: [1, 3, 5] })]; // Mon, Wed, Fri
  const done = ["2026-11-09", "2026-11-11", "2026-11-13"].map((d) => did("a", "me", d));
  assert.equal(streak(tasks, done, ["me"], TODAY).current, 3);
});

test("removed tasks stop counting from the day they were removed", () => {
  const t = daily("a", "me", "2026-11-01", { deleted_day: "2026-11-14" });
  const idx = indexDone([]);
  assert.equal(countsOn(t, "2026-11-13", idx), true);
  assert.equal(countsOn(t, "2026-11-14", idx), false);
  assert.equal(countsOn(t, "2026-10-31", idx), false);
});

test("one-off tasks count on the day done, or on the due day while not done", () => {
  const t = once("x", "me", "2026-11-20");
  assert.equal(countsOn(t, "2026-11-20", indexDone([])), true);
  const early = indexDone([did("x", "me", "2026-11-15")]);
  assert.equal(countsOn(t, "2026-11-15", early), true);
  assert.equal(countsOn(t, "2026-11-20", early), false);
  const undated = once("y", "me", null);
  assert.equal(countsOn(undated, TODAY, indexDone([])), false);
  assert.equal(countsOn(undated, TODAY, indexDone([did("y", "me", TODAY)])), true);
});

test("week counts", () => {
  const done = [did("a", "me", TODAY), did("a", "me", "2026-11-09"), did("a", "me", "2026-11-08"), did("b", "you", TODAY)];
  assert.deepEqual(weekCounts(done, TODAY), { me: 2, you: 1 });
});

import { personLists } from "../../src/lib/lists.js";

test("a person's list: overdue, today, upcoming, other days, done", () => {
  const at = "2026-11-01T00:00:00Z";
  const tasks = [
    { ...daily("gym", "me"), created_at: at },
    { ...daily("run", "me", "2026-11-01", { repeat: [1] }), created_at: at }, // Mondays only
    { ...once("late", "me", "2026-11-10"), created_at: at },
    { ...once("soon", "me", "2026-11-20"), created_at: at },
    { ...once("whenever", "me", null), created_at: at },
    { ...once("old", "me", null), created_at: at },
    { ...once("theirs", "you", TODAY), created_at: at },
    { ...daily("gone", "me", "2026-11-01", { deleted_day: TODAY }), created_at: at },
  ];
  const idx = indexDone([did("gym", "me", TODAY), did("old", "me", "2026-11-03")]);
  const l = personLists(tasks, idx, "me", TODAY);
  const ids = (xs) => xs.map((x) => x.task.id);
  assert.deepEqual(ids(l.overdue), ["late"]);
  assert.deepEqual(ids(l.today), ["whenever"]);
  assert.deepEqual(ids(l.upcoming), ["soon"]);
  assert.deepEqual(ids(l.otherDays), ["run"]);
  assert.deepEqual(ids(l.done), ["gym"]);
});

import { frozenSet, freezeBank } from "../../src/lib/streak.js";

test("a freeze saves a missed day for the person and the squad", () => {
  const tasks = [daily("a", "me", "2026-11-10"), daily("b", "you", "2026-11-10")];
  const done = ["2026-11-12", "2026-11-14"].flatMap((d) => [did("a", "me", d), did("b", "you", d)]);
  // both missed the 13th
  assert.equal(streak(tasks, done, ["me", "you"], TODAY).current, 1);
  const frozen = frozenSet([{ member: "me", day: "2026-11-13" }]);
  assert.equal(streak(tasks, done, ["me"], TODAY, { frozen }).current, 3);
  // squad still broken: you didn't freeze
  assert.equal(streak(tasks, done, ["me", "you"], TODAY, { frozen }).current, 1);
  frozen.add("you|2026-11-13");
  assert.equal(streak(tasks, done, ["me", "you"], TODAY, { frozen }).current, 3);
});

test("freezes: one per 7 good days, two at most, minus used", () => {
  const tasks = [daily("a", "me", "2026-10-01")];
  const days = []; for (let d = "2026-10-01"; d <= "2026-10-21"; d = addDays(d, 1)) days.push(d);
  const idx = indexDone(days.map((d) => did("a", "me", d))); // 21 good days -> 3 earned, capped at 2
  assert.deepEqual(freezeBank(tasks, idx, "me", "2026-10-21", new Set()), { available: 2, earned: 3, nextIn: 7 });
  assert.equal(freezeBank(tasks, idx, "me", "2026-10-23", new Set(["me|2026-10-22"])).available, 1);
  assert.equal(freezeBank(tasks, indexDone([]), "me", "2026-10-05", new Set()).available, 0);
});
