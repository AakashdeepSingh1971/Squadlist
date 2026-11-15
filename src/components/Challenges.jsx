import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, Plus, Trophy, Trash2 } from "lucide-react";
import { Avatar, Chip, Sheet } from "./ui.jsx";
import { challengeState } from "../lib/goals.js";
import { addDays, dueLabel } from "../lib/days.js";
import { burst } from "./TaskItem.jsx";

const IDEAS = [
  ["💪", "First to 10 gym days", 10, 30],
  ["📵", "No doomscrolling before bed", 7, 7],
  ["📚", "Read 20 days this month", 20, 30],
  ["🥗", "No junk food", 5, 7],
  ["🏃", "Run 12 times", 12, 30],
];
const EMOJIS = ["🏆", "💪", "📚", "🏃", "🥗", "📵", "🧘", "💧", "🎸", "💻", "🛌", "🚭"];

function NewChallenge({ open, onClose, onAdd, today }) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [goal, setGoal] = useState(10);
  const [length, setLength] = useState(30); // days, 0 = no end
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), emoji, goal: Math.max(1, Math.min(365, goal | 0)), ends: length ? addDays(today, length - 1) : null });
      toast.success("Challenge on! 🏁");
      setTitle(""); onClose();
    } catch (x) { toast.error("Couldn't start it", { description: x.message }); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New challenge"
      footer={<button onClick={submit} disabled={!title.trim() || busy}
        className="h-13 w-full rounded-2xl bg-accent font-semibold text-accent-ink disabled:opacity-50">{busy ? "Starting…" : "Start the challenge"}</button>}>
      <p className="text-sm text-muted">Everyone in the room is in. Check in once a day; first to the goal wins.</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="First to 10 gym days" aria-label="Challenge"
        className="mt-3 h-13 w-full rounded-2xl bg-sunk px-4 text-lg font-medium outline-none placeholder:text-muted/70" />
      {!title && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5">
          {IDEAS.map(([e, t, g, l]) => (
            <button key={t} type="button" onClick={() => { setTitle(t); setEmoji(e); setGoal(g); setLength(l); }}
              className="h-8 shrink-0 rounded-full border border-dashed border-line px-3 text-xs font-medium text-muted">{e} {t}</button>
          ))}
        </div>
      )}
      <p className="mt-5 mb-2 text-sm font-semibold">Emoji</p>
      <div className="grid grid-cols-6 gap-1.5">
        {EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} aria-label={`Emoji ${e}`}
            className={`grid aspect-square place-items-center rounded-xl text-xl ${emoji === e ? "bg-accent/15 ring-2 ring-accent" : "bg-sunk"}`}>{e}</button>
        ))}
      </div>
      <p className="mt-5 mb-2 text-sm font-semibold">Goal: check-ins to win</p>
      <div className="flex flex-wrap items-center gap-2">
        {[5, 7, 10, 20, 30].map((g) => <Chip key={g} active={goal === g} onClick={() => setGoal(g)}>{g}</Chip>)}
        <input type="number" min={1} max={365} value={goal} onChange={(e) => setGoal(Number(e.target.value))} aria-label="Custom goal"
          className="h-9 w-20 rounded-full bg-sunk px-3 text-center text-sm font-semibold outline-none" />
      </div>
      <p className="mt-5 mb-2 text-sm font-semibold">Ends</p>
      <div className="flex flex-wrap gap-2">
        {[[7, "In a week"], [14, "2 weeks"], [30, "A month"], [0, "When someone wins"]].map(([l, label]) => (
          <Chip key={l} active={length === l} onClick={() => setLength(l)}>{label}</Chip>
        ))}
      </div>
    </Sheet>
  );
}

