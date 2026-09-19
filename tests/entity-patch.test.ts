import assert from "node:assert/strict";
import test from "node:test";
import { changedPatch, rebasePatch } from "../src/lib/entityPatch.ts";

test("unchanged stale fields are not reapplied after server refresh", () => {
  const before = { id: "c1", notes: "старое", isRegular: false, email: "a@test.ru" };
  const submitted = { notes: "старое", isRegular: true, email: "a@test.ru" };
  const delta = changedPatch(before, submitted);

  assert.deepEqual(delta, { isRegular: true });

  const fresh = { id: "c1", notes: "новая заметка с другого устройства", isRegular: false, email: "a@test.ru" };
  assert.deepEqual(rebasePatch(fresh, delta), {
    id: "c1",
    notes: "новая заметка с другого устройства",
    isRegular: true,
    email: "a@test.ru",
  });
});

test("explicit clearing remains part of the user delta", () => {
  const before = { id: "v1", vin: "VIN123", mileage: 120000 };
  const delta = changedPatch(before, { vin: undefined, mileage: 120000 });

  assert.ok(Object.prototype.hasOwnProperty.call(delta, "vin"));
  assert.equal(delta.vin, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(delta, "mileage"), false);

  const fresh = { id: "v1", vin: "VIN999", mileage: 125000 };
  assert.deepEqual(rebasePatch(fresh, delta), {
    id: "v1",
    vin: undefined,
    mileage: 125000,
  });
});
