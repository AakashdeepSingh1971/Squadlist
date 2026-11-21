import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Camera, Pencil, Send, Trash2, X } from "lucide-react";
import { Avatar, ByChip, Sheet } from "./ui.jsx";
import { dueLabel, repeatLabel } from "../lib/days.js";
import { pickPhoto, uploadProof } from "../lib/photo.js";
import { countPhotoView } from "../lib/usage.js";
import { tickWithPhoto } from "./TaskItem.jsx";

const when = (iso) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
};

export default function TaskSheet({ open, onClose, task, day, ctx }) {
  const { membersById, meId, today, comments, doneByKey, actions, room } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [edit, setEdit] = useState(null); // { title, due } while editing
  const endRef = useRef(null);
  const thread = task ? comments.filter((c) => c.task_id === task.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];

  useEffect(() => { if (open) { setText(""); setEdit(null); } }, [open, task?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [thread.length]);

  if (!task) return <Sheet open={false} onClose={onClose} />;
  const owner = membersById[task.assigned_to];
  const adder = membersById[task.created_by];
  const mine = task.assigned_to === meId;
  const row = doneByKey.get(task.id + "|" + day) || (!task.repeat ? [...doneByKey.values()].find((d) => d.task_id === task.id) : null);
  const done = !!row;
  // only whoever added it, and only while it's pending (repeating: not done on this day)
  const canEdit = task.created_by === meId && !done && !task.deleted_day;

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!edit.title.trim() || busy) return;
    setBusy(true);
    try { await actions.editTask(task, edit, day); setEdit(null); toast.success("Task updated"); }
    catch (x) { toast.error("Couldn't save", { description: x.message }); }
    finally { setBusy(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await actions.comment(task, text.trim()); setText(""); }
    catch (x) { toast.error("Couldn't send", { description: x.message }); }
    finally { setBusy(false); }
  };

  const addPhoto = async () => {
    if (!done) { await tickWithPhoto(task, today, actions, room); return; }
    const file = await pickPhoto();
    if (!file) return;
    const id = toast.loading("Uploading…");
    try {
      const { url, bytes } = await uploadProof(room, file);
      await actions.setPhoto(task, row.day, { photo: url, photo_bytes: bytes });
      toast.success("Proof added 📸", { id });
    } catch (x) { toast.error("Couldn't upload", { id, description: x.message }); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={done ? "Done ✅" : "Task"}
      footer={
        <form onSubmit={send} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} aria-label="Write a comment"
            placeholder={mine ? "Say something…" : `Hype ${owner?.name} up (or roast them)…`}
            className="h-11 min-w-0 flex-1 rounded-full bg-sunk px-4 outline-none placeholder:text-muted/70" />
          <button disabled={!text.trim() || busy} aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
            <Send className="size-4.5" />
          </button>
        </form>
      }>
      {edit ? (
        <form onSubmit={saveEdit} className="rounded-2xl bg-sunk p-3">
          <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={120} autoFocus
            aria-label="Task name" className="h-11 w-full rounded-xl bg-card px-3 font-semibold outline-none" />
          {!task.repeat && (
            <label className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">Due</span>
              <input type="date" value={edit.due || ""} min={today} onChange={(e) => setEdit({ ...edit, due: e.target.value })}
                className="h-9 rounded-full bg-card px-3 font-semibold" />
            </label>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEdit(null)} className="h-9 rounded-full px-4 text-sm font-semibold text-muted">Cancel</button>
            <button disabled={!edit.title.trim() || busy} className="h-9 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-40">Save</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-display text-2xl leading-tight font-semibold break-words">{task.title}</h3>
          {canEdit && (
            <button onClick={() => setEdit({ title: task.title, due: task.due })} aria-label="Edit task"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk text-muted"><Pencil className="size-4" /></button>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <Avatar member={owner} size={18} /> For {mine ? "you" : owner?.name}
        </span>
        {task.created_by !== task.assigned_to && <ByChip member={adder} />}
        {task.repeat && <span>· {repeatLabel(task.repeat)}</span>}
        {task.due && !task.repeat && <span>· Due {dueLabel(task.due, today)}</span>}
      </div>

      {row?.photo ? (
        <div className="relative mt-4">
          <button onClick={() => setZoom(true)} className="block w-full" aria-label="See the photo bigger">
            <img src={row.photo} alt={`Proof for ${task.title}`} onLoad={() => countPhotoView(row.photo, row.photo_bytes)}
              className="max-h-72 w-full rounded-2xl object-cover" />
          </button>
          {mine && (
            <div className="absolute right-2 bottom-2 flex gap-1.5">
              <button onClick={addPhoto} className="h-8 rounded-full bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur">Replace</button>
              <button onClick={() => actions.setPhoto(task, row.day, null).catch((x) => toast.error(x.message))} aria-label="Remove photo"
                className="grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur"><Trash2 className="size-3.5" /></button>
            </div>
          )}
        </div>
      ) : mine ? (
        <button onClick={addPhoto} className="mt-4 flex h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-muted">
          <Camera className="size-5" />
          {done ? "Add photo proof" : task.needs_proof ? "Add a photo to tick it off" : "Tick it off with a photo"}
        </button>
      ) : task.needs_proof && !done ? (
        <p className="mt-4 rounded-2xl bg-sunk p-3 text-sm">📸 {owner?.name} needs to send a photo to tick this off.</p>
      ) : null}

      {task.created_by === meId && task.assigned_to !== meId && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-sunk p-3">
          <span className="text-sm"><b>Ask for photo proof</b><br /><span className="text-muted">{owner?.name} can only tick it with a photo</span></span>
          <input type="checkbox" checked={!!task.needs_proof} className="size-5 accent-[var(--accent)]"
            onChange={(e) => actions.setNeedsProof(task, e.target.checked).catch((x) => toast.error(x.message))} />
        </label>
      )}

      <h4 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide text-muted">Comments {thread.length ? `(${thread.length})` : ""}</h4>
      {thread.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
      <ul className="space-y-3">
        {thread.map((c) => {
          const who = membersById[c.member];
          const me = c.member === meId;
          return (
            <li key={c.id} className={`flex items-end gap-2 ${me ? "flex-row-reverse" : ""}`}>
              <Avatar member={who || { name: "?", color: "#999" }} size={26} />
              <div className={`group max-w-[78%] rounded-2xl px-3 py-2 text-sm ${me ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-sunk"}`}>
                {!me && <p className="text-xs font-bold" style={{ color: who?.color }}>{who?.name}</p>}
                <p className="break-words whitespace-pre-wrap">{c.body}</p>
                <p className={`mt-0.5 text-[10px] ${me ? "opacity-75" : "text-muted"}`}>
                  {when(c.created_at)}
                  {me && (
                    <button onClick={() => actions.deleteComment(c).catch((x) => toast.error(x.message))} className="ml-2 underline">delete</button>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} />

      {zoom && row?.photo && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" onClick={() => setZoom(false)} role="dialog" aria-label="Photo">
          <img src={row.photo} alt={`Proof for ${task.title}`} className="max-h-full max-w-full rounded-xl" />
          <button aria-label="Close" className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/15 text-white"><X /></button>
        </div>,
        document.body
      )}
    </Sheet>
  );
}
