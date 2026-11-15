import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Lock, RefreshCw } from "lucide-react";
import { supabase, isConfigured } from "../lib/supabase.js";
import { PLANS, CRON_CALLS_PER_MONTH, estimateCost, projectMonth, fmtBytes, fmtNum, fmtUsd } from "../lib/pricing.js";

/*
 * /admin: how much data each phone uses, how close the project is to
 * Supabase's free-plan limits, and what it would cost.
 * The password is checked inside the database (sl_admin_report).
 * Only sizes and counts are collected, never what anyone writes.
 */

const SERIES = [
  { key: "sync", label: "Live updates", color: "var(--series-1)" },
  { key: "api", label: "Loading & saving", color: "var(--series-2)" },
  { key: "photo", label: "Photos", color: "var(--series-3)" },
  { key: "app", label: "App download", color: "var(--series-4)" },
];

const PASS_KEY = "sl.adminpw";
const readPass = () => { try { return sessionStorage.getItem(PASS_KEY) || ""; } catch { return ""; } };
const savePass = (p) => { try { sessionStorage.setItem(PASS_KEY, p); } catch { /* private mode */ } };

function Meter({ label, used, limit, fmt, note }) {
  const pct = limit ? used / limit : 0;
  const tone = pct >= 1 ? "#d03b3b" : pct >= 0.8 ? "#c98500" : "var(--good)";
  const state = pct >= 1 ? "Over the free limit" : pct >= 0.8 ? "Close to the limit" : "Fine";
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{fmt(used)}</p>
      <p className="text-xs text-muted">of {fmt(limit)} free · {Math.round(pct * 100)}%</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunk" role="meter" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: tone }} />
      </div>
      <p className="mt-1.5 text-xs" style={{ color: pct >= 0.8 ? tone : "var(--muted)" }}>{pct >= 0.8 ? "⚠ " : "✓ "}{state}{note ? ` · ${note}` : ""}</p>
    </div>
  );
}

