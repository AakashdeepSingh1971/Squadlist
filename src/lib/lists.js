import { weekday } from "./days.js";

/**
 * One person's tasks, sorted the way the list shows them.
 * Each entry: { task, day, done } where day is the day a tick counts for.
 */
export function personLists(tasks, idx, member, today) {
  const out = { overdue: [], today: [], upcoming: [], otherDays: [], done: [] };
  const wd = weekday(today);
  for (const task of tasks) {
    if (task.assigned_to !== member) continue;
    if (task.deleted_day && task.deleted_day <= today) continue;
    if (task.repeat?.length) {
      if (!task.repeat.includes(wd)) { out.otherDays.push({ task, day: today, done: false }); continue; }
      const done = idx.byTaskDay.has(task.id + "|" + today);
      (done ? out.done : out.today).push({ task, day: today, done });
      continue;
    }
    const doneDay = idx.onceDoneDay.get(task.id);
    if (doneDay) {
      if (doneDay === today) out.done.push({ task, day: doneDay, done: true });
      continue; // finished on an earlier day: off the list
    }
    const entry = { task, day: today, done: false };
    if (task.due && task.due < today) out.overdue.push(entry);
    else if (task.due && task.due > today) out.upcoming.push(entry);
    else out.today.push(entry);
  }
  const byDue = (a, b) => (a.task.due || "").localeCompare(b.task.due || "") || a.task.created_at.localeCompare(b.task.created_at);
  const byAdded = (a, b) => a.task.created_at.localeCompare(b.task.created_at);
  out.overdue.sort(byDue);
  out.upcoming.sort(byDue);
  out.today.sort(byAdded);
  out.otherDays.sort(byAdded);
  out.done.sort(byAdded);
  return out;
}
