import { addDays, weekday } from "./days.js";

/*
 * Which tasks count on a day, and the streak rules.
 *
 * task: { id, assigned_to, repeat: number[] | null, due: day | null,
 *         created_day: day, deleted_day: day | null }
 * done: { task_id, member, day }
 *
 * A repeating task counts on each of its weekdays from the day it was added
 * until the day it was removed.
 * A one-off task counts on the day it was done, or, while it isn't done, on
 * its due day (so a missed due day counts against you). A one-off task with no
 * due date only counts once it's done.
 *
 * A day is "ok" for a person when they finished at least half of their tasks
 * that day. The squad streak grows on days when everyone who had tasks hit
 * half. Days when nobody had anything are skipped: they don't grow or break it.
 */

export const PASS = 0.5;

export function indexDone(done) {
  const byTaskDay = new Set();
  const onceDoneDay = new Map(); // task id -> first day it was done
  for (const d of done) {
    byTaskDay.add(d.task_id + "|" + d.day);
    const cur = onceDoneDay.get(d.task_id);
    if (!cur || d.day < cur) onceDoneDay.set(d.task_id, d.day);
  }
  return { byTaskDay, onceDoneDay };
}

const alive = (t, day) => day >= t.created_day && !(t.deleted_day && day >= t.deleted_day);

/** Is this task on someone's list for that day? */
export function countsOn(task, day, idx) {
  if (task.repeat?.length) return alive(task, day) && task.repeat.includes(weekday(day));
  const doneDay = idx.onceDoneDay.get(task.id);
  if (doneDay) return doneDay === day;
  return !!task.due && task.due === day && !(task.deleted_day && task.deleted_day <= day);
}

export function isDone(task, day, idx) {
  if (task.repeat?.length) return idx.byTaskDay.has(task.id + "|" + day);
  return idx.onceDoneDay.has(task.id);
}

/** { total, done } for one person on one day */
export function dayScore(tasks, idx, member, day) {
  let total = 0, done = 0;
  for (const t of tasks) {
    if (t.assigned_to !== member || !countsOn(t, day, idx)) continue;
    total++;
    if (isDone(t, day, idx)) done++;
  }
  return { total, done };
}

export const passed = ({ total, done }) => total > 0 && done >= total * PASS;

/**
 * "ok" | "miss" | "empty" for a group of people on a day.
 * frozen: Set of "member|day" where someone used a streak freeze; that person
 * counts as done that day.
 */
export function dayStatus(tasks, idx, members, day, frozen) {
  let any = false;
  for (const m of members) {
    const s = dayScore(tasks, idx, m, day);
    if (!s.total) continue;
    any = true;
    if (!passed(s) && !frozen?.has(m + "|" + day)) return "miss";
  }
  return any ? "ok" : "empty";
}

export const frozenSet = (freezes = []) => new Set(freezes.map((f) => f.member + "|" + f.day));

export const FREEZE_EVERY = 7; // ok days per freeze earned
export const FREEZE_MAX = 2; // most you can hold

/**
 * Freezes a person has: one earned for every 7 days they hit half, two at
 * most at a time, minus the ones they've used.
 */
export function freezeBank(tasks, idx, member, today, frozen) {
  const first = tasks.reduce((min, t) => (t.assigned_to === member && t.created_day < min ? t.created_day : min), today);
  let bank = 0, okDays = 0, earned = 0;
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (frozen?.has(member + "|" + day)) { bank = Math.max(0, bank - 1); continue; }
    if (passed(dayScore(tasks, idx, member, day))) {
      okDays++;
      if (okDays % FREEZE_EVERY === 0) { earned++; bank = Math.min(FREEZE_MAX, bank + 1); }
    }
  }
  return { available: bank, earned, nextIn: FREEZE_EVERY - (okDays % FREEZE_EVERY) };
}

/**
 * Current and best streak for a group (one id = a personal streak).
 * Today only counts once it's ok; an unfinished today doesn't break anything yet.
 */
export function streak(tasks, done, members, today, { idx = indexDone(done), maxDays = 730, frozen } = {}) {
  const first = tasks.reduce((min, t) => (t.created_day < min ? t.created_day : min), today);
  const doneFirst = done.reduce((min, d) => (d.day < min ? d.day : min), first);
  let current = 0, best = 0, run = 0, counting = true, todayOk = false;

  for (let i = 0, day = today; i < maxDays && day >= doneFirst; i++, day = addDays(day, -1)) {
    const s = dayStatus(tasks, idx, members, day, frozen);
    if (i === 0) todayOk = s === "ok";
    if (s === "empty") continue;
    if (s === "ok") {
      run++;
      if (counting) current = run;
    } else {
      if (i === 0) continue; // today isn't over yet
      counting = false;
      run = 0;
    }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current), todayOk };
}

/** Last n days for the heatmap: [{ day, total, done }] oldest first */
export function history(tasks, idx, member, today, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, ...dayScore(tasks, idx, member, day) });
  }
  return out;
}

/** Tasks finished in the last 7 days (today included), per person */
export function weekCounts(done, today) {
  const from = addDays(today, -6);
  const counts = {};
  for (const d of done) if (d.day >= from && d.day <= today) counts[d.member] = (counts[d.member] || 0) + 1;
  return counts;
}
