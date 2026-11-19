import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Activity, BarChart3, ListChecks, Plus, Settings, Share2, Users } from "lucide-react";
import { useSquad } from "../hooks/useSquad.js";
import { indexDone, streak, dayScore, passed, frozenSet, freezeBank, dayStatus } from "../lib/streak.js";
import { earnedBadges, BADGES } from "../lib/goals.js";
import { addDays } from "../lib/days.js";
import { store } from "../lib/identity.js";
import { pushSupported, isIOSBrowser, pushPrefs, enablePush, disablePush } from "../lib/push.js";
import { pushConfigured } from "../lib/supabase.js";
import TaskSheet from "./TaskSheet.jsx";
import { personLists } from "../lib/lists.js";
import { memberKey, myMemberId, newPhoneKey, phoneLink, recentRooms, rememberRoom, setMemberKey, setMyMemberId, shareUrl, takePhoneLink } from "../lib/identity.js";
import { setPhoneKey } from "../lib/supabase.js";
import { isDemo } from "../lib/api.js";
import { Avatar, Chip, Sheet } from "./ui.jsx";
import { ProfileForm, WhoAreYou } from "./Profile.jsx";
import { burst } from "./TaskItem.jsx";
import AddTask from "./AddTask.jsx";
import { FeedView, MineView, SquadView, StatsView } from "./Views.jsx";

const TABS = [
  { id: "mine", label: "Mine", icon: ListChecks },
  { id: "squad", label: "Squad", icon: Users },
  { id: "feed", label: "Feed", icon: Activity },
  { id: "stats", label: "Stats", icon: BarChart3 },
];