function ChallengeCard({ ch, squad, meId, membersById }) {
  const st = challengeState(ch, squad.checkins, squad.today);
  const ranked = [...squad.members].sort((a, b) => (st.counts[b.id] || 0) - (st.counts[a.id] || 0));
  const mineToday = st.checkedToday.has(meId);
  const winner = membersById[st.winner];

  const check = async (e) => {
    const on = !mineToday;
    if (on) {
      navigator.vibrate?.(15);
      const reached = (st.counts[meId] || 0) + 1 >= ch.goal && !st.winner;
      burst(e.currentTarget, membersById[meId]?.color, reached);
      if (reached) toast.success(`You won “${ch.title}” 🏆`);
    }
    try { await squad.actions.checkin(ch, squad.today, on); }
    catch (x) { toast.error(x.message); }
  };

  return (
    <motion.article layout className={`relative overflow-hidden rounded-3xl border p-4 ${st.over ? "border-line bg-sunk/60" : "border-line bg-card"}`}>
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sunk text-2xl">{ch.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight font-semibold break-words">{ch.title}</h3>
          <p className="mt-0.5 text-xs text-muted">
            First to {ch.goal} · {st.over ? (st.ended ? "ended" : "finished") : ch.ends ? `ends ${dueLabel(ch.ends, squad.today)}` : "no end date"}
          </p>
        </div>
        {ch.created_by === meId && (
          <button aria-label={`Remove ${ch.title}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-sunk"
            onClick={() => confirm(`Remove “${ch.title}” for everyone?`) && squad.actions.removeChallenge(ch).catch((x) => toast.error(x.message))}>
            <Trash2 className="size-4" />
          </button>
        )}
      </header>

      {winner && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
          <Trophy className="size-4" /> {winner.id === meId ? "You won!" : `${winner.name} won!`} {winner.emoji}
        </p>
      )}
      {st.ended && !winner && <p className="mt-3 text-sm text-muted">It's a tie. Rematch?</p>}

      <ol className="mt-3 space-y-2">
        {ranked.map((m) => {
          const n = st.counts[m.id] || 0;
          return (
            <li key={m.id} className="flex items-center gap-2.5">
              <Avatar member={m} size={24} />
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunk">
                <motion.div className="h-full rounded-full" style={{ background: m.color }} initial={false}
                  animate={{ width: `${Math.min(100, (n / ch.goal) * 100)}%` }} />
              </div>
              <span className="w-12 text-right text-xs font-bold tabular-nums">{n}/{ch.goal}{st.checkedToday.has(m.id) ? " ✓" : ""}</span>
            </li>
          );
        })}
      </ol>

      {!st.over && (
        <button onClick={check}
          className={`mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[.98] ${
            mineToday ? "bg-sunk text-muted" : "bg-accent text-accent-ink"}`}>
          {mineToday ? <><Check className="size-4" /> Checked in today (tap to undo)</> : "Check in today"}
        </button>
      )}
    </motion.article>
  );
}

export default function Challenges({ squad, meId, membersById }) {
  const [adding, setAdding] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const all = squad.challenges.map((c) => ({ c, over: challengeState(c, squad.checkins, squad.today).over }));
  const live = all.filter((x) => !x.over);
  const old = all.filter((x) => x.over);

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted"><Trophy className="size-4" /> Challenges</h2>
        <button onClick={() => setAdding(true)} className="flex h-8 items-center gap-1 rounded-full bg-sunk px-3 text-xs font-semibold">
          <Plus className="size-3.5" /> New
        </button>
      </div>
      {live.length === 0 && (
        <button onClick={() => setAdding(true)} className="w-full rounded-3xl border-2 border-dashed border-line p-5 text-left">
          <p className="font-semibold">🏁 Start a friendly challenge</p>
          <p className="mt-0.5 text-sm text-muted">"First to 10 gym days", "No junk food this week"… loser buys chai.</p>
        </button>
      )}
      <div className="space-y-3">
        {live.map(({ c }) => <ChallengeCard key={c.id} ch={c} squad={squad} meId={meId} membersById={membersById} />)}
      </div>
      {old.length > 0 && (
        <>
          <button onClick={() => setShowOld((s) => !s)} className="mt-3 w-full text-center text-xs font-semibold text-muted">
            {showOld ? "Hide" : "Show"} finished challenges ({old.length})
          </button>
          {showOld && <div className="mt-3 space-y-3">{old.map(({ c }) => <ChallengeCard key={c.id} ch={c} squad={squad} meId={meId} membersById={membersById} />)}</div>}
        </>
      )}
      <NewChallenge open={adding} onClose={() => setAdding(false)} today={squad.today} onAdd={squad.actions.addChallenge} />
    </section>
  );
}
