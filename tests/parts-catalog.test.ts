import assert from "node:assert/strict";
import test from "node:test";
import { findPartReferences } from "../src/data/partReferences.ts";
import { formatQuantity, isValidQuantity, normalizeQuantity, parseQuantity } from "../src/lib/quantity.ts";

test("fractional stock quantities support liters and milliliters", () => {
  assert.equal(parseQuantity("4,5"), "4.5");
  assert.equal(normalizeQuantity(4.56789), 4.568);
  assert.equal(formatQuantity(4.5), "4,5");
  assert.equal(isValidQuantity(0.25), true);
  assert.equal(isValidQuantity(0), false);
});

test("part reference search finds OE, cross-number and vehicle", () => {
  assert.ok(findPartReferences("26300-35500").some((item) => item.sku === "26300-35505"));
  assert.ok(findPartReferences("Kia Rio").some((item) => item.sku === "26300-35505"));
  assert.ok(findPartReferences("Golf VI").some((item) => item.sku === "CUK 2939/1"));
});
