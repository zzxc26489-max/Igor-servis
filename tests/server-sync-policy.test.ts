import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyServerRevision, shouldSurfaceServerLoadError } from "../src/lib/serverSyncPolicy.ts";

test("server revision never moves backwards", () => {
  assert.equal(shouldApplyServerRevision({ currentRevision: 12, incomingRevision: 11 }), false);
  assert.equal(shouldApplyServerRevision({ currentRevision: 12, incomingRevision: 12 }), true);
  assert.equal(shouldApplyServerRevision({ currentRevision: 12, incomingRevision: 13 }), true);
});

test("late older poll cannot overwrite a newer applied response", () => {
  assert.equal(shouldApplyServerRevision({
    currentRevision: 20,
    incomingRevision: 20,
    requestId: 4,
    latestRequestId: 5,
  }), false);
  assert.equal(shouldApplyServerRevision({
    currentRevision: 20,
    incomingRevision: 21,
    requestId: 4,
    latestRequestId: 5,
  }), true);
});

test("only latest poll error changes sync status", () => {
  assert.equal(shouldSurfaceServerLoadError(4, 5), false);
  assert.equal(shouldSurfaceServerLoadError(5, 5), true);
});
