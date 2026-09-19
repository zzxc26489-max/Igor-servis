import assert from "node:assert/strict";
import test from "node:test";
import { appendWorkOnce } from "../src/lib/orderWorks.ts";
import type { OrderLineWork } from "../src/types.ts";

const work: OrderLineWork = {
  id: "work-1",
  name: "Диагностика",
  qty: 1,
  price: 2000,
};

test("same work id is appended only once", () => {
  const once = appendWorkOnce([], work);
  const twice = appendWorkOnce(once, { ...work });
  assert.equal(twice.length, 1);
  assert.equal(twice[0].id, "work-1");
});

test("different work ids can coexist", () => {
  const result = appendWorkOnce([work], { ...work, id: "work-2" });
  assert.deepEqual(result.map((item) => item.id), ["work-1", "work-2"]);
});
