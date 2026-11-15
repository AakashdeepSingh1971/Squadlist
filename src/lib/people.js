// Colors and emojis friends pick from

export const COLORS = [
  "#f2612d", "#e8a317", "#22a06b", "#0ea5a4", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899", "#ef4444", "#64748b",
];

export const EMOJIS = [
  "😎", "🤓", "🦊", "🐼", "🐸", "🐯", "🦁", "🐙", "👾", "🤖", "👻", "🍕",
  "🌵", "⚡", "🔥", "🌈", "🎧", "🏀", "⚽", "🎮", "📚", "🚀", "🧃", "🍜",
];

export const REACTIONS = ["🔥", "👏", "💪", "😂", "💀"];

export const initial = (name = "?") => [...name.trim()][0]?.toUpperCase() || "?";

/** a color nobody in the room has yet, if there is one */
export function freeColor(members) {
  const used = new Set(members.map((m) => m.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[members.length % COLORS.length];
}

export const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
