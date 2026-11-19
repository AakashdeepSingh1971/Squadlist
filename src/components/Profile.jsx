import { useState } from "react";
import { motion } from "motion/react";
import { Check, Lock } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { COLORS, EMOJIS, freeColor, randomEmoji } from "../lib/people.js";

export function ProfileForm({ initialValue, members = [], submitLabel, onSubmit }) {
  const [name, setName] = useState(initialValue?.name || "");
  const [emoji, setEmoji] = useState(initialValue?.emoji || randomEmoji());
  const [color, setColor] = useState(initialValue?.color || freeColor(members));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr("What should your friends call you?"); return; }
    setBusy(true); setErr("");
    try { await onSubmit({ name: name.trim(), emoji, color }); }
    catch (x) { setErr(/full/.test(x.message) ? "This room already has 10 friends. It's full." : x.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-3">
        <Avatar member={{ name: name || "?", color }} size={56} />
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name"
          aria-label="Your name" autoFocus={!initialValue}
          className="h-12 min-w-0 flex-1 rounded-2xl bg-sunk px-4 text-lg font-semibold outline-none placeholder:text-muted/70" />
      </div>

      <p className="mt-5 mb-2 text-sm font-semibold">Your color</p>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => {
          const taken = members.some((m) => m.color === c && m.id !== initialValue?.id);
          return (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}${taken ? " (a friend has it)" : ""}`}
              aria-pressed={color === c}
              className={`grid size-9 place-items-center rounded-full transition active:scale-90 ${taken ? "opacity-40" : ""}`}
              style={{ background: c }}>
              {color === c && <Check className="size-4 text-white" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      <p className="mt-5 mb-2 text-sm font-semibold">Your emoji</p>
      <div className="grid grid-cols-8 gap-1.5">
        {EMOJIS.map((em) => (
          <button key={em} type="button" onClick={() => setEmoji(em)} aria-pressed={emoji === em} aria-label={`Emoji ${em}`}
            className={`grid aspect-square place-items-center rounded-xl text-xl transition active:scale-90 ${emoji === em ? "bg-accent/15 ring-2 ring-accent" : "bg-sunk"}`}>
            {em}
          </button>
        ))}
      </div>

      {err && <p className="mt-4 text-sm text-red-500" role="alert">{err}</p>}
      <button disabled={busy} className="mt-6 h-13 w-full rounded-2xl bg-accent font-semibold text-accent-ink transition active:scale-[.98] disabled:opacity-60">
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/** First time in a room on this phone: pick who you are, or join as someone new */
export function WhoAreYou({ members, label, onPick, onJoin, onLeave, onThisPhone = () => false }) {
  const [adding, setAdding] = useState(members.length === 0);
  const full = members.length >= 10;

  return (
    <div className="min-h-dvh pt-safe">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md px-4 pt-12 pb-16">
        <p className="text-sm font-semibold text-accent">{label || "Your squad's room"}</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">
          {members.length ? "Who's this?" : "You're the first one here 👋"}
        </h1>
        <p className="mt-2 text-muted">
          {members.length
            ? `${members.length} of 10 spots taken. Been here on another phone? There, open Settings → Use me on another phone.`
            : "Set yourself up, then share the room with your friends."}
        </p>

        {members.length > 0 && (
          <ul className="mt-6 grid grid-cols-2 gap-2">
            {members.map((m) => {
              const locked = m.claimed && !onThisPhone(m.id); // someone's phone already is this person
              return (
                <li key={m.id}>
                  <button onClick={() => onPick(m)} aria-disabled={locked}
                    className={`flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3 text-left transition active:scale-[.98] ${locked ? "opacity-55" : ""}`}>
                    <Avatar member={m} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.name}</span>
                      <span className="text-sm">{locked ? "On their phone" : m.emoji}</span>
                    </span>
                    {locked && <Lock className="size-4 shrink-0 text-muted" aria-label="On another phone" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {full ? (
          <p className="mt-6 rounded-2xl bg-sunk p-4 text-sm">This room is full (10 friends max).</p>
        ) : adding ? (
          <div className="mt-6 rounded-3xl border border-line bg-card p-5">
            <h2 className="mb-4 font-display text-xl font-semibold">{members.length ? "I'm new here" : "Make your profile"}</h2>
            <ProfileForm members={members} submitLabel="Join the squad" onSubmit={onJoin} />
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-4 h-12 w-full rounded-2xl border-2 border-dashed border-line font-semibold text-muted">
            + I'm new here
          </button>
        )}
        <button onClick={onLeave} className="mt-6 w-full text-center text-sm font-semibold text-muted">← Back to rooms</button>
      </motion.div>
    </div>
  );
}
