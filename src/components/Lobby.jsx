import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Dices, Lock, Users, X } from "lucide-react";
import { forgetRoom, makeRoomCode, recentRooms, roomFromSecret } from "../lib/identity.js";
import { isDemo } from "../lib/api.js";

export default function Lobby({ onOpen }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState(recentRooms);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || pass.length < 4) { setErr("Pick a room name and a passcode of at least 4 characters."); return; }
    setBusy(true); setErr("");
    try {
      onOpen(await roomFromSecret(name, pass), name.trim());
    } catch {
      setErr("This browser can't make a passcode room here. Open the app over https.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh pt-safe">
      <div className="mx-auto max-w-md px-4 pb-16">
        <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-14 pb-8">
          <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-accent text-3xl shadow-lg shadow-accent/30">✅</div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight">Squadlist</h1>
          <p className="mt-3 text-lg text-muted">
            Checklists with your friends. Add tasks for each other, tick them off, keep the squad streak alive. 🔥
          </p>
        </motion.header>

        <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          onSubmit={submit} className="rounded-3xl border border-line bg-card p-5 shadow-sm">
          <h2 className="font-display text-xl font-semibold">Open your squad's room</h2>
          <p className="mt-1 text-sm text-muted">Same name + passcode on any phone opens the same room.</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="room-name">Room name</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-sunk px-3.5">
            <Users className="size-4 text-muted" aria-hidden />
            <input id="room-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
              placeholder="gym bros, study gang…" autoComplete="off"
              className="h-12 w-full bg-transparent outline-none placeholder:text-muted/70" />
          </div>
          <label className="mt-3 block text-sm font-semibold" htmlFor="room-pass">Passcode</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-sunk px-3.5">
            <Lock className="size-4 text-muted" aria-hidden />
            <input id="room-pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
              placeholder="something only your squad knows" autoComplete="off"
              className="h-12 w-full bg-transparent outline-none placeholder:text-muted/70" />
          </div>
          {err && <p className="mt-3 text-sm text-red-500" role="alert">{err}</p>}
          <button disabled={busy} className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-accent-ink transition active:scale-[.98] disabled:opacity-60">
            {busy ? "Opening…" : <>Let's go <ArrowRight className="size-5" /></>}
          </button>
          <button type="button" onClick={() => onOpen(makeRoomCode(), "Quick room")}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-muted hover:bg-sunk">
            <Dices className="size-4" /> Or start a quick room and share the link
          </button>
        </motion.form>

        {recent.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">Jump back in</h2>
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.code} className="flex items-center gap-2 rounded-2xl border border-line bg-card pr-2">
                  <button onClick={() => onOpen(r.code)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunk text-lg">👥</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.label || "Room"}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.as ? `as ${r.as} · ` : ""}{new Date(r.at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                  <button aria-label={`Forget ${r.label || "room"}`} onClick={() => { forgetRoom(r.code); setRecent(recentRooms()); }}
                    className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunk">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isDemo && (
          <p className="mt-8 rounded-2xl bg-sunk p-4 text-sm text-muted">
            <b className="text-ink">Demo mode.</b> Supabase isn't set up yet, so rooms are saved in this browser only
            (open two tabs to try it with a "friend"). Add your keys to <code>.env.local</code> to play with real friends.
          </p>
        )}
      </div>
    </div>
  );
}
