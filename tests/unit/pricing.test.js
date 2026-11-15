import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, projectMonth, fmtBytes, PLANS } from "../../src/lib/pricing.js";

const small = { db: 30e6, storage: 200e6, egress: 1e9, realtime: 100e3, functions: 2000 };

test("a friends app fits the free plan", () => {
  assert.deepEqual(estimateCost(small), { plan: "free", total: 0, lines: [] });
});

test("past a free limit: Pro base, plus overage only past Pro's limits", () => {
  assert.equal(estimateCost({ ...small, storage: 2e9 }).total, 25);
  const big = estimateCost({ ...small, egress: 260e9 });
  assert.equal(big.plan, "pro");
  assert.equal(big.lines[0].key, "egress");
  assert.ok(Math.abs(big.total - (25 + 10e9 * PLANS.pro.over.egress)) < 1e-9);
});

test("projection and formatting", () => {
  assert.equal(Math.round(projectMonth(100, new Date(2026, 10, 15, 23))), 200); // Nov has 30 days; 15 days in
  assert.equal(fmtBytes(1500), "1.5 KB");
  assert.equal(fmtBytes(0), "0 B");
  assert.equal(fmtBytes(5e9), "5.0 GB");
});
