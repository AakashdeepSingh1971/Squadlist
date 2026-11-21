// Colors and emojis friends pick from

export const COLORS = [
  "#f2612d", "#e8a317", "#22a06b", "#0ea5a4", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899", "#ef4444", "#64748b",
];

export const EMOJIS = [
  "😎", "🤓", "🦊", "🐼", "🐸", "🐯", "🦁", "🐙", "👾", "🤖", "👻", "🍕",
  "🌵", "⚡", "🔥", "🌈", "🎧", "🏀", "⚽", "🎮", "📚", "🚀", "🧃", "🍜",
];

export const REACTIONS = ["🔥", "👏", "💪", "😂", "💀", "❤️", "🙌", "🎉", "😮", "🫡", "👑", "🐐", "💯", "🤝", "😤", "🥲"];

/** first emoji in what someone typed, or null if it isn't one */
export function pickEmoji(text = "") {
  const first = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())][0]?.segment
    : [...text.trim()][0];
  return first && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) && first.length <= 16 ? first : null;
}

export const initial = (name = "?") => [...name.trim()][0]?.toUpperCase() || "?";

/** a color nobody in the room has yet, if there is one */
export function freeColor(members) {
  const used = new Set(members.map((m) => m.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[members.length % COLORS.length];
}

export const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
