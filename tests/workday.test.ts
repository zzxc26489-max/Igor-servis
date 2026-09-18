import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkDay, workHourScale, workDayMinutes } from "../src/lib/workday.ts";

test("workday defaults safely", () => {
  assert.deepEqual(normalizeWorkDay(undefined), { start: "10:00", end: "20:00" });
});

test("custom workday drives scale and capacity", () => {
  const day = normalizeWorkDay({ start: "08:00", end: "18:00" });
  assert.equal(workDayMinutes(day), 600);
  assert.deepEqual(workHourScale(day), ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"]);
});

test("invalid short day falls back", () => {
  assert.deepEqual(normalizeWorkDay({ start: "20:00", end: "20:30" }), { start: "10:00", end: "20:00" });
});
