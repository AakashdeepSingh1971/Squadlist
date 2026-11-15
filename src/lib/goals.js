// Challenges ("first to 10 gym days") and badges

/**
 * Progress in a challenge: one check-in per person per day.
 * Winner = first to reach the goal (by day, then by time). When it ends
 * before anyone gets there, whoever is ahead wins.
 */
export function challengeState(ch, checkins, today) {
  const mine = checkins
    .filter((k) => k.challenge_id === ch.id)
    .sort((a, b) => a.day.localeCompare(b.day) || (a.created_at || "").localeCompare(b.created_at || ""));
  const counts = {};
  let winner = null, wonOn = null;
  for (const k of mine) {
    counts[k.member] = (counts[k.member] || 0) + 1;
    if (!winner && counts[k.member] >= ch.goal) { winner = k.member; wonOn = k.day; }
  }
  const ended = !!ch.ends && ch.ends < today;
  if (!winner && ended) {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (top.length && (top.length === 1 || top[0][1] > top[1][1])) winner = top[0][0];
  }
  const checkedToday = new Set(mine.filter((k) => k.day === today).map((k) => k.member));
  return { counts, winner, wonOn, over: !!winner || ended, ended, checkedToday };
}

export const BADGES = [
  { id: "streak3", emoji: "🌱", name: "Warming up", desc: "3-day streak" },
  { id: "streak7", emoji: "🔥", name: "On fire", desc: "7-day streak" },
  { id: "streak30", emoji: "🌋", name: "Volcano", desc: "30-day streak" },
  { id: "streak100", emoji: "💯", name: "Unstoppable", desc: "100-day streak" },
  { id: "squad7", emoji: "🤝", name: "Squad goals", desc: "Squad streak of 7" },
  { id: "done10", emoji: "✅", name: "Getting it done", desc: "10 tasks finished" },
  { id: "done100", emoji: "🏛️", name: "Centurion", desc: "100 tasks finished" },
  { id: "giver", emoji: "🎁", name: "Task giver", desc: "Gave friends 10 tasks" },
  { id: "nudger", emoji: "👉", name: "Nudge lord", desc: "Sent 10 nudges" },
  { id: "hype", emoji: "📣", name: "Hype friend", desc: "Reacted 20 times" },
  { id: "receipts", emoji: "📸", name: "Receipts", desc: "5 photo proofs" },
  { id: "early", emoji: "🌅", name: "Early bird", desc: "10 tasks done before 8am" },
  { id: "champ", emoji: "🏆", name: "Champion", desc: "Won a challenge" },
  { id: "ice", emoji: "🧊", name: "Ice cold", desc: "Saved a day with a freeze" },
];

/** ids of the badges a member has */
export function earnedBadges(member, { tasks, done, events, freezes, challenges, checkins, streakBest, squadBest, today }) {
  const has = new Set();
  const myDone = done.filter((d) => d.member === member);
  if (streakBest >= 3) has.add("streak3");
  if (streakBest >= 7) has.add("streak7");
  if (streakBest >= 30) has.add("streak30");
  if (streakBest >= 100) has.add("streak100");
  if (squadBest >= 7) has.add("squad7");
  if (myDone.length >= 10) has.add("done10");
  if (myDone.length >= 100) has.add("done100");
  if (tasks.filter((t) => t.created_by === member && t.assigned_to !== member).length >= 10) has.add("giver");
  const sent = events.filter((e) => e.from_member === member);
  if (sent.filter((e) => e.kind === "nudge").length >= 10) has.add("nudger");
  if (sent.filter((e) => e.kind === "react").length >= 20) has.add("hype");
  if (myDone.filter((d) => d.photo).length >= 5) has.add("receipts");
  if (myDone.filter((d) => d.created_at && new Date(d.created_at).getHours() < 8).length >= 10) has.add("early");
  if (challenges.some((c) => challengeState(c, checkins, today).winner === member)) has.add("champ");
  if (freezes.some((f) => f.member === member)) has.add("ice");
  return has;
}
