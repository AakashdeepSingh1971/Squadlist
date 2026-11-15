import { useRef, useState } from "react";
import { AnimatePresence, motion, Reorder, useAnimation, useDragControls } from "motion/react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Camera, Check, GripVertical, Hand, MessageCircle, Repeat, SmilePlus, Trash2, CalendarDays } from "lucide-react";
import { ByChip } from "./ui.jsx";
import { dueLabel, repeatLabel, dayKey } from "../lib/days.js";
import { REACTIONS } from "../lib/people.js";
import { pickPhoto, uploadProof } from "../lib/photo.js";
import { countPhotoView } from "../lib/usage.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function burst(el, color, big = false) {
  if (reduceMotion()) return;
  const r = el?.getBoundingClientRect();
  const origin = r ? { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight } : { x: 0.5, y: 0.6 };
  confetti({
    particleCount: big ? 140 : 40, spread: big ? 100 : 60, startVelocity: big ? 45 : 28,
    origin, colors: [color, "#ffd166", "#f2612d", "#22a06b"], scalar: 0.9, ticks: 120, disableForReducedMotion: true,
  });
}

/** take a photo, upload it, and tick the task with it */
export async function tickWithPhoto(task, today, actions, room) {
  const file = await pickPhoto();
  if (!file) return false;
  const id = toast.loading("Uploading your proof…");
  try {
    const { url, bytes } = await uploadProof(room, file);
    await actions.setDone(task, today, true, { photo: url, photo_bytes: bytes });
    toast.success("Done, with receipts 📸", { id });
    return true;
  } catch (e) {
    toast.error("Couldn't upload the photo", { id, description: e.message });
    return false;
  }
}

