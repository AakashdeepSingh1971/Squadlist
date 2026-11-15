import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { initial } from "../lib/people.js";

/** Round bubble with a friend's initial in their color; emoji badge optional */
export function Avatar({ member, size = 36, online, emoji = false, ring, className = "" }) {
  if (!member) return null;
  const fs = Math.round(size * 0.42);
  return (
    <span className={`relative inline-grid shrink-0 place-items-center rounded-full font-bold text-white ${className}`}
      style={{ width: size, height: size, background: member.color, fontSize: fs }} title={member.name}>
      {ring != null && <ProgressRing value={ring} size={size + 8} color={member.color} className="absolute -inset-1" />}
      {emoji ? <span style={{ fontSize: fs * 1.15 }}>{member.emoji}</span> : initial(member.name)}
      {online != null && (
        <span className={`absolute right-0 bottom-0 size-[28%] min-h-2 min-w-2 rounded-full border-2 border-card ${online ? "bg-good" : "bg-muted/40"}`}
          aria-label={online ? "here now" : "away"} />
      )}
    </span>
  );
}

/** small "added by" chip: tiny initial bubble */
export function ByChip({ member, label = "from" }) {
  if (!member) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-xs font-semibold"
      style={{ background: member.color + "22", color: member.color }}>
      <span className="grid size-4 place-items-center rounded-full text-[10px] text-white" style={{ background: member.color }}>
        {initial(member.name)}
      </span>
      {label} {member.name}
    </span>
  );
}

export function ProgressRing({ value, size = 44, stroke = 3, color = "var(--accent)", className = "" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className={`pointer-events-none -rotate-90 ${className}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value || 0))}
        style={{ transition: "stroke-dashoffset .5s ease" }} />
    </svg>
  );
}

/** Bottom sheet on phones, centered card on wide screens */
export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose?.(); }}>
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-2">
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              {onClose && (
                <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-sunk text-muted">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto px-5 pb-4" onPointerDown={(e) => e.stopPropagation()}>{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-5 pt-3 pb-safe">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Chip({ active, onClick, children, color, className = "" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition active:scale-95 ${
        active ? "border-transparent text-white" : "border-line bg-card text-ink"} ${className}`}
      style={active ? { background: color || "var(--accent)", color: color ? "#fff" : "var(--accent-ink)" } : undefined}>
      {children}
    </button>
  );
}
