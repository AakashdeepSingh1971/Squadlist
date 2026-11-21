import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApi, isDemo } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import { dayKey } from "../lib/days.js";
import { store } from "../lib/identity.js";
import { addUsage, wireBytes, setUsageContext, startUsage } from "../lib/usage.js";
import { notify } from "../lib/push.js";

/*
 * Everything about one room, kept live.
 * Changes are saved through the api, applied here straight away, and sent to
 * everyone else in the room over a broadcast channel (Supabase realtime, or a
 * BroadcastChannel between tabs in demo mode). Coming back to the app or
 * reconnecting reloads the whole room, so nothing is missed while away.
 */

const EMPTY = { members: [], tasks: [], done: [], events: [], comments: [], freezes: [], challenges: [], checkins: [] };
const without = (list, pred) => list.filter((x) => !pred(x));

function applyChange(state, { type, data }) {
  switch (type) {
    case "member": {
      const others = state.members.filter((m) => m.id !== data.id);
      return { ...state, members: [...others, data].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
    }
    case "task": {
      const others = state.tasks.filter((t) => t.id !== data.id);
      return { ...state, tasks: [...others, data] };
    }
    case "task-del": {
      if (data.repeat?.length) return applyChange(state, { type: "task", data });
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== data.id),
        done: state.done.filter((d) => d.task_id !== data.id),
        events: state.events.filter((e) => e.task_id !== data.id),
        comments: state.comments.filter((c) => c.task_id !== data.id),
      };
    }
    case "done": {
      const rest = state.done.filter((d) => !(d.task_id === data.task_id && d.day === data.day));
      if (!data.done) return { ...state, done: rest };
      const { done: _on, ...row } = data;
      return { ...state, done: [...rest, { photo: null, ...row, created_at: data.created_at || new Date().toISOString() }] };
    }
    case "photo":
      return { ...state, done: state.done.map((d) => (d.task_id === data.task_id && d.day === data.day
        ? { ...d, photo: data.photo, photo_bytes: data.photo_bytes } : d)) };
    case "comment":
      return { ...state, comments: [...without(state.comments, (c) => c.id === data.id), data] };
    case "comment-del":
      return { ...state, comments: without(state.comments, (c) => c.id === data.id) };
    case "freeze":
      return { ...state, freezes: [...without(state.freezes, (f) => f.member === data.member && f.day === data.day), data] };
    case "challenge":
      return { ...state, challenges: [...without(state.challenges, (c) => c.id === data.id), data] };
    case "challenge-del":
      return { ...state, challenges: without(state.challenges, (c) => c.id === data.id),
        checkins: without(state.checkins, (k) => k.challenge_id === data.id) };
    case "checkin": {
      const rest = without(state.checkins, (k) => k.challenge_id === data.challenge_id && k.member === data.member && k.day === data.day);
      return { ...state, checkins: data.on ? [...rest, { ...data, created_at: data.created_at || new Date().toISOString() }] : rest };
    }
    case "event": {
      let events = state.events;
      if (data.kind === "react") {
        events = events.filter((e) => !(e.kind === "react" && e.task_id === data.task_id &&
          e.from_member === data.from_member && e.data?.day === data.data?.day));
        if (!data.data?.emoji) return { ...state, events };
      }
      return { ...state, events: [...events.filter((e) => e.id !== data.id), data] };
    }
    default:
      return state;
  }
}

