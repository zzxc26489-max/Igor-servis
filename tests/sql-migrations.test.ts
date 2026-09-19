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


test("atomic stock receive and supplier return migration locks stock changes", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "011_atomic_stock_receiving_returns.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_receive_stock/);
  assert.match(sql, /create or replace function public\.crm_return_stock_supplier/);
  assert.match(sql, /for update/g);
  assert.match(sql, /Ячейка %s уже занята другой позицией/);
  assert.match(sql, /v_available := v_stock_qty - v_reserved/);
  assert.match(sql, /stock_received/);
  assert.match(sql, /stock_returned_supplier/);
});


test("server capabilities migration reports latest schema version", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "012_server_capabilities.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_server_capabilities/);
  assert.match(sql, /'latestMigration', 12/);
  assert.match(sql, /atomic-stock-receive-return/);
});


test("atomic order creation migration prevents duplicate numbers, vehicles and lift slots", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "013_atomic_order_create.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_create_order/);
  assert.match(sql, /for update/);
  assert.match(sql, /Клиент с таким телефоном уже есть/);
  assert.match(sql, /Автомобиль %s уже есть в базе/);
  assert.match(sql, /Подъёмник уже занят заказом/);
  assert.match(sql, /v_order_number := '№АИ-' \|\| lpad\(v_order_seq::text, 4, '0'\)/);
  assert.match(sql, /'latestMigration', 13/);
  assert.match(sql, /atomic-order-create/);
});
