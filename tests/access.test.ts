import assert from "node:assert/strict";
import test from "node:test";
import { canManageSettings, canOpenPath, canSeeFinance } from "../src/lib/access.ts";

test("owner and partner see management sections", () => {
  for (const role of ["owner", "partner"] as const) {
    assert.equal(canOpenPath(role, "/finance"), true);
    assert.equal(canManageSettings(role), true);
    assert.equal(canSeeFinance(role), true);
  }
});

test("advisor cannot open finance or settings", () => {
  assert.equal(canOpenPath("advisor", "/orders/123"), true);
  assert.equal(canOpenPath("advisor", "/clients"), true);
  assert.equal(canOpenPath("advisor", "/finance"), false);
  assert.equal(canManageSettings("advisor"), false);
});

test("parts user is limited to stock, purchases and linked orders", () => {
  assert.equal(canOpenPath("parts", "/stock"), true);
  assert.equal(canOpenPath("parts", "/purchases"), true);
  assert.equal(canOpenPath("parts", "/orders/123"), true);
  assert.equal(canOpenPath("parts", "/employees"), false);
});
