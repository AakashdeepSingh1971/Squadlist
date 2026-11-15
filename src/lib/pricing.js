// Supabase plan limits and prices, for the admin page's cost estimate.
// Prices change: check https://supabase.com/pricing and update these numbers.

export const PLANS = {
  free: {
    name: "Free",
    base: 0,
    db: 500e6, // database size, bytes
    storage: 1e9, // file storage (photo proofs)
    egress: 5e9, // data out per month
    realtime: 2e6, // realtime messages per month
    functions: 500e3, // Edge Function calls per month
  },
  pro: {
    name: "Pro",
    base: 25,
    db: 8e9,
    storage: 100e9,
    egress: 250e9,
    realtime: 5e6,
    functions: 2e6,
    // price per unit over the included amount
    over: { db: 0.125 / 1e9, storage: 0.021 / 1e9, egress: 0.09 / 1e9, realtime: 2.5 / 1e6, functions: 2 / 1e6 },
  },
};

// the hourly reminder job calls the push function 24 times a day
export const CRON_CALLS_PER_MONTH = 24 * 30;

/**
 * Month usage -> which plan you need and what it costs.
 * use: { db, storage, egress, realtime, functions } (projected to month end)
 */
export function estimateCost(use) {
  const keys = ["db", "storage", "egress", "realtime", "functions"];
  if (keys.every((k) => use[k] <= PLANS.free[k])) return { plan: "free", total: 0, lines: [] };
  const p = PLANS.pro;
  const lines = keys
    .map((k) => ({ key: k, over: Math.max(0, use[k] - p[k]) }))
    .filter((l) => l.over > 0)
    .map((l) => ({ ...l, cost: l.over * p.over[l.key] }));
  return { plan: "pro", total: p.base + lines.reduce((a, l) => a + l.cost, 0), lines };
}

/** month-to-date -> projected full month, at the same daily rate */
export function projectMonth(value, now = new Date()) {
  const elapsed = now.getDate() - 1 + (now.getHours() + 1) / 24;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return value * (days / Math.max(elapsed, 1));
}

export function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(Math.abs(n)) / 3));
  const v = n / 10 ** (i * 3);
  return `${i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export const fmtNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
export const fmtUsd = (n) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`;
