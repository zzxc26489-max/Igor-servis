import assert from "node:assert/strict";
import test from "node:test";
import { mergeConcurrentState } from "../src/lib/stateMerge.ts";

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
