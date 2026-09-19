-- Этап 11: атомарная приёмка и возврат поставщику.
-- Выполнять ПОСЛЕ supabase/010_advisor_stock_issue_sync.sql.
--
-- Операции склада выполняются под блокировкой общей crm_state, поэтому
-- одновременная приёмка/возврат с разных устройств не теряет остатки.

create or replace function public.crm_receive_stock(
  p_item jsonb,
  p_qty numeric,
  p_unit_price numeric,
  p_movement_id text,
  p_expense_id text default null,
  p_expense_code text default null,
  p_create_expense boolean default false,
  p_expense_method text default null,
  p_employee text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_workshop uuid;
  v_role text;
  v_display text;
  v_current public.crm_state%rowtype;
  v_existing jsonb;
  v_item_id text;
  v_old_qty numeric := 0;
  v_new_qty numeric := 0;
  v_old_price numeric := 0;
  v_new_price numeric := 0;
  v_on_order numeric := 0;
  v_remaining_on_order numeric := 0;
  v_total numeric := 0;
  v_shift_id text;
  v_next_item jsonb;
  v_stock jsonb;
  v_movement jsonb;
  v_expense jsonb;
  v_next jsonb;
  v_revision bigint;
  v_cell text;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  if v_role not in ('owner', 'partner', 'parts') then
    raise exception 'Этой роли недоступна приёмка склада';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Количество должно быть больше нуля';
  end if;

  if p_unit_price is null or p_unit_price < 0 or p_unit_price > 10000000 then
    raise exception 'Цена должна быть от 0 до 10 млн ₽';
  end if;

  if coalesce(trim(p_item ->> 'sku'), '') = '' or coalesce(trim(p_item ->> 'name'), '') = '' then
    raise exception 'Укажите артикул и название';
  end if;

  if coalesce(trim(p_movement_id), '') = '' then
    raise exception 'Не передан идентификатор движения';
  end if;

  if p_create_expense and p_expense_method not in ('cash', 'terminal', 'transfer') then
    raise exception 'Неизвестный способ оплаты поставки';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  -- Идемпотентный повтор после сетевого таймаута.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'stockMovements', '[]'::jsonb)) movement
    where movement ->> 'id' = p_movement_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  select item into v_existing
  from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
  where item ->> 'id' = p_item ->> 'id'
     or lower(coalesce(item ->> 'sku', '')) = lower(p_item ->> 'sku')
  limit 1;

  v_item_id := coalesce(v_existing ->> 'id', p_item ->> 'id');
  if coalesce(trim(v_item_id), '') = '' then
    raise exception 'Не передан идентификатор складской позиции';
  end if;

  v_cell := nullif(trim(coalesce(p_item ->> 'cell', '')), '');
  if v_cell is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
    where item ->> 'id' <> v_item_id
      and item ->> 'cell' = v_cell
  ) then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', format('Ячейка %s уже занята другой позицией', v_cell),
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  if p_create_expense and p_expense_method = 'cash' then
    select shift ->> 'id'
      into v_shift_id
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift
    where coalesce(shift ->> 'closedAt', '') = ''
    order by shift ->> 'openedAt' desc
    limit 1;

    if v_shift_id is null then
      return jsonb_build_object(
        'ok', false,
        'stockConflict', true,
        'message', 'Для оплаты поставки наличными сначала откройте кассовую смену',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
        'updatedAt', v_current.updated_at
      );
    end if;
  end if;

  v_old_qty := coalesce((v_existing ->> 'qty')::numeric, 0);
  v_old_price := coalesce((v_existing ->> 'purchasePrice')::numeric, 0);
  v_new_qty := v_old_qty + p_qty;
  v_total := round(p_qty * p_unit_price);
  v_new_price := case
    when p_unit_price > 0 and v_new_qty > 0
      then round((v_old_qty * v_old_price + v_total) / v_new_qty)
    else v_old_price
  end;
  v_on_order := coalesce((v_existing ->> 'onOrderQty')::numeric, 0);
  v_remaining_on_order := greatest(0, v_on_order - p_qty);

  if v_existing is null then
    v_next_item := jsonb_strip_nulls(
      p_item ||
      jsonb_build_object(
        'id', v_item_id,
        'qty', p_qty,
        'purchasePrice', p_unit_price,
        'lastPurchasePrice', p_unit_price,
        'lastPurchaseAt', now()
      )
    );
  else
    v_next_item :=
      (v_existing - 'onOrderQty' - 'supplyStatus' - 'orderedAt' - 'expectedAt') ||
      jsonb_strip_nulls(jsonb_build_object(
        'barcode', coalesce(nullif(p_item ->> 'barcode', ''), v_existing ->> 'barcode'),
        'brand', coalesce(nullif(p_item ->> 'brand', ''), v_existing ->> 'brand'),
        'category', coalesce(nullif(p_item ->> 'category', ''), v_existing ->> 'category'),
        'unit', coalesce(nullif(p_item ->> 'unit', ''), v_existing ->> 'unit'),
        'cell', coalesce(nullif(p_item ->> 'cell', ''), v_existing ->> 'cell'),
        'minQty', coalesce((p_item ->> 'minQty')::numeric, (v_existing ->> 'minQty')::numeric, 0),
        'supplier', coalesce(nullif(p_item ->> 'supplier', ''), v_existing ->> 'supplier'),
        'qty', v_new_qty,
        'purchasePrice', v_new_price,
        'lastPurchasePrice', case when p_unit_price > 0 then p_unit_price else null end,
        'lastPurchaseAt', case when p_unit_price > 0 then now() else null end
      ));

    if v_remaining_on_order > 0 then
      v_next_item := v_next_item || jsonb_build_object(
        'onOrderQty', v_remaining_on_order,
        'supplyStatus', v_existing -> 'supplyStatus',
        'orderedAt', v_existing -> 'orderedAt',
        'expectedAt', v_existing -> 'expectedAt'
      );
    end if;
  end if;

  if v_existing is null then
    v_stock := coalesce(v_current.data -> 'stock', '[]'::jsonb) || jsonb_build_array(v_next_item);
  else
    select jsonb_agg(
      case when item ->> 'id' = v_item_id then v_next_item else item end
      order by ordinality
    )
      into v_stock
    from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb))
      with ordinality t(item, ordinality);
  end if;

  v_movement := jsonb_strip_nulls(jsonb_build_object(
    'id', p_movement_id,
    'date', now(),
    'itemId', v_item_id,
    'operation', 'Приёмка',
    'qty', p_qty,
    'to', nullif(p_item ->> 'cell', ''),
    'employee', coalesce(nullif(trim(p_employee), ''), v_display, '—'),
    'unitPrice', p_unit_price,
    'amount', v_total,
    'note', nullif(trim(coalesce(p_note, '')), '')
  ));

  v_next := v_current.data || jsonb_build_object(
    'stock', coalesce(v_stock, '[]'::jsonb),
    'stockMovements',
      jsonb_build_array(v_movement)
      || coalesce(v_current.data -> 'stockMovements', '[]'::jsonb)
  );

  if p_create_expense and v_total > 0 then
    if coalesce(trim(p_expense_id), '') = '' then
      raise exception 'Не передан идентификатор расхода';
    end if;

    v_expense := jsonb_strip_nulls(jsonb_build_object(
      'id', p_expense_id,
      'code', nullif(trim(coalesce(p_expense_code, '')), ''),
      'date', to_char(current_date, 'YYYY-MM-DD'),
      'category', 'Закупка запчастей',
      'description', format('Приёмка: %s — %s %s', p_item ->> 'name', p_qty, coalesce(p_item ->> 'unit', 'шт.')),
      'amount', v_total,
      'counterparty', coalesce(nullif(p_item ->> 'supplier', ''), 'Поставщик'),
      'status', 'Оплачено',
      'source', 'stock_purchase',
      'paymentMethod', p_expense_method,
      'shiftId', case when p_expense_method = 'cash' then v_shift_id else null end,
      'itemId', v_item_id
    ));

    v_next := v_next || jsonb_build_object(
      'expenses',
      jsonb_build_array(v_expense)
      || coalesce(v_current.data -> 'expenses', '[]'::jsonb)
    );
  end if;

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(
    v_workshop,
    auth.uid(),
    v_display,
    'stock_received',
    v_revision,
    case when p_create_expense and v_total > 0
      then array['stock', 'stockMovements', 'expenses']
      else array['stock', 'stockMovements']
    end
  );

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_receive_stock(jsonb, numeric, numeric, text, text, text, boolean, text, text, text) from public;
grant execute on function public.crm_receive_stock(jsonb, numeric, numeric, text, text, text, boolean, text, text, text) to authenticated;


