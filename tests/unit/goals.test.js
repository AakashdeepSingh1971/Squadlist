import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeState, earnedBadges } from "../../src/lib/goals.js";

const TODAY = "2026-11-15";
const k = (member, day, t = "10") => ({ challenge_id: "c", member, day, created_at: `${day}T${t}:00:00Z` });

test("first to the goal wins, even if someone passes them later", () => {
  const ch = { id: "c", goal: 2, ends: null };
  const s = challengeState(ch, [k("a", "2026-11-10"), k("b", "2026-11-10"), k("b", "2026-11-11", "09"), k("a", "2026-11-11", "11"), k("a", "2026-11-12")], TODAY);
  assert.equal(s.winner, "b");
  assert.equal(s.wonOn, "2026-11-11");
  assert.deepEqual(s.counts, { a: 3, b: 2 });
  assert.equal(s.over, true);
});

test("ended without reaching the goal: the leader wins, a tie has no winner", () => {
  const ch = { id: "c", goal: 10, ends: "2026-11-14" };
  assert.equal(challengeState(ch, [k("a", "2026-11-10"), k("a", "2026-11-11"), k("b", "2026-11-11")], TODAY).winner, "a");
  assert.equal(challengeState(ch, [k("a", "2026-11-10"), k("b", "2026-11-11")], TODAY).winner, null);
  const live = challengeState({ ...ch, ends: TODAY }, [k("a", TODAY)], TODAY);
  assert.equal(live.over, false);
  assert.ok(live.checkedToday.has("a"));
});

test("badges", () => {
  const done = Array.from({ length: 10 }, (_, i) => ({ member: "a", task_id: "t" + i, day: TODAY, created_at: "2026-11-15T05:00:00", photo: i < 5 ? "x" : null }));
  const has = earnedBadges("a", {
    tasks: [], done, events: [], freezes: [{ member: "a", day: TODAY }], challenges: [], checkins: [],
    streakBest: 7, squadBest: 2, today: TODAY,
  });
  assert.deepEqual([...has].sort(), ["done10", "early", "ice", "receipts", "streak3", "streak7"]);
});
