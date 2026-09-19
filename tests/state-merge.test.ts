import assert from "node:assert/strict";
import test from "node:test";
import { mergeConcurrentState, mergeConcurrentStateDetailed } from "../src/lib/stateMerge.ts";
import { hasLocalChanges, shouldApplyServerRevision } from "../src/lib/syncPolicy.ts";

test("concurrent merge keeps changes to different entities", () => {
  const base = {
    orders: [
      { id: "a", status: "запись", paid: 0 },
      { id: "b", status: "запись", paid: 0 },
    ],
    company: { name: "Сервис" },
  };
  const local = {
    ...base,
    orders: [
      { id: "a", status: "в работе", paid: 0 },
      { id: "b", status: "запись", paid: 0 },
    ],
  };
  const remote = {
    ...base,
    orders: [
      { id: "a", status: "запись", paid: 0 },
      { id: "b", status: "запись", paid: 1000 },
    ],
  };

  const merged = mergeConcurrentState(base, local, remote);
  assert.equal(merged.orders[0].status, "в работе");
  assert.equal(merged.orders[1].paid, 1000);
});

test("local deletion survives while unrelated remote addition stays", () => {
  const base = { clients: [{ id: "a", name: "A" }, { id: "b", name: "B" }] };
  const local = { clients: [{ id: "b", name: "B" }] };
  const remote = { clients: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] };
  const merged = mergeConcurrentState(base, local, remote);
  assert.deepEqual(merged.clients.map((item) => item.id), ["b", "c"]);
});


test("concurrent edits to different fields of the same order are combined", () => {
  const base = { orders: [{ id: "a", status: "запись", paid: 0, notes: "" }] };
  const local = { orders: [{ id: "a", status: "в работе", paid: 0, notes: "" }] };
  const remote = { orders: [{ id: "a", status: "запись", paid: 1500, notes: "" }] };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.equal(merged.value.orders[0].status, "в работе");
  assert.equal(merged.value.orders[0].paid, 1500);
  assert.equal(merged.conflicts.length, 0);
});

test("same-field conflict keeps the committed server value and reports conflict", () => {
  const base = { orders: [{ id: "a", status: "запись" }] };
  const local = { orders: [{ id: "a", status: "в работе" }] };
  const remote = { orders: [{ id: "a", status: "готово" }] };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.equal(merged.value.orders[0].status, "готово");
  assert.deepEqual(merged.conflicts, [{ path: "orders[a].status", kind: "same-field" }]);
});

test("server deletion is not silently resurrected by a concurrent local edit", () => {
  const base = { vehicles: [{ id: "v1", plate: "A001AA", mileage: 1000 }] };
  const local = { vehicles: [{ id: "v1", plate: "A001AA", mileage: 1200 }] };
  const remote = { vehicles: [] as Array<{ id: string; plate: string; mileage: number }> };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.equal(merged.value.vehicles.length, 0);
  assert.equal(merged.conflicts[0]?.kind, "delete-vs-change");
});

test("older server revision is rejected and equal/newer revisions are allowed", () => {
  assert.equal(shouldApplyServerRevision(12, 11), false);
  assert.equal(shouldApplyServerRevision(12, 12), true);
  assert.equal(shouldApplyServerRevision(12, 13), true);
});

test("dirty check compares local state with last confirmed server base", () => {
  const base = { revisionData: [{ id: "1", value: "a" }] };
  assert.equal(hasLocalChanges(base, base), false);
  assert.equal(hasLocalChanges(base, { revisionData: [{ id: "1", value: "b" }] }), true);
  assert.equal(hasLocalChanges(null, base), false);
});


test("different fields of the same order merge without overwriting each other", () => {
  const base = {
    orders: [{ id: "o1", status: "запись", notes: "", paid: 0 }],
  };
  const local = {
    orders: [{ id: "o1", status: "в работе", notes: "", paid: 0 }],
  };
  const remote = {
    orders: [{ id: "o1", status: "запись", notes: "Проверить шум", paid: 0 }],
  };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.equal(merged.value.orders[0].status, "в работе");
  assert.equal(merged.value.orders[0].notes, "Проверить шум");
  assert.equal(merged.conflicts.length, 0);
});

test("server wins only the same field changed differently on both devices", () => {
  const base = {
    orders: [{ id: "o1", status: "запись", notes: "", paid: 0 }],
  };
  const local = {
    orders: [{ id: "o1", status: "в работе", notes: "Локальная заметка", paid: 0 }],
  };
  const remote = {
    orders: [{ id: "o1", status: "готово", notes: "", paid: 0 }],
  };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.equal(merged.value.orders[0].status, "готово");
  assert.equal(merged.value.orders[0].notes, "Локальная заметка");
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].path, "orders[o1].status");
});

test("remote edit prevents stale local deletion from erasing new server data", () => {
  const base = { vehicles: [{ id: "v1", plate: "A001AA", mileage: 1000 }] };
  const local = { vehicles: [] };
  const remote = { vehicles: [{ id: "v1", plate: "A001AA", mileage: 1200 }] };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.equal(merged.value.vehicles.length, 1);
  assert.equal(merged.value.vehicles[0].mileage, 1200);
  assert.equal(merged.conflicts.length, 1);
});

test("confirmed server deletion wins over stale local edit", () => {
  const base = { vehicles: [{ id: "v1", plate: "A001AA", mileage: 1000 }] };
  const local = { vehicles: [{ id: "v1", plate: "A001AA", mileage: 1100 }] };
  const remote = { vehicles: [] };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.deepEqual(merged.value.vehicles, []);
  assert.equal(merged.conflicts.length, 1);
});

test("independent concurrent creations are both preserved", () => {
  const base = { clients: [] as Array<{ id: string; name: string }> };
  const local = { clients: [{ id: "local", name: "Локальный" }] };
  const remote = { clients: [{ id: "remote", name: "Серверный" }] };

  const merged = mergeConcurrentStateDetailed(base, local, remote);
  assert.deepEqual(merged.value.clients.map((item) => item.id), ["local", "remote"]);
  assert.equal(merged.conflicts.length, 0);
});
