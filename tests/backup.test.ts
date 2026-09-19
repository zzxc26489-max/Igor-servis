import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_FORMAT,
  backupCounts,
  createBackupJson,
  inspectBackupJson,
} from "../src/lib/backup.ts";

const db = {
  orders: [{ id: "o1" }],
  clients: [{ id: "c1" }],
  vehicles: [{ id: "v1" }],
  stock: [{ id: "s1" }],
  expenses: [{ id: "e1" }],
  payments: [{ id: "p1" }],
};

test("new backup contains metadata and restores data", () => {
  const json = createBackupJson(db, { appVersion: "0.5.0", dbVersion: "v3" });
  const parsed = inspectBackupJson(json);
  assert.ok(parsed);
  assert.equal(parsed.legacy, false);
  assert.equal(parsed.meta?.format, BACKUP_FORMAT);
  assert.equal(parsed.meta?.appVersion, "0.5.0");
  assert.deepEqual(backupCounts(parsed.data), {
    orders: 1,
    clients: 1,
    vehicles: 1,
    stock: 1,
    expenses: 1,
    payments: 1,
  });
});

test("legacy full database backup remains supported", () => {
  const parsed = inspectBackupJson(JSON.stringify(db));
  assert.ok(parsed);
  assert.equal(parsed.legacy, true);
  assert.equal(backupCounts(parsed.data).vehicles, 1);
});

test("corrupt and incomplete backups are rejected", () => {
  assert.equal(inspectBackupJson("{bad json"), null);
  assert.equal(inspectBackupJson(JSON.stringify({ orders: [], clients: [] })), null);
  assert.equal(inspectBackupJson(JSON.stringify({
    backup: { format: BACKUP_FORMAT, formatVersion: 1, exportedAt: new Date().toISOString() },
    data: { orders: [], clients: [], vehicles: [] },
  })), null);
});

test("future unsupported backup format version is rejected", () => {
  const json = JSON.stringify({
    backup: {
      format: BACKUP_FORMAT,
      formatVersion: 999,
      exportedAt: new Date().toISOString(),
    },
    data: db,
  });
  assert.equal(inspectBackupJson(json), null);
});
