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


test("atomic payment migration locks shared state and checks debt", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "008_atomic_order_payments.sql"), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /if p_kind = 'payment' and v_total > v_debt/);
  assert.match(sql, /if p_kind = 'refund' and v_total > v_paid/);
  assert.match(sql, /'paymentConflict', true/);
  assert.match(sql, /client_payment/);
});


test("atomic cash shift migration locks shared state and recalculates expected cash", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "009_atomic_cash_shifts.sql"), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /Кассовая смена уже открыта на другом устройстве/);
  assert.match(sql, /v_expected := v_opening \+ v_cash_payments - v_cash_refunds - v_cash_expenses \+ v_supplier_refunds/);
  assert.match(sql, /При расхождении нужен комментарий/);
  assert.match(sql, /cash_shift_closed/);
});


test("advisor stock sync migration persists stock together with issue movements", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "010_advisor_stock_issue_sync.sql"), "utf8");
  assert.match(sql, /elsif v_role = 'advisor'/);
  assert.match(sql, /'stock', coalesce\(p_data -> 'stock', v_current\.data -> 'stock'\)/);
  assert.match(sql, /'stockMovements', coalesce\(p_data -> 'stockMovements'/);
  assert.match(sql, /'orders', coalesce\(p_data -> 'orders'/);
});