function makeBus(room, onMessage, onPresence, onStatus) {
  if (isDemo) {
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("sl:" + room) : null;
    if (bc) bc.onmessage = (e) => onMessage(e.data);
    onStatus("live");
    return { send: (msg) => bc?.postMessage(msg), track: () => {}, close: () => bc?.close() };
  }
  const ch = supabase.channel("squad:" + room, { config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } } });
  ch.on("broadcast", { event: "change" }, ({ payload }) => {
    addUsage("msgs", 1);
    addUsage("sync", wireBytes(payload));
    onMessage(payload);
  });
  ch.on("presence", { event: "sync" }, () => {
    const ids = new Set(Object.values(ch.presenceState()).flat().map((m) => m.member).filter(Boolean));
    onPresence(ids);
  });
  let meta = null, closed = false, down = false;
  ch.subscribe((s) => {
    if (closed) return;
    if (s === "SUBSCRIBED") { onStatus("live"); if (meta) ch.track(meta); }
    else if ((s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") && !down) { down = true; onStatus("offline"); }
  });
  return {
    send: (msg) => {
      addUsage("msgs", 1);
      addUsage("sync", wireBytes(msg));
      return ch.send({ type: "broadcast", event: "change", payload: msg });
    },
    track: (m) => { meta = m; if (ch.state === "joined") ch.track(m).catch(() => {}); },
    close: () => { closed = true; supabase.removeChannel(ch); },
  };
}

export function useSquad(room, meId, { onRemote } = {}) {
  const api = useMemo(() => createApi(room), [room]);
  const cacheKey = "sl.cache:" + room;
  const [state, setState] = useState(() => ({ ...EMPTY, ...(store.get(cacheKey) || {}) }));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [online, setOnline] = useState(() => new Set());
  const [epoch, setEpoch] = useState(0);
  const [today, setToday] = useState(dayKey);
  const bus = useRef(null);
  const retries = useRef(0);
  const remote = useRef(onRemote);
  remote.current = onRemote;

  const reload = useCallback(async () => {
    try {
      const data = await api.load();
      setState({ ...EMPTY, ...data });
      setLoaded(true);
      setError(null);
    } catch (e) {
      setError(e.message);
      setLoaded(true);
    }
  }, [api]);

  // keep a copy so the room opens instantly (and offline) next time
  useEffect(() => { if (loaded) store.set(cacheKey, state); }, [state, loaded, cacheKey]);

  useEffect(() => {
    reload();
    const b = makeBus(
      room,
      (msg) => {
        if (msg?.type === "reload") { reload(); return; }
        setState((s) => applyChange(s, msg));
        remote.current?.(msg);
      },
      setOnline,
      (s) => {
        setStatus(s);
        if (s === "live") retries.current = 0;
        if (s === "offline") setTimeout(() => setEpoch((e) => e + 1), Math.min(15000, 1000 * 2 ** retries.current++));
      }
    );
    bus.current = b;
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      setToday(dayKey());
      reload();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    // the day changes at midnight even if nobody touches the app
    const tick = setInterval(() => setToday(dayKey()), 60000);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      clearInterval(tick);
      b.close();
      if (bus.current === b) bus.current = null;
    };
  }, [room, reload, epoch]);

  useEffect(() => { if (meId) bus.current?.track({ member: meId }); }, [meId, status]);

  const publish = useCallback((msg) => {
    setState((s) => applyChange(s, msg));
    bus.current?.send(msg);
  }, []);

  const actions = useMemo(() => ({
    async join(profile) {
      const m = { ...(await api.join(profile)), claimed: true };
      publish({ type: "member", data: m });
      return m;
    },
    // become this person on this phone (see sl_claim)
    async claim(id) {
      const m = { ...(await api.claim(id)), claimed: true };
      publish({ type: "member", data: m });
      return m;
    },
    async updateMember(profile) {
      const m = await api.updateMember(profile);
      if (m) publish({ type: "member", data: { ...m, claimed: true } });
    },
    async addTasks({ title, to, repeat, due, needsProof }) {
      const day = dayKey();
      for (const person of to) {
        const t = await api.addTask({ title, by: meId, to: person, repeat, due, today: day, needsProof });
        publish({ type: "task", data: t });
        if (person !== meId) notify({ type: "task", room, id: t.id });
      }
    },
    async removeTask(task) {
      const t = await api.removeTask({ id: task.id, by: meId, today: dayKey() });
      if (t) publish({ type: "task-del", data: t });
    },
    // rename / move a pending task (only whoever added it)
    async editTask(task, { title, due }, day) {
      const t = await api.editTask({ id: task.id, by: meId, title, due, day });
      publish({ type: "task", data: t });
    },
    async setNeedsProof(task, on) {
      const t = await api.setNeedsProof({ id: task.id, by: meId, on });
      publish({ type: "task", data: t });
    },
    async setDone(task, day, done, photo) {
      const msg = { type: "done", data: { task_id: task.id, member: meId, day, done, ...(photo || {}) } };
      publish(msg); // feels instant; undone if saving fails
      try {
        await api.setDone({ task: task.id, member: meId, day, done });
        if (done && photo) await api.setPhoto({ task: task.id, member: meId, day, photo: photo.photo, bytes: photo.photo_bytes });
        // tell whoever gave you this task (the server checks it's really done, once a day per task)
        if (done && task.created_by !== meId) notify({ type: "done", room, id: task.id });
      } catch (e) {
        publish({ type: "done", data: { ...msg.data, done: !done } });
        throw e;
      }
    },
    async setPhoto(task, day, photo) {
      await api.setPhoto({ task: task.id, member: meId, day, photo: photo?.photo || null, bytes: photo?.photo_bytes || 0 });
      publish({ type: "photo", data: { task_id: task.id, day, photo: photo?.photo || null, photo_bytes: photo?.photo_bytes || 0 } });
    },
    async nudge(task) {
      const e = await api.addEvent({ kind: "nudge", task: task.id, from: meId, to: task.assigned_to, data: {} });
      if (e) { publish({ type: "event", data: e }); notify({ type: "nudge", room, id: e.id }); }
    },
    async react(task, day, emoji) {
      const data = { day, emoji };
      const e = await api.addEvent({ kind: "react", task: task.id, from: meId, to: task.assigned_to, data });
      publish({ type: "event", data: e || { kind: "react", task_id: task.id, from_member: meId, data: { day, emoji: "" } } });
    },
    async comment(task, body) {
      const c = await api.addComment({ task: task.id, member: meId, body });
      publish({ type: "comment", data: c });
      notify({ type: "comment", room, id: c.id }); // the server skips you and works out who else cares
    },
    async deleteComment(c) {
      await api.deleteComment({ id: c.id, member: meId });
      publish({ type: "comment-del", data: { id: c.id } });
    },
    async useFreeze(day) {
      await api.useFreeze({ member: meId, day });
      publish({ type: "freeze", data: { member: meId, day } });
    },
    async addChallenge(ch) {
      const c = await api.addChallenge({ ...ch, by: meId });
      publish({ type: "challenge", data: c });
    },
    async removeChallenge(c) {
      await api.removeChallenge({ id: c.id, by: meId });
      publish({ type: "challenge-del", data: { id: c.id } });
    },
    async checkin(c, day, on) {
      const msg = { type: "checkin", data: { challenge_id: c.id, member: meId, day, on } };
      publish(msg);
      try { await api.checkin({ challenge: c.id, member: meId, day, on }); }
      catch (e) { publish({ type: "checkin", data: { ...msg.data, on: !on } }); throw e; }
    },
  }), [api, meId, publish, room]);

  // the admin page's data counter: which room and name this phone is
  useEffect(() => { startUsage(); }, []);
  useEffect(() => {
    setUsageContext({ room, name: state.members.find((m) => m.id === meId)?.name || "" });
  }, [room, meId, state.members]);

  return { ...state, loaded, error, status, online, today, actions, reload };
}
