import assert from "node:assert/strict";
import test from "node:test";
import { createSerialQueue } from "../src/lib/serialQueue.ts";

test("server mutations execute strictly in enqueue order", async () => {
  const enqueue = createSerialQueue();
  const events: string[] = [];

  const first = enqueue(async () => {
    events.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push("first:end");
    return 1;
  });
  const second = enqueue(async () => {
    events.push("second:start");
    events.push("second:end");
    return 2;
  });

  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("failed mutation does not block the following mutation", async () => {
  const enqueue = createSerialQueue();
  const events: string[] = [];

  const failed = enqueue(async () => {
    events.push("failed");
    throw new Error("network");
  });
  const next = enqueue(async () => {
    events.push("next");
    return "ok";
  });

  await assert.rejects(failed, /network/);
  assert.equal(await next, "ok");
  assert.deepEqual(events, ["failed", "next"]);
});
