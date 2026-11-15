import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, Chip, Avatar } from "./ui.jsx";
import { addDays, DAY_LETTERS, DAY_NAMES, EVERY_DAY, WEEKDAYS } from "../lib/days.js";

const IDEAS = ["Drink 3L water 💧", "Gym 💪", "Read 10 pages 📚", "No phone after 11 📵", "Call your mum ☎️", "10k steps 🚶", "Study 1 hour 📖", "Sleep by 12 😴"];

export default function AddTask({ open, onClose, members, meId, forWho, today, onAdd }) {
  const [title, setTitle] = useState("");
  const [to, setTo] = useState([meId]);
  const [mode, setMode] = useState("once"); // once | daily | weekdays | custom
  const [days, setDays] = useState([1, 3, 5]);
  const [due, setDue] = useState("today"); // none | today | tomorrow | YYYY-MM-DD
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setTo([forWho || meId]); setMode("once"); setDue("today"); setProof(false);
  }, [open, forWho, meId]);

  const forFriends = to.some((id) => id !== meId);
  const everyone = to.length === members.length && members.length > 1;
  const toggleWho = (id) => setTo((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
  const repeat = mode === "daily" ? EVERY_DAY : mode === "weekdays" ? WEEKDAYS : mode === "custom" ? days : null;
  const dueDay = mode !== "once" || due === "none" ? null : due === "today" ? today : due === "tomorrow" ? addDays(today, 1) : due;

  const submit = async (e) => {
    e?.preventDefault();
    if (!title.trim() || busy) return;
    if (mode === "custom" && !days.length) { toast.error("Pick at least one day"); return; }
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), to, repeat, due: dueDay, needsProof: proof && forFriends });
      const names = to.filter((id) => id !== meId).map((id) => members.find((m) => m.id === id)?.name);
      toast.success(names.length ? `Added for ${names.join(", ")}` : "Added to your list");
      onClose();
    } catch (x) {
      toast.error("Couldn't add it", { description: x.message });
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New task"
      footer={
        <button onClick={submit} disabled={!title.trim() || busy}
          className="h-13 w-full rounded-2xl bg-accent font-semibold text-accent-ink transition active:scale-[.98] disabled:opacity-50">
          {busy ? "Adding…" : to.length > 1 ? `Add for ${to.length} people` : "Add task"}
        </button>
      }>
      <form onSubmit={submit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus
          placeholder="What needs doing?" aria-label="Task"
          className="h-13 w-full rounded-2xl bg-sunk px-4 text-lg font-medium outline-none placeholder:text-muted/70" />
        {!title && (
          <div className="no-scrollbar -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" onClick={() => setTitle(idea)}
                className="h-8 shrink-0 rounded-full border border-dashed border-line px-3 text-xs font-medium text-muted">{idea}</button>
            ))}
          </div>
        )}

        <p className="mt-5 mb-2 text-sm font-semibold">For</p>
        <div className="flex flex-wrap gap-2">
          {members.length > 1 && (
            <Chip active={everyone} onClick={() => setTo(everyone ? [meId] : members.map((m) => m.id))}>👥 Everyone</Chip>
          )}
          {members.map((m) => (
            <Chip key={m.id} active={to.includes(m.id)} color={m.color} onClick={() => toggleWho(m.id)}>
              <Avatar member={m} size={20} className={to.includes(m.id) ? "ring-2 ring-white/70" : ""} />
              {m.id === meId ? "Me" : m.name}
            </Chip>
          ))}
        </div>

        <p className="mt-5 mb-2 text-sm font-semibold">How often</p>
        <div className="flex flex-wrap gap-2">
          {[["once", "Once"], ["daily", "Every day"], ["weekdays", "Weekdays"], ["custom", "Pick days"]].map(([k, l]) => (
            <Chip key={k} active={mode === k} onClick={() => setMode(k)}>{l}</Chip>
          ))}
        </div>
        {mode === "custom" && (
          <div className="mt-3 flex justify-between gap-1">
            {DAY_LETTERS.map((d, i) => (
              <button key={i} type="button" aria-label={DAY_NAMES[i]} aria-pressed={days.includes(i)}
                onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()))}
                className={`grid size-10 place-items-center rounded-full text-sm font-bold transition ${days.includes(i) ? "bg-accent text-accent-ink" : "bg-sunk text-muted"}`}>
                {d}
              </button>
            ))}
          </div>
        )}

        {mode === "once" && (
          <>
            <p className="mt-5 mb-2 text-sm font-semibold">When</p>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={due === "today"} onClick={() => setDue("today")}>Today</Chip>
              <Chip active={due === "tomorrow"} onClick={() => setDue("tomorrow")}>Tomorrow</Chip>
              <Chip active={due === "none"} onClick={() => setDue("none")}>No date</Chip>
              <label className={`relative inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold ${/^\d/.test(due) ? "border-transparent bg-accent text-accent-ink" : "border-line"}`}>
                {/^\d/.test(due) ? due : "Pick date"}
                <input type="date" min={today} value={/^\d/.test(due) ? due : ""} aria-label="Pick a date"
                  onChange={(e) => e.target.value && setDue(e.target.value)} className="absolute inset-0 opacity-0" />
              </label>
            </div>
          </>
        )}
        {forFriends && (
          <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-sunk p-3">
            <span className="text-sm"><b>📸 Ask for photo proof</b><br /><span className="text-muted">They can only tick it with a photo</span></span>
            <input type="checkbox" checked={proof} onChange={(e) => setProof(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          </label>
        )}
        <p className="mt-5 text-xs text-muted">
          Only you can remove tasks you add. {to.some((id) => id !== meId) && "Your friend ticks them off."}
        </p>
      </form>
    </Sheet>
  );
}
