import assert from "node:assert/strict";
import test from "node:test";
import { effectiveWorkStatus, transitionWorkSessions, workSessionMinutes } from "../src/lib/workSessions.ts";
import { completeWorksForReady, issueBlockers } from "../src/lib/orderIssue.ts";
import type { Order, StockItem } from "../src/types.ts";
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


test("marking order ready closes open work sessions", () => {
  const started = { ...work, ...transitionWorkSessions(work, "in_progress", "2026-09-19T10:00:00") };
  const completed = completeWorksForReady([started], "2026-09-19T10:45:00");
  assert.equal(effectiveWorkStatus(completed[0]), "done");
  assert.equal(completed[0].workSessions?.[0].endedAt, "2026-09-19T10:45:00");
});

test("issue blockers require ready status and completed works", () => {
  const order: Order = {
    id: "o1",
    number: "1",
    clientId: "c1",
    vehicleId: "v1",
    status: "в работе",
    createdAt: "2026-09-19T09:00:00",
    works: [work],
    parts: [],
    paid: 0,
  };
  assert.equal(issueBlockers(order, []).length >= 2, true);
});

test("issue blockers reject ordered and missing reserved parts", () => {
  const order: Order = {
    id: "o2",
    number: "2",
    clientId: "c1",
    vehicleId: "v1",
    status: "готово",
    createdAt: "2026-09-19T09:00:00",
    works: [{ ...work, workStatus: "done" }],
    parts: [
      { id: "p1", name: "Диск", sku: "A1", qty: 1, price: 1000, availability: "ordered" },
      { id: "p2", name: "Колодки", sku: "A2", qty: 1, price: 1000, availability: "reserved" },
    ],
    paid: 0,
  };
  const stock: StockItem[] = [];
  const blockers = issueBlockers(order, stock);
  assert.equal(blockers.some((item) => item.includes("заказан")), true);
  assert.equal(blockers.some((item) => item.includes("не найдена на складе")), true);
});