create or replace function public.crm_return_stock_supplier(
  p_item_id text,
  p_qty numeric,
  p_unit_price numeric,
  p_supplier text,
  p_employee text,
  p_reason text,
  p_movement_id text,
  p_expense_id text,
  p_expense_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_workshop uuid;
  v_role text;
  v_display text;
  v_current public.crm_state%rowtype;
  v_item jsonb;
  v_stock_qty numeric := 0;
  v_reserved numeric := 0;
  v_available numeric := 0;
  v_amount numeric := 0;
  v_stock jsonb;
  v_movement jsonb;
  v_expense jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  if v_role not in ('owner', 'partner', 'parts') then
    raise exception 'Этой роли недоступен возврат поставщику';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Количество должно быть больше нуля';
  end if;

  if p_unit_price is null or p_unit_price < 0 or p_unit_price > 10000000 then
    raise exception 'Цена должна быть от 0 до 10 млн ₽';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'stockMovements', '[]'::jsonb)) movement
    where movement ->> 'id' = p_movement_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  select item into v_item
  from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
  where item ->> 'id' = p_item_id
  limit 1;

  if v_item is null then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', 'Складская позиция уже изменена или не найдена',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  v_stock_qty := coalesce((v_item ->> 'qty')::numeric, 0);

  select coalesce(sum(coalesce((part ->> 'qty')::numeric, 0)), 0)
    into v_reserved
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) order_item
  cross join lateral jsonb_array_elements(coalesce(order_item -> 'parts', '[]'::jsonb)) part
  where order_item ->> 'status' <> 'выдан'
    and part ->> 'sku' = v_item ->> 'sku';

  v_available := v_stock_qty - v_reserved;

  if p_qty > v_available + 0.0001 then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', format(
        'Свободно только %s %s: %s уже в резерве',
        v_available,
        coalesce(v_item ->> 'unit', 'шт.'),
        v_reserved
      ),
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  v_amount := round(p_qty * p_unit_price);

  select jsonb_agg(
    case
      when item ->> 'id' = p_item_id
        then jsonb_set(item, '{qty}', to_jsonb(v_stock_qty - p_qty), true)
      else item
    end
    order by ordinality
  )
    into v_stock
  from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb))
    with ordinality t(item, ordinality);

  v_movement := jsonb_strip_nulls(jsonb_build_object(
    'id', p_movement_id,
    'date', now(),
    'itemId', p_item_id,
    'operation', 'Возврат поставщику',
    'qty', p_qty,
    'from', v_item ->> 'cell',
    'employee', coalesce(nullif(trim(p_employee), ''), v_display, '—'),
    'unitPrice', p_unit_price,
    'amount', v_amount,
    'note', nullif(trim(coalesce(p_reason, '')), '')
  ));

  v_expense := jsonb_strip_nulls(jsonb_build_object(
    'id', p_expense_id,
    'code', nullif(trim(coalesce(p_expense_code, '')), ''),
    'date', to_char(current_date, 'YYYY-MM-DD'),
    'category', 'Возврат поставщику',
    'description', format('Возврат: %s — %s %s', v_item ->> 'name', p_qty, coalesce(v_item ->> 'unit', 'шт.')),
    'amount', v_amount,
    'counterparty', coalesce(nullif(trim(p_supplier), ''), nullif(v_item ->> 'supplier', ''), 'Поставщик'),
    'status', 'Ждём возврат',
    'source', 'supplier_refund',
    'itemId', p_item_id,
    'comment', nullif(trim(coalesce(p_reason, '')), '')
  ));

  v_next := v_current.data || jsonb_build_object(
    'stock', coalesce(v_stock, '[]'::jsonb),
    'stockMovements',
      jsonb_build_array(v_movement)
      || coalesce(v_current.data -> 'stockMovements', '[]'::jsonb),
    'expenses',
      jsonb_build_array(v_expense)
      || coalesce(v_current.data -> 'expenses', '[]'::jsonb)
  );

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'stock_returned_supplier', v_revision, array['stock', 'stockMovements', 'expenses']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_return_stock_supplier(text, numeric, numeric, text, text, text, text, text, text) from public;
grant execute on function public.crm_return_stock_supplier(text, numeric, numeric, text, text, text, text, text, text) to authenticated;