function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  // last 30 days, gaps filled with zeros
  const days = useMemo(() => {
    const by = Object.fromEntries(daily.map((d) => [d.day, d]));
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const d = by[key] || {};
      out.push({ day: key, ...Object.fromEntries(SERIES.map((s) => [s.key, Number(d[s.key]) || 0])), users: Number(d.users) || 0 });
    }
    return out;
  }, [daily]);
  const max = Math.max(1, ...days.map((d) => SERIES.reduce((a, s) => a + d[s.key], 0)));
  const W = 600, H = 180, pad = { l: 44, r: 8, t: 8, b: 22 };
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];

  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Data per day (last 30 days)</h2>
        <button onClick={() => setTable((t) => !t)} className="h-8 rounded-full bg-sunk px-3 text-xs font-semibold">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>
        ))}
      </ul>
      {table ? (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full text-right text-xs tabular-nums">
            <thead className="sticky top-0 bg-card text-muted"><tr><th className="py-1 text-left">Day</th>{SERIES.map((s) => <th key={s.key}>{s.label}</th>)}<th>Phones</th></tr></thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1 text-left">{d.day}</td>
                  {SERIES.map((s) => <td key={s.key}>{fmtBytes(d[s.key])}</td>)}
                  <td>{d.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Stacked bars of data used per day by type"
            onMouseLeave={() => setHover(null)}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{fmtBytes(t)}</text>
              </g>
            ))}
            {days.map((d, i) => {
              const x = pad.l + i * bw + 1.5;
              const w = Math.max(2, bw - 3);
              let acc = 0;
              const segs = SERIES.filter((s) => d[s.key] > 0);
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                  aria-label={`${d.day}: ${SERIES.map((s) => `${s.label} ${fmtBytes(d[s.key])}`).join(", ")}`}>
                  <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill={hover === i ? "var(--sunk)" : "transparent"} />
                  {segs.map((s, j) => {
                    const top = y(acc + d[s.key]);
                    const h = Math.max(0, y(acc) - top - (j > 0 ? 2 : 0)); // 2px surface gap between segments
                    acc += d[s.key];
                    if (j < segs.length - 1) return <rect key={s.key} x={x} y={top} width={w} height={h} fill={s.color} />;
                    // top of the stack: 4px rounded data end, square where it meets the segment below
                    const rad = Math.min(4, h / 2, w / 2);
                    return (
                      <g key={s.key} fill={s.color}>
                        <rect x={x} y={top} width={w} height={h} rx={rad} />
                        <rect x={x} y={top + rad} width={w} height={Math.max(0, h - rad)} />
                      </g>
                    );
                  })}
                  {i % 7 === 0 && <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.day.slice(5)}</text>}
                </g>
              );
            })}
          </svg>
          {hover != null && (
            <div className="pointer-events-none absolute top-0 z-10 rounded-xl border border-line bg-card p-2.5 text-xs shadow-lg"
              style={{ left: `${Math.min(70, Math.max(0, ((pad.l + hover * bw) / W) * 100 - 10))}%` }}>
              <p className="font-semibold">{days[hover].day}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} />
                  <span className="text-muted">{s.label}</span> <b className="ml-auto pl-3 tabular-nums">{fmtBytes(days[hover][s.key])}</b>
                </p>
              ))}
              <p className="mt-1 text-muted">{days[hover].users} phones</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SortTable({ rows, cols, initial }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const c = cols.find((x) => x.key === sort.key);
    const val = c.sort || ((r) => r[c.key]);
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "number" || typeof vb === "number" ? (Number(va) || 0) - (Number(vb) || 0) : String(va ?? "").localeCompare(String(vb ?? ""));
      return sort.dir * cmp;
    });
  }, [rows, cols, sort]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            {cols.map((c) => (
              <th key={c.key} className={`py-2 pr-3 font-semibold ${c.num ? "text-right" : ""}`} aria-sort={sort.key === c.key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
                <button onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))} className="inline-flex items-center gap-1">
                  {c.label}{sort.key === c.key && (sort.dir > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((c) => <td key={c.key} className={`py-2 pr-3 ${c.num ? "text-right tabular-nums" : ""}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="py-4 text-center text-sm text-muted">Nothing yet.</p>}
    </div>
  );
}

const ago = (iso) => {
  if (!iso) return "–";
  const s = (Date.now() - new Date(iso)) / 1000;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

function Dashboard({ r, onRefresh, busy }) {
  const t = r.totals;
  const m = r.month;
  const supabaseBytes = Number(m.bytes) - r.daily.reduce((a, d) => a + (d.day >= r.month_start ? Number(d.app) || 0 : 0), 0); // the app itself is served by Vercel
  const use = {
    db: Number(t.db_bytes),
    storage: Number(t.photo_bytes),
    egress: projectMonth(supabaseBytes),
    realtime: projectMonth(Number(m.msgs)),
    functions: projectMonth(Number(m.pushes)) + CRON_CALLS_PER_MONTH,
  };
  const cost = estimateCost(use);
  const F = PLANS.free;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-accent">Squadlist admin</p>
          <h1 className="font-display text-3xl font-extrabold">Usage & cost</h1>
          <p className="text-sm text-muted">Updated {new Date(r.generated).toLocaleString()} · sizes and counts only, never what anyone writes</p>
        </div>
        <button onClick={onRefresh} disabled={busy} className="flex h-10 items-center gap-2 rounded-full bg-sunk px-4 text-sm font-semibold disabled:opacity-60">
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      <section className="mt-6 rounded-3xl bg-gradient-to-br from-[#ff8a3d] to-[#f2512d] p-5 text-white">
        <p className="text-sm font-semibold opacity-90">Estimated cost this month</p>
        <p className="mt-1 font-display text-5xl font-extrabold">{fmtUsd(cost.total)}<span className="ml-2 text-lg font-semibold opacity-90">/ month</span></p>
        <p className="mt-1 text-sm opacity-95">
          {cost.plan === "free"
            ? "Everything fits Supabase's Free plan (projected to the end of the month)."
            : `Projected to need the Pro plan ($${PLANS.pro.base}/mo)${cost.lines.length ? " plus " + cost.lines.map((l) => `${fmtUsd(l.cost)} ${l.key}`).join(", ") : ""}.`}
          {" "}Hosting the app on Vercel's Hobby plan is free.
        </p>
        <p className="mt-2 text-xs opacity-80">{fmtNum(Number(m.users))} phones this month · {t.rooms} rooms · {t.members} friends · {fmtNum(t.ticks)} ticks · {t.push_phones} phones with notifications</p>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Meter label="Data out (month, projected)" used={use.egress} limit={F.egress} fmt={fmtBytes} note={`${fmtBytes(supabaseBytes)} so far`} />
        <Meter label="Realtime messages (projected)" used={use.realtime} limit={F.realtime} fmt={fmtNum} note={`${fmtNum(Number(m.msgs))} so far`} />
        <Meter label="Database size" used={use.db} limit={F.db} fmt={fmtBytes} />
        <Meter label="Photo storage" used={use.storage} limit={F.storage} fmt={fmtBytes} note={`${fmtNum(t.photo_files)} photos`} />
        <Meter label="Notification calls (projected)" used={use.functions} limit={F.functions} fmt={fmtNum} note="incl. hourly reminder job" />
      </section>
      <p className="mt-2 text-xs text-muted">
        Live updates, loading and saving are estimates from the phones (message sizes plus overhead). Prices and limits: <code>src/lib/pricing.js</code>, check supabase.com/pricing.
      </p>

      <div className="mt-6"><DailyChart daily={r.daily} /></div>

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Phones (last 30 days)</h2>
        <SortTable rows={r.users} initial={{ key: "bytes_30", dir: -1 }} cols={[
          { key: "name", label: "Name", render: (u) => <><b>{u.name || "–"}</b><br /><span className="text-xs text-muted">{u.device}</span></> },
          { key: "bytes_1", label: "Today", num: true, sort: (u) => Number(u.bytes_1), render: (u) => fmtBytes(Number(u.bytes_1)) },
          { key: "bytes_7", label: "7 days", num: true, sort: (u) => Number(u.bytes_7), render: (u) => fmtBytes(Number(u.bytes_7)) },
          { key: "bytes_30", label: "30 days", num: true, sort: (u) => Number(u.bytes_30), render: (u) => fmtBytes(Number(u.bytes_30)) },
          { key: "photo_30", label: "Photos", num: true, sort: (u) => Number(u.photo_30), render: (u) => fmtBytes(Number(u.photo_30)) },
          { key: "msgs_30", label: "Messages", num: true, sort: (u) => Number(u.msgs_30), render: (u) => fmtNum(Number(u.msgs_30)) },
          { key: "days_active_30", label: "Days", num: true, sort: (u) => Number(u.days_active_30) },
          { key: "last_seen", label: "Last seen", sort: (u) => u.last_seen, render: (u) => ago(u.last_seen) },
        ]} />
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Rooms</h2>
        <SortTable rows={r.rooms} initial={{ key: "last_active", dir: -1 }} cols={[
          { key: "room", label: "Room", render: (x) => <code className="text-xs">{x.room.slice(0, 6)}…</code> },
          { key: "members", label: "Friends", num: true, sort: (x) => Number(x.members) },
          { key: "tasks", label: "Tasks", num: true, sort: (x) => Number(x.tasks) },
          { key: "ticks", label: "Ticks", num: true, sort: (x) => Number(x.ticks) },
          { key: "photos", label: "Photos", num: true, sort: (x) => Number(x.photos) },
          { key: "last_active", label: "Last tick", sort: (x) => x.last_active || "", render: (x) => ago(x.last_active) },
        ]} />
      </section>
    </div>
  );
}

export default function Admin() {
  const [pass, setPass] = useState(readPass);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (p = pass) => {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("sl_admin_report", { p_password: p });
    setBusy(false);
    if (error) { setErr(/does not exist|Could not find/.test(error.message) ? "Run supabase/schema.sql first." : error.message); return; }
    if (data?.error) {
      setReport(null);
      setErr({
        wrong: "Wrong password.",
        locked: `Too many wrong tries. Locked until ${new Date(data.until).toLocaleTimeString()}.`,
        no_password: "No admin password yet. In Supabase SQL Editor run: select public.sl_set_admin_password('a long password');",
      }[data.error] || data.error);
      return;
    }
    savePass(p);
    setReport(data);
  };

  if (!isConfigured) {
    return <p className="mx-auto max-w-md px-4 pt-20 text-center text-muted">The admin page needs Supabase. Add your keys to <code>.env.local</code>.</p>;
  }
  if (report) return <Dashboard r={report} onRefresh={() => load()} busy={busy} />;

  return (
    <div className="mx-auto max-w-sm px-4 pt-24">
      <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-sunk"><Lock className="size-5" /></div>
      <h1 className="font-display text-3xl font-extrabold">Admin</h1>
      <p className="mt-1 text-sm text-muted">Data use and cost. The password is checked in the database.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (pass) load(pass); }} className="mt-6">
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Admin password" aria-label="Admin password"
          autoFocus className="h-12 w-full rounded-2xl bg-sunk px-4 outline-none" />
        {err && <p className="mt-3 text-sm text-red-500" role="alert">{err}</p>}
        <button disabled={busy || !pass} className="mt-4 h-12 w-full rounded-2xl bg-accent font-semibold text-accent-ink disabled:opacity-60">
          {busy ? "Checking…" : "Open"}
        </button>
      </form>
    </div>
  );
}
