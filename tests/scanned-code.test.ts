import assert from "node:assert/strict";
import test from "node:test";
import { findStockItemByScannedCode, parseScannedCode, preferredScannedValue } from "../src/lib/scannedCode.ts";
import type { StockItem } from "../src/types.ts";

const stock: StockItem[] = [
  {
    id: "s1",
    name: "Фильтр",
    sku: "HU-816X",
    barcode: "4006381333931",
    category: "Фильтры",
    qty: 3,
    minQty: 1,
    purchasePrice: 500,
    unit: "шт.",
    crossNumbers: ["OX123"],
    oeNumbers: ["11427566327"],
  },
];

test("plain barcode finds stock item", () => {
  assert.equal(findStockItemByScannedCode(stock, "4006381333931").item?.id, "s1");
});

test("QR JSON extracts SKU and barcode", () => {
  const parsed = parseScannedCode('{"sku":"HU-816X","barcode":"4006381333931"}');
  assert.equal(parsed.kind, "json");
  assert.equal(parsed.sku, "HU-816X");
  assert.equal(parsed.barcode, "4006381333931");
  assert.equal(findStockItemByScannedCode(stock, '{"sku":"HU-816X"}').item?.id, "s1");
});

test("QR URL extracts article query parameter", () => {
  const value = "https://parts.example/item?article=HU-816X";
  assert.equal(parseScannedCode(value).kind, "url");
  assert.equal(findStockItemByScannedCode(stock, value).item?.id, "s1");
});

test("labelled QR and OE/cross numbers are searchable", () => {
  assert.equal(findStockItemByScannedCode(stock, "SKU=HU-816X").item?.id, "s1");
  assert.equal(findStockItemByScannedCode(stock, "code=OX123").item?.id, "s1");
  assert.equal(findStockItemByScannedCode(stock, "code=11427566327").item?.id, "s1");
});

test("preferred value is safe for unknown QR", () => {
  assert.equal(preferredScannedValue("sku=NEW-42"), "NEW-42");
});
