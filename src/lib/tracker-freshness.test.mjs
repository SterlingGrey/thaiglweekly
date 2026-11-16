import assert from "node:assert/strict";
import test from "node:test";
import { checkTrackerFreshness } from "../../scripts/check-tracker-freshness.mjs";

const show = { id: "a", title: "A", status: "upcoming", day_of_week: "Sat", air_time_ict: "21:30", total_episodes: 8 };
const ep = (number, date) => ({ number, airs_at: `${date}T21:30:00+07:00` });
const now = "2026-11-16T19:00:00Z";
const catalog = episodes => ({ generated_at: now, series: [{ ...show, episodes }] });

test("a current rebuild cannot conceal an overdue source check or episode gap", () => {
  const live = catalog([ep(1, "2026-11-07")]);
  const result = checkTrackerFreshness({ expected: live, live, now, receipt: { checkedAt: "2026-11-15T12:00:00Z" } });
  assert.equal(result.failures.length, 1);
  assert.equal(result.leads.length, 1);
});

test("a recent partial review is valid, while a missing live correction fails readback", () => {
  const expected = catalog([ep(1, "2026-11-07"), ep(2, "2026-11-14")]);
  const live = catalog([ep(1, "2026-11-07")]);
  const receipt = { checkedAt: now, open: ["Another title needs evidence."] };
  assert.deepEqual(checkTrackerFreshness({ expected, live, receipt, now }).failures, ["Live episode rows differ from main for a."]);
  assert.deepEqual(checkTrackerFreshness({ expected, live: expected, receipt, now }), { failures: [], leads: [], open: receipt.open });
});
