import { supabase, isConfigured } from "./supabase.js";
import { addUsage, wireBytes } from "./usage.js";

/*
 * One room's data. Two backends with the same shape:
 * - Supabase (when .env has keys): the functions in supabase/schema.sql
 * - Demo: saved in this browser, so you can try it with no setup
 */

const uuid = () => crypto.randomUUID?.() ?? ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g,
  (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  addUsage("calls", 1);
  addUsage("api", wireBytes(args, 400) + wireBytes(data, 300)); // request + response, with headers
  if (error) throw new Error(error.message);
  return data;
}

function supabaseApi(room) {
  return {
    load: () => rpc("sl_load", { p_room: room }),
    join: ({ name, emoji, color }) => rpc("sl_join", { p_room: room, p_name: name, p_emoji: emoji, p_color: color }),
    updateMember: ({ id, name, emoji, color }) =>
      rpc("sl_update_member", { p_room: room, p_id: id, p_name: name, p_emoji: emoji, p_color: color }),
    addTask: ({ title, by, to, repeat, due, today, needsProof }) =>
      rpc("sl_add_task", { p_room: room, p_title: title, p_by: by, p_to: to, p_repeat: repeat, p_due: due, p_today: today, p_needs_proof: !!needsProof }),
    removeTask: ({ id, by, today }) => rpc("sl_remove_task", { p_room: room, p_id: id, p_by: by, p_today: today }),
    setNeedsProof: ({ id, by, on }) => rpc("sl_set_needs_proof", { p_room: room, p_id: id, p_by: by, p_on: on }),
    setDone: ({ task, member, day, done }) =>
      rpc("sl_set_done", { p_room: room, p_task: task, p_member: member, p_day: day, p_done: done }),
    setPhoto: ({ task, member, day, photo, bytes }) =>
      rpc("sl_set_photo", { p_room: room, p_task: task, p_member: member, p_day: day, p_photo: photo, p_bytes: bytes }),
    addEvent: ({ kind, task, from, to, data }) =>
      rpc("sl_add_event", { p_room: room, p_kind: kind, p_task: task, p_from: from, p_to: to, p_data: data }),
    addComment: ({ task, member, body }) => rpc("sl_add_comment", { p_room: room, p_task: task, p_member: member, p_body: body }),
    deleteComment: ({ id, member }) => rpc("sl_delete_comment", { p_room: room, p_id: id, p_member: member }),
    useFreeze: ({ member, day }) => rpc("sl_use_freeze", { p_room: room, p_member: member, p_day: day }),
    addChallenge: ({ by, title, emoji, goal, ends }) =>
      rpc("sl_add_challenge", { p_room: room, p_by: by, p_title: title, p_emoji: emoji, p_goal: goal, p_ends: ends }),
    removeChallenge: ({ id, by }) => rpc("sl_remove_challenge", { p_room: room, p_id: id, p_by: by }),
    checkin: ({ challenge, member, day, on }) =>
      rpc("sl_checkin", { p_room: room, p_challenge: challenge, p_member: member, p_day: day, p_on: on }),
  };
}

const EMPTY_DB = () => ({ members: [], tasks: [], done: [], events: [], comments: [], freezes: [], challenges: [], checkins: [] });

