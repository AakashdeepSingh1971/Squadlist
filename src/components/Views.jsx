import { useMemo, useState } from "react";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, Crown, Plus } from "lucide-react";
import TaskItem from "./TaskItem.jsx";
import Challenges from "./Challenges.jsx";
import { isDemo } from "../lib/api.js";
import { Avatar } from "./ui.jsx";
import { personLists } from "../lib/lists.js";
import { history, weekCounts, dayScore, FREEZE_MAX } from "../lib/streak.js";
import { BADGES } from "../lib/goals.js";
import { addDays, dayKey, DAY_LETTERS, parseDay } from "../lib/days.js";
import { store } from "../lib/identity.js";

function Section({ title, count, tone, children, collapsible, defaultOpen = true, reorder }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!count) return null;
  return (
    <section className="mt-5">
      <button disabled={!collapsible} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="mb-2 flex w-full items-center gap-2 px-1 text-left text-sm font-bold uppercase tracking-wide text-muted">
        <span className={tone}>{title}</span>
        <span className="rounded-full bg-sunk px-2 py-0.5 text-xs">{count}</span>
        {collapsible && <ChevronDown className={`ml-auto size-4 transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (reorder
        ? <Reorder.Group axis="y" values={reorder.values} onReorder={reorder.onReorder} className="space-y-2">{children}</Reorder.Group>
        : <ul className="space-y-2"><AnimatePresence initial={false}>{children}</AnimatePresence></ul>)}
    </section>
  );
}

const renderItems = (entries, ctx, reorder = false) =>
  entries.map((e, i) => <TaskItem key={e.task.id + e.day} entry={e} index={i} ctx={ctx} reorder={reorder} />);

/** your own order for today's list, kept on this phone */
function useOrder(room, me, entries) {
  const key = `sl.order:${room}:${me}`;
  const [order, setOrder] = useState(() => store.get(key) || []);
  const sorted = useMemo(() => {
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...entries].sort((a, b) => (pos.get(a.task.id) ?? 1e9) - (pos.get(b.task.id) ?? 1e9));
  }, [entries, order]);
  const onReorder = (ids) => {
    const rest = order.filter((id) => !ids.includes(id));
    const next = [...ids, ...rest].slice(0, 500);
    setOrder(next);
    store.set(key, next);
  };
  return [sorted, onReorder];
}

function FreezeBanner({ freeze, onUse }) {
  const [busy, setBusy] = useState(false);
  if (!freeze?.canSave) return null;
  const use = async () => {
    setBusy(true);
    try { await onUse(); toast.success("Streak saved 🧊", { description: "Yesterday counts as done." }); }
    catch (x) { toast.error(x.message); }
    finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="mt-4 flex items-center gap-3 rounded-2xl border border-sky-300/50 bg-sky-400/10 p-3">
      <span className="text-3xl" aria-hidden>🧊</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">You missed yesterday</p>
        <p className="text-muted">Use a freeze to save your streak{freeze.squadAtRisk ? " (and the squad's)" : ""}. You have {freeze.available}.</p>
      </div>
      <button onClick={use} disabled={busy} className="h-9 shrink-0 rounded-full bg-sky-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "…" : "Use"}
      </button>
    </motion.div>
  );
}

export function MineView({ squad, idx, ctx, onAdd, freeze }) {
  const { meId, room } = ctx;
  const l = useMemo(() => personLists(squad.tasks, idx, meId, squad.today), [squad.tasks, idx, meId, squad.today]);
  const [today, onReorder] = useOrder(room, meId, l.today);
  const fromFriends = [...l.overdue, ...l.today].filter((e) => e.task.created_by !== meId).length;
  const nothing = !l.overdue.length && !l.today.length && !l.upcoming.length && !l.done.length && !l.otherDays.length;

  if (nothing) {
    return (
      <>
        <FreezeBanner freeze={freeze} onUse={() => squad.actions.useFreeze(addDays(squad.today, -1))} />
        <div className="mt-10 rounded-3xl border-2 border-dashed border-line p-8 text-center">
          <div className="text-5xl">📝</div>
          <h3 className="mt-3 font-display text-xl font-semibold">Your list is empty</h3>
          <p className="mt-1 text-sm text-muted">Add something for yourself, or wait for a friend to give you something to do.</p>
          <button onClick={() => onAdd(meId)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-accent-ink">
            <Plus className="size-4" /> Add a task
          </button>
        </div>
      </>
    );
  }
  return (
    <div>
      <FreezeBanner freeze={freeze} onUse={() => squad.actions.useFreeze(addDays(squad.today, -1))} />
      {fromFriends > 0 && (
        <p className="mt-4 rounded-2xl bg-accent/10 px-4 py-3 text-sm">
          <b>{fromFriends}</b> {fromFriends === 1 ? "task" : "tasks"} from your squad today. Don't let them down 😤
        </p>
      )}
      <Section title="Overdue" tone="text-red-500" count={l.overdue.length}>{renderItems(l.overdue, ctx)}</Section>
      <Section title="Today" count={today.length} reorder={today.length > 1 ? { values: today.map((e) => e.task.id), onReorder } : null}>
        {renderItems(today, ctx, today.length > 1)}
      </Section>
      <Section title="Done today ✓" tone="text-good" count={l.done.length} collapsible>{renderItems(l.done, ctx)}</Section>
      <Section title="Upcoming" count={l.upcoming.length} collapsible>{renderItems(l.upcoming, ctx)}</Section>
      <Section title="Other days" count={l.otherDays.length} collapsible defaultOpen={false}>{renderItems(l.otherDays, ctx)}</Section>
    </div>
  );
}

export function SquadView({ squad, idx, ctx, streaks, onAdd, onShare }) {
  const { meId, membersById } = ctx;
  const others = squad.members.filter((m) => m.id !== meId);
  const challenges = <Challenges squad={squad} meId={meId} membersById={membersById} />;
  if (!others.length) {
    return (
      <>
      {challenges}
      <div className="mt-6 rounded-3xl border-2 border-dashed border-line p-8 text-center">
        <div className="text-5xl">🫂</div>
        <h3 className="mt-3 font-display text-xl font-semibold">It's just you so far</h3>
        <p className="mt-1 text-sm text-muted">Send the room to your friends (up to 10). Then you can give each other tasks.</p>
        <button onClick={onShare} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-accent-ink">
          Invite friends
        </button>
      </div>
      </>
    );
  }
  return (
    <div>
    {challenges}
    <h2 className="mt-6 mb-2 px-1 text-sm font-bold uppercase tracking-wide text-muted">Today</h2>
    <div className="space-y-4">
      {others.map((m) => {
        const l = personLists(squad.tasks, idx, m.id, squad.today);
        const list = [...l.overdue, ...l.today, ...l.done];
        const s = dayScore(squad.tasks, idx, m.id, squad.today);
        const pct = s.total ? s.done / s.total : 0;
        return (
          <motion.section key={m.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-line bg-card p-4">
            <header className="flex items-center gap-3">
              <Avatar member={m} size={44} online={isDemo ? undefined : squad.online.has(m.id)} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-lg font-semibold">{m.name} <span className="text-base">{m.emoji}</span></h3>
                <p className="text-xs text-muted">
                  {s.total ? `${s.done}/${s.total} today` : "Nothing today"}
                  {streaks[m.id]?.current ? ` · 🔥 ${streaks[m.id].current} day streak` : ""}
                  {squad.online.has(m.id) ? " · here now" : ""}
                </p>
              </div>
              <button onClick={() => onAdd(m.id)} aria-label={`Add a task for ${m.name}`}
                className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white" style={{ background: m.color }}>
                <Plus className="size-4" /> Task
              </button>
            </header>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunk">
              <motion.div className="h-full rounded-full" style={{ background: m.color }}
                initial={false} animate={{ width: `${pct * 100}%` }} />
            </div>
            {list.length > 0 ? (
              <ul className="mt-3 space-y-2"><AnimatePresence initial={false}>{renderItems(list, ctx)}</AnimatePresence></ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Free day. Give {m.name} something to do?</p>
            )}
            {l.upcoming.length > 0 && <p className="mt-2 px-1 text-xs text-muted">+ {l.upcoming.length} upcoming</p>}
          </motion.section>
        );
      })}
    </div>
    </div>
  );
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function FeedView({ squad, membersById, meId, onOpen }) {
  const items = useMemo(() => {
    const taskById = Object.fromEntries(squad.tasks.map((t) => [t.id, t]));
    const out = [];
    for (const t of squad.tasks) out.push({ at: t.created_at, kind: "add", who: t.created_by, to: t.assigned_to, title: t.title, id: "a" + t.id });
    for (const d of squad.done) {
      const t = taskById[d.task_id];
      if (t && d.created_at) out.push({ at: d.created_at, kind: "done", who: d.member, title: t.title, photo: d.photo, task: t.id, day: d.day, id: "d" + d.task_id + d.day });
    }
    for (const c of squad.comments) {
      const t = taskById[c.task_id];
      if (t) out.push({ at: c.created_at, kind: "comment", who: c.member, title: t.title, body: c.body, task: t.id, id: "c" + c.id });
    }
    const chById = Object.fromEntries(squad.challenges.map((c) => [c.id, c]));
    for (const c of squad.challenges) out.push({ at: c.created_at, kind: "challenge", who: c.created_by, title: `${c.emoji} ${c.title}`, id: "ch" + c.id });
    for (const k of squad.checkins) {
      const c = chById[k.challenge_id];
      if (c && k.created_at) out.push({ at: k.created_at, kind: "checkin", who: k.member, title: `${c.emoji} ${c.title}`, id: "k" + k.challenge_id + k.member + k.day });
    }
    for (const e of squad.events) {
      const t = taskById[e.task_id];
      if (t) out.push({ at: e.created_at, kind: e.kind, who: e.from_member, to: e.to_member, title: t.title, emoji: e.data?.emoji, id: "e" + e.id });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 120);
  }, [squad.tasks, squad.done, squad.events, squad.comments, squad.challenges, squad.checkins]);

  if (!items.length) return <p className="mt-10 text-center text-muted">Nothing's happened yet. Go tick something off ✅</p>;

  const name = (id) => (id === meId ? "You" : membersById[id]?.name || "Someone");
  const toName = (id) => (id === meId ? "you" : membersById[id]?.name || "someone");
  let lastDay = null;
  return (
    <ul className="mt-4">
      {items.map((it) => {
        const day = dayKey(new Date(it.at));
        const header = day !== lastDay ? (lastDay = day) : null;
        const who = membersById[it.who];
        const line = {
          add: it.to === it.who ? <>added <b>{it.title}</b></> : <>gave {toName(it.to)} <b>{it.title}</b></>,
          done: <>finished <b>{it.title}</b> {it.photo ? "📸" : "✅"}</>,
          comment: <>on <b>{it.title}</b>: “{it.body}”</>,
          challenge: <>started a challenge: <b>{it.title}</b> 🏁</>,
          checkin: <>checked in to <b>{it.title}</b></>,
          nudge: <>nudged {toName(it.to)} about <b>{it.title}</b> 👉</>,
          react: <>reacted {it.emoji} to <b>{it.title}</b></>,
        }[it.kind];
        return (
          <li key={it.id}>
            {header && (
              <h3 className="mt-5 mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
                {day === squad.today ? "Today" : day === addDays(squad.today, -1) ? "Yesterday" : parseDay(day).toDateString()}
              </h3>
            )}
            <button disabled={!it.task} onClick={() => onOpen?.(it.task, it.day || squad.today)}
              className="flex w-full items-start gap-3 rounded-2xl px-1 py-2 text-left enabled:active:bg-sunk">
              <Avatar member={who || { name: "?", color: "#999" }} size={32} />
              <span className="min-w-0 flex-1 text-sm leading-snug break-words">
                <span className="font-semibold">{name(it.who)}</span> {line}
              </span>
              {it.photo && <img src={it.photo} alt="" className="size-10 shrink-0 rounded-lg object-cover" />}
              <span className="shrink-0 text-xs text-muted">{timeAgo(it.at)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const WEEKS = 15;

function Heatmap({ member, tasks, idx, today, frozen }) {
  // columns are weeks (Sunday first), the last column is this week
  const start = addDays(today, -(WEEKS - 1) * 7 - parseDay(today).getDay());
  const n = Math.round((parseDay(today) - parseDay(start)) / 864e5) + 1;
  const days = history(tasks, idx, member.id, today, n);
  const label = (d) => (frozen?.has(member.id + "|" + d.day) ? `${d.day}: saved with a freeze 🧊` : d.total ? `${d.day}: ${d.done}/${d.total}` : `${d.day}: nothing to do`);
  return (
    <div className="flex gap-1.5">
      <div className="grid grid-rows-7 gap-[3px] pt-0 text-[9px] leading-none text-muted">
        {DAY_LETTERS.map((l, i) => <span key={i} className="grid h-3 place-items-center">{i % 2 ? l : ""}</span>)}
      </div>
      <div className="grid flex-1 grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`${member.name}'s last ${WEEKS} weeks`}>
        {days.map((d) => {
          const r = d.total ? d.done / d.total : 0;
          const iced = frozen?.has(member.id + "|" + d.day);
          const bg = iced ? "#7dd3fc" : !d.total ? "var(--heat-0)" : r === 0 ? "color-mix(in srgb, var(--heat-0), #ef4444 25%)"
            : `color-mix(in srgb, var(--heat-0), ${member.color} ${Math.round(30 + r * 70)}%)`;
          return <span key={d.day} title={label(d)} className={`aspect-square rounded-[3px] ${d.day === today ? "ring-1 ring-ink/50" : ""}`} style={{ background: bg }} />;
        })}
      </div>
    </div>
  );
}

export function StatsView({ squad, idx, meId, streaks, squadStreak, badges, banks, frozen }) {
  const [badgeInfo, setBadgeInfo] = useState(null);
  const week = weekCounts(squad.done, squad.today);
  const ranked = [...squad.members].sort((a, b) => (week[b.id] || 0) - (week[a.id] || 0));
  const top = week[ranked[0]?.id] || 0;
  return (
    <div className="mt-4 space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Squad best</p>
          <p className="mt-1 font-display text-3xl font-extrabold">🔥 {squadStreak.best}</p>
          <p className="text-xs text-muted">days in a row</p>
        </div>
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Done this week</p>
          <p className="mt-1 font-display text-3xl font-extrabold">✅ {Object.values(week).reduce((a, b) => a + b, 0)}</p>
          <p className="text-xs text-muted">ticks by everyone</p>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-card p-4">
        <h3 className="font-display text-lg font-semibold">This week's MVP</h3>
        <p className="text-xs text-muted">Tasks finished in the last 7 days</p>
        <ol className="mt-3 space-y-2">
          {ranked.map((m, i) => {
            const n = week[m.id] || 0;
            return (
              <li key={m.id} className="flex items-center gap-3">
                <span className="w-5 text-center text-sm font-bold text-muted">{i + 1}</span>
                <Avatar member={m} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{m.id === meId ? "You" : m.name}</span>
                    {i === 0 && n > 0 && <Crown className="size-4 text-amber-500" aria-label="MVP" />}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunk">
                    <div className="h-full rounded-full" style={{ width: top ? `${(n / top) * 100}%` : 0, background: m.color }} />
                  </div>
                </div>
                <span className="w-8 text-right text-sm font-bold tabular-nums">{n}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {squad.members.map((m) => (
        <section key={m.id} className="rounded-3xl border border-line bg-card p-4">
          <header className="mb-3 flex items-center gap-3">
            <Avatar member={m} size={32} emoji />
            <h3 className="flex-1 truncate font-semibold">{m.id === meId ? "You" : m.name}</h3>
            <span className="text-sm"><b>🔥 {streaks[m.id]?.current || 0}</b> <span className="text-muted">· best {streaks[m.id]?.best || 0}</span></span>
          </header>
          <Heatmap member={m} tasks={squad.tasks} idx={idx} today={squad.today} frozen={frozen} />
          <p className="mt-3 text-xs text-muted">
            🧊 {banks[m.id]?.available || 0}/{FREEZE_MAX} freezes
            {(banks[m.id]?.available || 0) < FREEZE_MAX && ` · next in ${banks[m.id]?.nextIn ?? 7} good days`}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BADGES.map((b) => {
              const got = badges[m.id]?.has(b.id);
              return (
                <button key={b.id} onClick={() => setBadgeInfo({ ...b, got, who: m.id === meId ? "You" : m.name })}
                  aria-label={`${b.name}: ${b.desc}${got ? " (earned)" : " (not yet)"}`}
                  className={`grid size-9 place-items-center rounded-xl text-lg transition active:scale-90 ${got ? "bg-amber-400/15" : "bg-sunk opacity-35 grayscale"}`}>
                  {b.emoji}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <AnimatePresence>
        {badgeInfo && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-4 bottom-28 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-xl"
            onClick={() => setBadgeInfo(null)} role="status">
            <span className={`text-4xl ${badgeInfo.got ? "" : "grayscale"}`}>{badgeInfo.emoji}</span>
            <div className="text-sm">
              <p className="font-bold">{badgeInfo.name}</p>
              <p className="text-muted">{badgeInfo.desc}. {badgeInfo.got ? `${badgeInfo.who} earned it 🎉` : "Not yet."}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="px-2 text-center text-xs text-muted">
        Earn a 🧊 freeze for every 7 days you hit half (hold up to {FREEZE_MAX}); use one to save a missed day.
        A streak day = at least half of that day's tasks done. The squad streak needs everyone who had tasks to hit half.
      </p>
    </div>
  );
}