export default function Room({ code, onLeave, theme, setTheme }) {
  const linked = useRef(false); // opened with a "use me on another phone" link
  const [meId, setMeId] = useState(() => {
    const id = takePhoneLink(code);
    if (id) linked.current = true;
    return id || myMemberId(code);
  });
  setPhoneKey(memberKey(code, meId)); // every database call proves this phone is meId
  const [tab, setTab] = useState("mine");
  const [adding, setAdding] = useState(null); // member id the new task is for
  const [settings, setSettings] = useState(false);
  const [openTask, setOpenTask] = useState(null); // { id, day }
  const label = recentRooms().find((r) => r.code === code)?.label;
  const ctx = useRef({});

  // toasts for what friends do
  const onRemote = useCallback(({ type, data }) => {
    const { membersById: byId = {}, tasks = [], meId: me } = ctx.current;
    if (type === "member") { if (!byId[data.id]) toast(`${data.emoji} ${data.name} joined the squad`); return; }
    const who = byId[data.member || data.created_by || data.from_member];
    const task = tasks.find((t) => t.id === (data.task_id || data.id));
    if (!who || who.id === me) return;
    if (type === "done" && data.done && task) toast(`${who.emoji} ${who.name} finished “${task.title}”`);
    const old = tasks.find((t) => t.id === data.id);
    if (type === "task" && old && old.title !== data.title && data.assigned_to === me)
      toast(`✏️ ${who.name} edited your task`, { description: `${old.title} → ${data.title}` });
    else if (type === "task" && !old && data.assigned_to === me && data.created_by !== me)
      toast(`${who.emoji} ${who.name} gave you a task`, { description: data.title });
    if (type === "comment" && task && (task.assigned_to === me || task.created_by === me))
      toast(`💬 ${who.name} on “${task.title}”`, { description: data.body });
    if (type === "challenge") toast(`🏁 ${who.name} started a challenge`, { description: `${data.emoji} ${data.title}` });
    if (type === "event" && data.to_member === me && task) {
      if (data.kind === "nudge") { navigator.vibrate?.([30, 60, 30]); toast.warning(`👉 ${who.name} nudged you`, { description: task.title }); }
      if (data.kind === "react" && data.data?.emoji) toast(`${who.name} reacted ${data.data.emoji}`, { description: task.title });
    }
  }, []);

  const squad = useSquad(code, meId, { onRemote });
  const membersById = useMemo(() => Object.fromEntries(squad.members.map((m) => [m.id, m])), [squad.members]);
  const me = membersById[meId];
  ctx.current = { membersById, tasks: squad.tasks, meId };

  const idx = useMemo(() => indexDone(squad.done), [squad.done]);
  const ids = useMemo(() => squad.members.map((m) => m.id), [squad.members]);
  const frozen = useMemo(() => frozenSet(squad.freezes), [squad.freezes]);
  const squadStreak = useMemo(() => streak(squad.tasks, squad.done, ids, squad.today, { idx, frozen }), [squad.tasks, squad.done, ids, squad.today, idx, frozen]);
  const streaks = useMemo(() => Object.fromEntries(ids.map((id) => [id, streak(squad.tasks, squad.done, [id], squad.today, { idx, frozen })])),
    [ids, squad.tasks, squad.done, squad.today, idx, frozen]);
  const banks = useMemo(() => Object.fromEntries(ids.map((id) => [id, freezeBank(squad.tasks, idx, id, squad.today, frozen)])),
    [ids, squad.tasks, idx, squad.today, frozen]);
  const badges = useMemo(() => Object.fromEntries(ids.map((id) => [id, earnedBadges(id, {
    ...squad, streakBest: streaks[id]?.best || 0, squadBest: squadStreak.best,
  })])), [ids, squad, streaks, squadStreak.best]);
  const doneByKey = useMemo(() => new Map(squad.done.map((d) => [d.task_id + "|" + d.day, d])), [squad.done]);

  // can I save yesterday with a freeze?
  const freeze = useMemo(() => {
    const y = addDays(squad.today, -1);
    const bank = banks[meId];
    if (!bank?.available || frozen.has(meId + "|" + y)) return null;
    const s = dayScore(squad.tasks, idx, meId, y);
    if (!s.total || passed(s)) return null;
    return { canSave: true, available: bank.available, squadAtRisk: dayStatus(squad.tasks, idx, ids, y, frozen) === "miss" };
  }, [banks, meId, frozen, squad.tasks, idx, ids, squad.today]);

  // a toast for each badge you earn (not the ones you had before)
  useEffect(() => {
    if (!squad.loaded || !meId || !badges[meId]) return;
    const key = `sl.badges:${code}:${meId}`;
    const seen = store.get(key);
    const now = [...badges[meId]];
    if (seen) {
      for (const id of now) if (!seen.includes(id)) {
        const b = BADGES.find((x) => x.id === id);
        toast.success(`New badge: ${b.emoji} ${b.name}`, { description: b.desc });
      }
    }
    if (!seen || now.some((id) => !seen.includes(id))) store.set(key, now);
  }, [badges, meId, code, squad.loaded]);
  const scores = useMemo(() => Object.fromEntries(ids.map((id) => [id, dayScore(squad.tasks, idx, id, squad.today)])),
    [ids, squad.tasks, idx, squad.today]);

  // celebrate the moment the squad locks in today
  const wasOk = useRef(null);
  useEffect(() => {
    if (!squad.loaded || !me) return;
    if (wasOk.current === false && squadStreak.todayOk) {
      burst(null, me.color, true);
      toast.success(`Squad streak: ${squadStreak.current} 🔥`, { description: "Everyone hit half their tasks today. Legends." });
    }
    wasOk.current = squadStreak.todayOk;
  }, [squadStreak.todayOk, squadStreak.current, squad.loaded, me]);

  useEffect(() => { if (me) rememberRoom(code, { as: me.name }); }, [code, me?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // big confetti when this tick finishes your whole day
  const onAllDone = useCallback((taskId) => {
    const l = personLists(squad.tasks, idx, meId, squad.today);
    const left = [...l.overdue, ...l.today];
    return left.length === 1 && left[0].task.id === taskId;
  }, [squad.tasks, idx, meId, squad.today]);

  const share = async () => {
    const url = shareUrl(code);
    const text = `Join our squad on Squadlist${label && label !== "Quick room" ? ` (“${label}”)` : ""} 🔥`;
    try {
      if (navigator.share) { await navigator.share({ title: "Squadlist", text, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Send it to your friends." });
    } catch (e) {
      if (e?.name !== "AbortError") toast(url);
    }
  };

  const viewCtx = {
    membersById, meId, today: squad.today, events: squad.events, comments: squad.comments, doneByKey,
    actions: squad.actions, onAllDone, onOpen: (id, day) => setOpenTask({ id, day }), room: code,
  };
  const sheetTask = openTask && squad.tasks.find((t) => t.id === openTask.id);

  const choose = (m) => { setMyMemberId(code, m.id); setMeId(m.id); toast.success(`Hey ${m.name} ${m.emoji}`); };
  const signOut = () => { setMyMemberId(code, null); setMeId(null); };
  const onAnotherPhone = (name) => toast.error(`${name} is already set up on another phone`, {
    description: "On that phone, open Settings → Use me on another phone, and open that link here.",
  });

  // tap a name on "Who's this?": works for people not on any phone yet, or if this phone has their key
  const pick = async (m) => {
    const had = memberKey(code, m.id);
    const key = had || newPhoneKey();
    setMemberKey(code, m.id, key);
    setPhoneKey(key);
    try { await squad.actions.claim(m.id); choose(m); }
    catch (x) {
      if (!had) setMemberKey(code, m.id, null);
      setPhoneKey(memberKey(code, meId));
      if (/another phone/.test(x.message)) onAnotherPhone(m.name); else toast.error(x.message);
    }
  };
  const join = async (p) => {
    const key = newPhoneKey();
    setPhoneKey(key);
    const m = await squad.actions.join(p);
    setMemberKey(code, m.id, key);
    choose(m);
  };

  // People from before phone keys, or opened from a phone link: claim (or check) once
  const checked = useRef(null);
  useEffect(() => {
    if (!squad.loaded || !me || checked.current === meId) return;
    checked.current = meId;
    const had = memberKey(code, meId);
    if (had && !linked.current) return;
    if (!had && me.claimed) { signOut(); onAnotherPhone(me.name); return; }
    const key = had || newPhoneKey();
    setMemberKey(code, meId, key);
    setPhoneKey(key);
    squad.actions.claim(meId)
      .then(() => { if (linked.current) toast.success(`This phone is ${me.name} now ${me.emoji}`); })
      .catch((x) => {
        setMemberKey(code, meId, null);
        signOut();
        if (/another phone/.test(x.message)) onAnotherPhone(me.name); else toast.error(x.message);
      })
      .finally(() => { linked.current = false; });
  }, [squad.loaded, me, meId, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkPhone = async () => {
    const url = phoneLink(code, meId, memberKey(code, meId));
    try {
      if (navigator.share) { await navigator.share({ title: `Squadlist: ${me.name}`, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Open it on your other phone. Don't send it to friends: it lets them be you." });
    } catch (e) { if (e?.name !== "AbortError") toast(url); }
  };

  if (!squad.loaded && !squad.members.length) {
    return <div className="grid min-h-dvh place-items-center text-muted"><span className="animate-pulse text-4xl">✅</span></div>;
  }
  if (squad.error && !squad.members.length) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20 text-center">
        <div className="text-5xl">😵</div>
        <h1 className="mt-3 font-display text-2xl font-bold">Couldn't open the room</h1>
        <p className="mt-2 text-sm text-muted">{squad.error}</p>
        <p className="mt-2 text-sm text-muted">If this is a new Supabase project, run <code>supabase/schema.sql</code> first.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={squad.reload} className="h-11 rounded-full bg-accent px-5 font-semibold text-accent-ink">Try again</button>
          <button onClick={onLeave} className="h-11 rounded-full bg-sunk px-5 font-semibold">Back</button>
        </div>
      </div>
    );
  }
  if (!me) {
    if (!squad.loaded) return <div className="grid min-h-dvh place-items-center text-muted"><span className="animate-pulse text-4xl">✅</span></div>;
    return (
      <WhoAreYou members={squad.members} label={label} onPick={pick} onLeave={onLeave} onJoin={join}
        onThisPhone={(id) => !!memberKey(code, id)} />
    );
  }

  const others = squad.members.filter((m) => m.id !== meId);
  const atHalf = ids.filter((id) => passed(scores[id])).length;
  const withTasks = ids.filter((id) => scores[id].total).length;

  return (
    <div className="min-h-dvh pt-safe">
      <div className="mx-auto max-w-md px-4 pb-32">
        <header className="flex items-center gap-2 pt-4">
          <button onClick={onLeave} className="min-w-0 flex-1 text-left" aria-label="Back to rooms">
            <p className="text-xs font-semibold text-muted">
              <span className={`mr-1.5 inline-block size-2 rounded-full ${squad.status === "live" ? "bg-good" : "animate-pulse bg-amber-400"}`} />
              {isDemo ? "Demo room" : squad.status === "live" ? `${squad.online.size || 1} here now` : "Reconnecting…"}
            </p>
            <h1 className="truncate font-display text-2xl font-extrabold tracking-tight">{label || "Squad"}</h1>
          </button>
          <button onClick={share} aria-label="Invite friends" className="grid size-10 place-items-center rounded-full bg-card text-ink shadow-sm ring-1 ring-line">
            <Share2 className="size-4.5" />
          </button>
          <button onClick={() => setSettings(true)} aria-label="Settings" className="rounded-full">
            <Avatar member={me} size={40} emoji />
          </button>
        </header>

        {/* squad streak */}
        <motion.section layout className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff8a3d] to-[#f2512d] p-5 text-white shadow-lg shadow-accent/25">
          <div className="flex items-center gap-4">
            <div className={`text-5xl ${squadStreak.current ? "flame-live" : "grayscale"}`} aria-hidden>🔥</div>
            <div className="flex-1">
              <p className="font-display text-4xl leading-none font-extrabold">{squadStreak.current}<span className="ml-1.5 text-lg font-semibold opacity-90">day{squadStreak.current === 1 ? "" : "s"}</span></p>
              <p className="mt-1 text-sm font-medium opacity-90">Squad streak</p>
            </div>
            <div className="text-right text-xs font-semibold opacity-90">
              {banks[meId]?.available > 0 && <p className="mb-1" title="Your streak freezes">🧊 ×{banks[meId].available}</p>}
              {squadStreak.todayOk ? "Locked in today ✓" : withTasks ? `${atHalf}/${withTasks} at half` : "No tasks today"}
            </div>
          </div>
          <div className="no-scrollbar mt-4 -mx-1 flex gap-3 overflow-x-auto px-1 py-1">
            {squad.members.map((m) => {
              const s = scores[m.id];
              return (
                <div key={m.id} className="flex w-12 shrink-0 flex-col items-center gap-1">
                  <div className="rounded-full bg-white/20 p-[3px]">
                    <Avatar member={m} size={36} ring={s.total ? s.done / s.total : 0} online={m.id === meId || isDemo ? undefined : squad.online.has(m.id)} />
                  </div>
                  <span className="w-full truncate text-center text-[11px] font-semibold">{m.id === meId ? "You" : m.name}</span>
                  <span className="text-[10px] opacity-85">{s.total ? `${s.done}/${s.total}` : "–"}{passed(s) ? " ✓" : ""}</span>
                </div>
              );
            })}
          </div>
          {!squadStreak.todayOk && withTasks > 0 && (
            <p className="mt-2 text-xs opacity-90">Everyone with tasks needs half of them done today to keep it going.</p>
          )}
        </motion.section>

        <main>
          {tab === "mine" && <MineView squad={squad} idx={idx} ctx={viewCtx} onAdd={setAdding} freeze={freeze} />}
          {tab === "squad" && <SquadView squad={squad} idx={idx} ctx={viewCtx} streaks={streaks} onAdd={setAdding} onShare={share} />}
          {tab === "feed" && <FeedView squad={squad} membersById={membersById} meId={meId} onOpen={viewCtx.onOpen} />}
          {tab === "stats" && <StatsView squad={squad} idx={idx} meId={meId} streaks={streaks} squadStreak={squadStreak}
            badges={badges} banks={banks} frozen={frozen} />}
        </main>
      </div>

      {/* bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/90 backdrop-blur-lg pb-safe">
        <div className="relative mx-auto flex max-w-md items-center px-2 pt-1.5">
          {TABS.map((t, i) => (
            <button key={t.id} onClick={() => { setTab(t.id); scrollTo({ top: 0, behavior: "smooth" }); }} aria-current={tab === t.id ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-semibold transition ${tab === t.id ? "text-accent" : "text-muted"} ${i === 2 ? "ml-16" : ""}`}>
              <t.icon className="size-5" strokeWidth={tab === t.id ? 2.5 : 2} />
              {t.label}
            </button>
          ))}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setAdding(tab === "squad" && others[0] ? others[0].id : meId)}
            aria-label="Add a task"
            className="absolute -top-6 left-1/2 grid size-15 -translate-x-1/2 place-items-center rounded-full bg-accent text-accent-ink shadow-xl shadow-accent/40 ring-4 ring-bg">
            <Plus className="size-7" strokeWidth={2.75} />
          </motion.button>
        </div>
      </nav>

      <AddTask open={!!adding} onClose={() => setAdding(null)} members={squad.members} meId={meId} forWho={adding}
        today={squad.today} onAdd={squad.actions.addTasks} />

      <TaskSheet open={!!sheetTask} onClose={() => setOpenTask(null)} task={sheetTask} day={openTask?.day} ctx={viewCtx} />

      <Sheet open={settings} onClose={() => setSettings(false)} title="You & settings">
        <ProfileForm initialValue={me} members={squad.members} submitLabel="Save"
          onSubmit={async (p) => { await squad.actions.updateMember({ ...p, id: meId }); toast.success("Saved"); setSettings(false); }} />
        <Notifications code={code} meId={meId} />
        <p className="mt-6 mb-2 text-sm font-semibold">Theme</p>
        <div className="flex gap-2">
          {[["system", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => (
            <Chip key={k} active={theme === k} onClick={() => setTheme(k)}>{l}</Chip>
          ))}
        </div>
        <div className="mt-6 grid gap-2">
          <button onClick={share} className="h-11 rounded-2xl bg-sunk font-semibold">Invite friends ({squad.members.length}/10)</button>
          <button onClick={linkPhone} className="h-11 rounded-2xl bg-sunk font-semibold">Use me on another phone</button>
          <button onClick={() => { signOut(); setSettings(false); }} className="h-11 rounded-2xl bg-sunk font-semibold">
            Not {me.name}? Switch person
          </button>
          <button onClick={onLeave} className="h-11 rounded-2xl font-semibold text-muted">Back to all rooms</button>
        </div>
      </Sheet>
    </div>
  );
}

function Notifications({ code, meId }) {
  const [prefs, setPrefs] = useState(() => pushPrefs(code));
  const [busy, setBusy] = useState(false);
  if (!pushConfigured) return null;

  const save = async (next) => {
    setBusy(true);
    try {
      if (next.on) await enablePush(code, meId, next.hour);
      else await disablePush(code);
      setPrefs(next);
      toast.success(next.on ? "Notifications on 🔔" : "Notifications off");
    } catch (x) { toast.error(x.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-6 rounded-2xl bg-sunk p-4">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm"><b>Notifications</b><br />
          <span className="text-muted">Nudges, new tasks and comments from your squad</span></span>
        <input type="checkbox" checked={prefs.on} disabled={busy || !pushSupported()} className="size-5 accent-[var(--accent)]"
          onChange={(e) => save({ ...prefs, on: e.target.checked })} />
      </label>
      {prefs.on && (
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>Daily reminder if tasks are left</span>
          <select value={prefs.hour ?? ""} disabled={busy} className="h-9 rounded-full bg-card px-3 font-semibold"
            onChange={(e) => save({ on: true, hour: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">Off</option>
            {[7, 8, 9, 12, 17, 18, 19, 20, 21, 22, 23].map((h) => (
              <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })}</option>
            ))}
          </select>
        </label>
      )}
      {!pushSupported() && (
        <p className="mt-2 text-xs text-muted">
          {isIOSBrowser() ? "On iPhone: Share → Add to Home Screen, then open Squadlist from there to turn these on." : "This browser can't show notifications."}
        </p>
      )}
    </div>
  );
}
