import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_BASE_KEY,
  LOCAL_DB_KEY,
  clearCloudDeviceData,
  readCloudBase,
  writeCloudBase,
} from "../src/lib/cloudCache.ts";

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, String(value)); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    },
  });
  return values;
}

test("cloud base cache is scoped to current user", () => {
  installStorage();
  writeCloudBase("u1", 7, { orders: [{ id: "a" }] });
  assert.equal(readCloudBase<{ orders: { id: string }[] }>("u1")?.revision, 7);
  assert.equal(readCloudBase("u2"), null);
});

test("device cleanup removes CRM data and cloud merge base", () => {
  const values = installStorage();
  localStorage.setItem(LOCAL_DB_KEY, "{\"clients\":[1]}");
  localStorage.setItem(CLOUD_BASE_KEY, "{\"revision\":3}");
  clearCloudDeviceData();
  assert.equal(values.has(LOCAL_DB_KEY), false);
  assert.equal(values.has(CLOUD_BASE_KEY), false);
});
