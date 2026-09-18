import assert from "node:assert/strict";
import test from "node:test";
import { effectiveWorkStatus, transitionWorkSessions, workSessionMinutes } from "../src/lib/workSessions.ts";
import type { OrderLineWork } from "../src/types.ts";

const work: OrderLineWork = {
  id: "w1",
  name: "Замена колодок",
  qty: 1,
  price: 2000,
  executor: "Механик 1",
  normMinutes: 60,
};

test("work starts, pauses, resumes and finishes with sessions", () => {
  const started = { ...work, ...transitionWorkSessions(work, "in_progress", "2026-09-19T10:00:00") };
  assert.equal(effectiveWorkStatus(started), "in_progress");
  assert.equal(started.workSessions?.length, 1);

  const paused = { ...started, ...transitionWorkSessions(started, "paused", "2026-09-19T10:30:00") };
  assert.equal(effectiveWorkStatus(paused), "paused");
  assert.equal(paused.workSessions?.[0].endedAt, "2026-09-19T10:30:00");

  const resumed = { ...paused, ...transitionWorkSessions(paused, "in_progress", "2026-09-19T10:45:00") };
  assert.equal(resumed.workSessions?.length, 2);

  const done = { ...resumed, ...transitionWorkSessions(resumed, "done", "2026-09-19T11:15:00") };
  assert.equal(effectiveWorkStatus(done), "done");
  assert.equal(workSessionMinutes(done), 60);
});
