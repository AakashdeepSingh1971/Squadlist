// Days are plain "YYYY-MM-DD" strings in the phone's own time zone, so a day
// means the same thing to everyone looking at it and compares with < and >.

const pad = (n) => String(n).padStart(2, "0");

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // midday, so DST changes never move the date
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** 0 = Sunday ... 6 = Saturday */
export const weekday = (key) => parseDay(key).getDay();

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function repeatLabel(repeat) {
  if (!repeat?.length) return null;
  const set = [...new Set(repeat)].sort();
  if (set.length === 7) return "Every day";
  if (set.join() === WEEKDAYS.join()) return "Weekdays";
  if (set.join() === "0,6") return "Weekends";
  return set.map((d) => DAY_NAMES[d]).join(", ");
}

/** "Today", "Tomorrow", "Yesterday", "Mon 18 Nov" */
export function dueLabel(due, today = dayKey()) {
  if (!due) return null;
  if (due === today) return "Today";
  if (due === addDays(today, 1)) return "Tomorrow";
  if (due === addDays(today, -1)) return "Yesterday";
  const d = parseDay(due);
  const month = d.toLocaleString("en", { month: "short" });
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${month}`;
}
