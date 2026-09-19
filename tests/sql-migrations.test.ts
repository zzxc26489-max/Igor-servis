import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

test("Supabase migrations do not contain broken single-dollar function delimiters", () => {
  const dir = join(process.cwd(), "supabase");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(files.length >= 6);

  for (const name of files) {
    const sql = readFileSync(join(dir, name), "utf8");
    const lines = sql.split(/\r?\n/).map((line) => line.trim());
    assert.equal(lines.includes("as $"), false, `${name}: found broken 'as $' delimiter`);
    assert.equal(lines.includes("$;"), false, `${name}: found broken '$;' delimiter`);
  }
});

test("security hardening migration restricts mechanic media deletion and foreign orders", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "006_security_hardening.sql"), "utf8");
  assert.match(sql, /p_delete and v_role not in \('owner', 'partner', 'advisor'\)/);
  assert.match(sql, /when incoming\.item is null or not permission\.allowed then current_order\.item/);
  assert.match(sql, /where work ->> 'executor' = p_display/);
});


test("atomic stock reservation migration locks shared state and checks free quantity", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "007_atomic_stock_reservation.sql"), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /v_available := v_stock_qty - v_reserved/);
  assert.match(sql, /if p_qty > v_available \+ 0\.0001 then/);
  assert.match(sql, /'stockConflict', true/);
  assert.match(sql, /'stock_reserved'/);
});
