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


test("atomic vehicle management migration protects duplicates and order history", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "014_atomic_vehicle_management.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_save_vehicle/);
  assert.match(sql, /create or replace function public\.crm_delete_vehicle/);
  assert.match(sql, /for update/g);
  assert.match(sql, /Автомобиль %s уже есть в базе/);
  assert.match(sql, /По этому автомобилю уже есть заказ-наряды, удалить его нельзя/);
  assert.match(sql, /'latestMigration', 14/);
  assert.match(sql, /atomic-vehicle-management/);
});


test("idempotent financial mutations migration deduplicates money operations", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "015_idempotent_financial_mutations.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_add_expense/);
  assert.match(sql, /create or replace function public\.crm_confirm_supplier_refund/);
  assert.match(sql, /create or replace function public\.crm_pay_employee/);
  assert.match(sql, /for update/g);
  assert.match(sql, /where e ->> 'id' = v_id/);
  assert.match(sql, /refundOperationId/);
  assert.match(sql, /where e ->> 'id' = p_expense_id/);
  assert.match(sql, /'latestMigration', 15/);
  assert.match(sql, /idempotent-financial-mutations/);
});


test("idempotent order status migration prevents repeated stock issue and return", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "016_idempotent_order_status.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_set_order_status/);
  assert.match(sql, /for update/);
  assert.match(sql, /if v_old_status = p_status then/);
  assert.match(sql, /if v_was_issued <> v_will_issue then/);
  assert.match(sql, /p_operation_id \|\| ':'/);
  assert.match(sql, /Не все работы завершены/);
  assert.match(sql, /По заказу есть переплата/);
  assert.match(sql, /'latestMigration', 16/);
  assert.match(sql, /idempotent-order-status/);
});


test("idempotent client and service CRUD migration rejects duplicates and no-ops repeats", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "017_idempotent_reference_crud.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_update_client/);
  assert.match(sql, /create or replace function public\.crm_save_service/);
  assert.match(sql, /for update/g);
  assert.match(sql, /Такой телефон уже указан у другого клиента/);
  assert.match(sql, /Такая услуга уже есть в этой категории/);
  assert.match(sql, /if v_saved = v_existing then/);
  assert.match(sql, /if v_existing is null then[\s\S]*'ok', true/);
  assert.match(sql, /'latestMigration', 17/);
  assert.match(sql, /idempotent-reference-crud/);
});


test("idempotent order delete and release migration avoids duplicate release movements", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "018_idempotent_order_delete_release.sql"), "utf8");
  assert.match(sql, /create or replace function public\.crm_release_order_part/);
  assert.match(sql, /create or replace function public\.crm_delete_order/);
  assert.match(sql, /for update/g);
  assert.match(sql, /release-part:' \|\| p_order_id \|\| ':' \|\| p_part_id/);
  assert.match(sql, /delete-order:' \|\| p_order_id/);
  assert.match(sql, /Заказ с оплатами нельзя удалить/);
  assert.match(sql, /if v_order is null then[\s\S]*'ok', true/);
  assert.match(sql, /'latestMigration', 18/);
  assert.match(sql, /idempotent-order-delete-release/);
});


test("review fixes migration repairs cash calculation and optional field clearing", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "019_review_fixes.sql"), "utf8");
  assert.match(sql, /coalesce\(expense ->> 'source', ''\) <> 'supplier_refund'/);
  assert.match(sql, /- 'phone2'[\s\S]*- 'discountPercent'[\s\S]*- 'notes'/);
  assert.match(sql, /- 'vin'[\s\S]*- 'mileage'[\s\S]*- 'nextServiceMileage'/);
  assert.match(sql, /\(v_existing - 'normMinutes'\) \|\| p_service/);
  assert.match(sql, /'latestMigration', 19/);
  assert.match(sql, /review-fixes-019/);
});


test("security migration 020 hardens storage and blocks generic financial writes", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "020_security_hardening.sql"), "utf8");
  assert.match(sql, /split_part\(p_object_name, '\/', 4\) <> ''/);
  assert.match(sql, /v_file_name !~\*/);
  assert.match(sql, /if not v_order_exists then[\s\S]*return false/);
  assert.match(sql, /elsif v_role = 'advisor'[\s\S]*'orders'[\s\S]*elsif v_role = 'parts'/);
  assert.doesNotMatch(
    sql.match(/elsif v_role = 'advisor'[\s\S]*?elsif v_role = 'parts'/)?.[0] ?? "",
    /'payments'|'stockMovements'|'stock'/,
  );
  assert.doesNotMatch(
    sql.match(/elsif v_role = 'accountant'[\s\S]*?else\s+raise exception 'Неизвестная роль пользователя'/)?.[0] ?? "",
    /'payments'|'expenses'|'cashShifts'/,
  );
  assert.match(sql, /'latestMigration', 20/);
  assert.match(sql, /security-hardening-020/);
});


test("orphan media remains administratively removable without allowing new orphan uploads", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "020_security_hardening.sql"), "utf8");
  assert.match(sql, /if not v_order_exists then[\s\S]*v_role in \('owner', 'partner', 'advisor'\)[\s\S]*p_delete or \(not p_write and not p_delete\)/);
});