function demoApi(room) {
  const key = "sl.demo:" + room;
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } };
  const db = () => ({ ...EMPTY_DB(), ...(read() || {}) });
  const save = (d) => {
    try { localStorage.setItem(key, JSON.stringify(d)); }
    catch { throw new Error("This browser's storage is full. Demo mode keeps everything locally; set up Supabase for real use."); }
  };
  const now = () => new Date().toISOString();
  const op = (fn) => async (args) => { const d = db(); const out = fn(d, args); save(d); return out; };
  const inRoom = (d, id) => { if (!d.members.some((m) => m.id === id)) throw new Error("not in this room"); };

  return {
    load: async () => db(),
    join: op((d, { name, emoji, color }) => {
      if (d.members.length >= 10) throw new Error("room is full");
      const m = { id: uuid(), room, name: name.trim().slice(0, 24), emoji, color, created_at: now() };
      d.members.push(m);
      return m;
    }),
    updateMember: op((d, { id, name, emoji, color }) => {
      const m = d.members.find((x) => x.id === id);
      if (m) Object.assign(m, { name: name.trim().slice(0, 24), emoji, color });
      return m;
    }),
    addTask: op((d, { title, by, to, repeat, due, today, needsProof }) => {
      const t = { id: uuid(), room, title: title.trim().slice(0, 120), created_by: by, assigned_to: to,
        repeat: repeat?.length ? repeat : null, due: due || null, created_day: today, deleted_day: null,
        needs_proof: !!needsProof, created_at: now() };
      d.tasks.push(t);
      return t;
    }),
    removeTask: op((d, { id, by, today }) => {
      const t = d.tasks.find((x) => x.id === id);
      if (!t) return null;
      if (t.created_by !== by) throw new Error("only the person who added it can remove it");
      if (!t.repeat) {
        d.tasks = d.tasks.filter((x) => x.id !== id);
        d.done = d.done.filter((x) => x.task_id !== id);
        d.events = d.events.filter((x) => x.task_id !== id);
        d.comments = d.comments.filter((x) => x.task_id !== id);
      }
      t.deleted_day = today;
      return t;
    }),
    setNeedsProof: op((d, { id, by, on }) => {
      const t = d.tasks.find((x) => x.id === id && x.created_by === by);
      if (!t) throw new Error("only the person who added it can change that");
      t.needs_proof = on;
      return t;
    }),
    setDone: op((d, { task, member, day, done }) => {
      d.done = d.done.filter((x) => !(x.task_id === task && x.day === day));
      if (done) d.done.push({ task_id: task, member, day, created_at: now(), photo: null });
    }),
    setPhoto: op((d, { task, member, day, photo, bytes }) => {
      const row = d.done.find((x) => x.task_id === task && x.day === day && x.member === member);
      if (!row) throw new Error("tick it first");
      Object.assign(row, { photo, photo_bytes: bytes });
    }),
    addEvent: op((d, { kind, task, from, to, data }) => {
      if (kind === "react") {
        d.events = d.events.filter((e) => !(e.kind === "react" && e.task_id === task && e.from_member === from && e.data?.day === data.day));
        if (!data.emoji) return null;
      }
      const e = { id: uuid(), room, kind, task_id: task, from_member: from, to_member: to, data, created_at: now() };
      d.events.push(e);
      return e;
    }),
    addComment: op((d, { task, member, body }) => {
      inRoom(d, member);
      const c = { id: uuid(), room, task_id: task, member, body: body.trim().slice(0, 500), created_at: now() };
      d.comments.push(c);
      return c;
    }),
    deleteComment: op((d, { id, member }) => { d.comments = d.comments.filter((c) => !(c.id === id && c.member === member)); }),
    useFreeze: op((d, { member, day }) => {
      if (!d.freezes.some((f) => f.member === member && f.day === day)) d.freezes.push({ member, day });
    }),
    addChallenge: op((d, { by, title, emoji, goal, ends }) => {
      inRoom(d, by);
      const c = { id: uuid(), room, title: title.trim().slice(0, 80), emoji, goal, ends: ends || null, created_by: by, created_at: now() };
      d.challenges.push(c);
      return c;
    }),
    removeChallenge: op((d, { id, by }) => {
      if (!d.challenges.some((c) => c.id === id && c.created_by === by)) throw new Error("only the person who started it can remove it");
      d.challenges = d.challenges.filter((c) => c.id !== id);
      d.checkins = d.checkins.filter((k) => k.challenge_id !== id);
    }),
    checkin: op((d, { challenge, member, day, on }) => {
      d.checkins = d.checkins.filter((k) => !(k.challenge_id === challenge && k.member === member && k.day === day));
      if (!on) return null;
      const k = { challenge_id: challenge, member, day, created_at: now() };
      d.checkins.push(k);
      return k;
    }),
  };
}

export const isDemo = !isConfigured;
export const createApi = (room) => (isConfigured ? supabaseApi(room) : demoApi(room));
