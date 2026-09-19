import assert from "node:assert/strict";
import test from "node:test";
import { reassignWork, transitionWorkSessions } from "../src/lib/workSessions.ts";
import type { OrderLineWork } from "../src/types.ts";

test("reassigning a running work closes old mechanic session and pauses work", () => {
  const running: OrderLineWork = {
    id: "w1",
    name: "Замена ступицы",
    qty: 1,
    price: 5000,
    executor: "Алексей",
    workStatus: "in_progress",
    workSessions: [{ startedAt: "2026-09-19T10:00:00Z", executor: "Алексей" }],
  };

  const next = reassignWork(
    running,
    "Сергей",
    "2026-09-19T10:45:00Z",
    "Игорь",
    "Механик не смог выполнить работу",
  );

  assert.equal(next.executor, "Сергей");
  assert.equal(next.workStatus, "paused");
  assert.equal(next.workSessions?.[0].endedAt, "2026-09-19T10:45:00Z");
  assert.equal(next.workSessions?.[0].executor, "Алексей");
  assert.deepEqual(next.assignmentHistory?.[0], {
    from: "Алексей",
    to: "Сергей",
    at: "2026-09-19T10:45:00Z",
    actor: "Игорь",
    reason: "Механик не смог выполнить работу",
  });
});

test("new mechanic gets a separate session when work resumes", () => {
  const reassigned: OrderLineWork = {
    id: "w1",
    name: "Замена ступицы",
    qty: 1,
    price: 5000,
    executor: "Сергей",
    workStatus: "paused",
    workSessions: [{
      startedAt: "2026-09-19T10:00:00Z",
      endedAt: "2026-09-19T10:45:00Z",
      executor: "Алексей",
    }],
  };

  const resumed = transitionWorkSessions(reassigned, "in_progress", "2026-09-19T11:00:00Z");
  assert.equal(resumed.workStatus, "in_progress");
  assert.equal(resumed.workSessions?.length, 2);
  assert.equal(resumed.workSessions?.[1].executor, "Сергей");
});