export default function TaskItem({ entry, ctx, index = 0, reorder = false }) {
  const { membersById, meId, today, events, comments, doneByKey, actions, onAllDone, onOpen, room } = ctx;
  const { task, day, done } = entry;
  const mine = task.assigned_to === meId;
  const owner = membersById[task.assigned_to];
  const adder = membersById[task.created_by];
  const canDelete = task.created_by === meId;
  const row = done ? doneByKey.get(task.id + "|" + day) : null;
  const checkRef = useRef(null);
  const swipe = useAnimation();
  const controls = useDragControls();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picker, setPicker] = useState(false);
  const overdue = !done && !task.repeat && task.due && task.due < today;
  const nComments = comments.filter((c) => c.task_id === task.id).length;

  const reacts = events.filter((e) => e.kind === "react" && e.task_id === task.id && e.data?.day === day && e.data?.emoji);
  const myReact = reacts.find((e) => e.from_member === meId)?.data.emoji;
  const grouped = Object.entries(reacts.reduce((acc, e) => {
    (acc[e.data.emoji] ||= []).push(membersById[e.from_member]?.name || "someone");
    return acc;
  }, {}));
  const nudgedToday = events.some((e) => e.kind === "nudge" && e.task_id === task.id && e.from_member === meId &&
    dayKey(new Date(e.created_at)) === today);

  const toggle = async () => {
    if (!mine) return;
    const next = !done;
    if (next && task.needs_proof) {
      if (await tickWithPhoto(task, today, actions, room)) burst(checkRef.current, owner?.color || "#f2612d", onAllDone?.(task.id));
      return;
    }
    if (next) {
      navigator.vibrate?.(15);
      burst(checkRef.current, owner?.color || "#f2612d", onAllDone?.(task.id));
    }
    try { await actions.setDone(task, next ? today : day, next); }
    catch (e) { toast.error("Couldn't save that tick", { description: e.message }); }
  };

  const remove = async () => {
    try { await actions.removeTask(task); toast("Task removed"); }
    catch (e) { toast.error(e.message); swipe.start({ x: 0 }); setOpen(false); }
  };

  const nudge = async () => {
    try { await actions.nudge(task); toast.success(`Nudged ${owner?.name} 👉`); }
    catch (e) { toast.error(e.message); }
  };

  const react = async (emoji) => {
    setPicker(false);
    try { await actions.react(task, day, emoji === myReact ? "" : emoji); }
    catch (e) { toast.error(e.message); }
  };

  const Outer = reorder ? Reorder.Item : motion.li;
  const outerProps = reorder ? { value: task.id, dragListener: false, dragControls: controls } : {};

  return (
    <Outer {...outerProps} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.2) }} className="relative">
      {canDelete && (open || dragging) && (
        <button onClick={remove} aria-label={`Remove ${task.title}`} tabIndex={open ? 0 : -1}
          className="absolute inset-y-0 right-0 flex w-24 items-center justify-end rounded-2xl bg-red-500 pr-6 text-white">
          <Trash2 className="size-5" />
        </button>
      )}
      <motion.div animate={swipe} drag={canDelete ? "x" : false} dragDirectionLock dragConstraints={{ left: -88, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => setDragging(true)}
        onDragEnd={(_, i) => { setDragging(false); const o = i.offset.x < -50; setOpen(o); swipe.start({ x: o ? -88 : 0 }); }}
        className="relative flex items-start gap-3 rounded-2xl border border-line bg-card p-3">
        {reorder && (
          <button aria-label={`Drag to move ${task.title}`} onPointerDown={(e) => { e.stopPropagation(); controls.start(e); }}
            className="-my-1 -ml-2 -mr-1.5 flex w-5 shrink-0 cursor-grab touch-none items-center self-stretch text-muted/60 active:cursor-grabbing">
            <GripVertical className="size-4" />
          </button>
        )}
        <button ref={checkRef} onClick={toggle} disabled={!mine} aria-pressed={done}
          aria-label={mine ? `${done ? "Untick" : "Tick"} ${task.title}` : `${task.title}, ${done ? "done" : "not done yet"}`}
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90 ${mine ? "" : "opacity-70"}`}
          style={{ borderColor: owner?.color || "var(--accent)", background: done ? owner?.color : "transparent" }}>
          <AnimatePresence>
            {done && (
              <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                <Check className="size-4 text-white" strokeWidth={3.5} />
              </motion.span>
            )}
          </AnimatePresence>
          {!done && task.needs_proof && mine && <Camera className="size-3.5" style={{ color: owner?.color }} aria-hidden />}
        </button>

        <button onClick={() => onOpen?.(task.id, day)} className="min-w-0 flex-1 text-left" aria-label={`Open ${task.title}`}>
          <p className={`break-words font-medium leading-snug ${done ? "text-muted line-through decoration-2" : ""}`}>{task.title}</p>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {adder && task.created_by !== task.assigned_to && <ByChip member={adder} />}
            {task.needs_proof && !done && <span className="inline-flex items-center gap-1 font-semibold"><Camera className="size-3" />Proof</span>}
            {task.repeat && (
              <span className="inline-flex items-center gap-1"><Repeat className="size-3" />{repeatLabel(task.repeat)}</span>
            )}
            {task.due && !task.repeat && (
              <span className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-red-500" : ""}`}>
                <CalendarDays className="size-3" />{overdue ? "Was due " : ""}{dueLabel(task.due, today)}
              </span>
            )}
            {nComments > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3" />{nComments}</span>}
          </span>
        </button>

        {row?.photo && (
          <button onClick={() => onOpen?.(task.id, day)} aria-label="See the photo proof" className="shrink-0">
            <img src={row.photo} alt="" onLoad={() => countPhotoView(row.photo, row.photo_bytes)}
              className="size-11 rounded-xl object-cover ring-2" style={{ "--tw-ring-color": owner?.color }} />
          </button>
        )}

        {!mine && !done && (
          <button onClick={nudge} disabled={nudgedToday}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-sunk px-3 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
            aria-label={nudgedToday ? `You nudged ${owner?.name} today` : `Nudge ${owner?.name} about ${task.title}`}>
            <Hand className="size-3.5" /> {nudgedToday ? "Nudged" : "Nudge"}
          </button>
        )}
        {!mine && done && (
          <div className="relative shrink-0">
            <button onClick={() => setPicker((p) => !p)} aria-label="React" aria-expanded={picker}
              className="grid size-8 place-items-center rounded-full bg-sunk text-muted">
              {myReact ? <span className="text-base">{myReact}</span> : <SmilePlus className="size-4" />}
            </button>
            <AnimatePresence>
              {picker && (
                <motion.div initial={{ opacity: 0, scale: 0.8, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute right-0 bottom-10 z-10 flex gap-1 rounded-full border border-line bg-card p-1 shadow-lg">
                  {REACTIONS.map((r) => (
                    <button key={r} onClick={() => react(r)} aria-label={`React ${r}`}
                      className={`grid size-9 place-items-center rounded-full text-lg transition hover:scale-125 ${myReact === r ? "bg-accent/15" : ""}`}>
                      {r}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
      {grouped.length > 0 && (
        <div className="-mt-2.5 flex justify-end gap-1 pr-3">
          {grouped.map(([emoji, names]) => (
            <button key={emoji} onClick={() => !mine && react(emoji)} title={names.join(", ")} aria-label={`${emoji} from ${names.join(", ")}`}
              className={`relative inline-flex h-6 items-center gap-1 rounded-full border border-line bg-card px-2 text-xs shadow-sm ${myReact === emoji ? "ring-1 ring-accent" : ""}`}>
              {emoji}{names.length > 1 && <b>{names.length}</b>}
            </button>
          ))}
        </div>
      )}
    </Outer>
  );
}
