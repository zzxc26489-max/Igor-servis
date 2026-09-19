-- Этап 7: атомарный резерв запчастей на сервере.
-- Выполнять ПОСЛЕ supabase/006_security_hardening.sql.
--
-- Резерв выполняется внутри одной транзакции под блокировкой строки crm_state.
-- Два сотрудника не смогут одновременно зарезервировать одну и ту же последнюю единицу.

create or replace function public.crm_reserve_stock_part(
  p_order_id text,
  p_item_id text,
  p_qty numeric,
  p_price numeric,
  p_part_id text,
  p_movement_id text
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
  v_order jsonb;
  v_item jsonb;
  v_sku text;
  v_stock_qty numeric;
  v_reserved numeric;
  v_available numeric;
  v_part jsonb;
  v_movement jsonb;
  v_orders jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  if v_role not in ('owner', 'partner', 'advisor', 'parts') then
    raise exception 'Этой роли недоступен резерв запчастей';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  -- Повтор того же запроса безопасен: если part_id уже записан, просто
  -- возвращаем актуальное состояние без второго резерва.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) order_item
    cross join lateral jsonb_array_elements(coalesce(order_item -> 'parts', '[]'::jsonb)) part
    where part ->> 'id' = p_part_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  select item into v_order
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
  where item ->> 'id' = p_order_id
  limit 1;

  select item into v_item
  from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
  where item ->> 'id' = p_item_id
  limit 1;

  if v_order is null or v_item is null then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', 'Позиция или заказ уже изменены другим сотрудником',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if v_order ->> 'status' = 'выдан' then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', 'Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', 'Количество должно быть больше нуля',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if p_price is null or p_price <= 0 or p_price > 10000000 then
    return jsonb_build_object(
      'ok', false,
      'stockConflict', true,
      'message', 'Цена должна быть больше нуля и не более 10 млн ₽',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_sku := v_item ->> 'sku';
  v_stock_qty := coalesce((v_item ->> 'qty')::numeric, 0);

  select coalesce(sum(coalesce((part ->> 'qty')::numeric, 0)), 0)
    into v_reserved
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) order_item
  cross join lateral jsonb_array_elements(coalesce(order_item -> 'parts', '[]'::jsonb)) part
  where order_item ->> 'status' <> 'выдан'
    and part ->> 'sku' = v_sku;

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
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_part := jsonb_build_object(
    'id', p_part_id,
    'name', v_item ->> 'name',
    'sku', v_sku,
    'qty', p_qty,
    'unit', v_item ->> 'unit',
    'price', p_price,
    'purchasePrice', coalesce((v_item ->> 'purchasePrice')::numeric, 0),
    'purchasePriceEstimated', false,
    'availability', 'reserved'
  );

  select jsonb_agg(
    case
      when order_item.item ->> 'id' = p_order_id then
        jsonb_set(
          order_item.item,
          '{parts}',
          coalesce(order_item.item -> 'parts', '[]'::jsonb) || jsonb_build_array(v_part),
          true
        )
      else order_item.item
    end
    order by order_item.ordinality
  )
    into v_orders
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb))
    with ordinality order_item(item, ordinality);

  v_movement := jsonb_build_object(
    'id', p_movement_id,
    'date', now(),
    'itemId', p_item_id,
    'operation', 'Резерв',
    'qty', p_qty,
    'from', v_item ->> 'cell',
    'employee', coalesce(nullif(v_order ->> 'advisor', ''), v_display, '—'),
    'note', 'Заказ-наряд ' || coalesce(v_order ->> 'number', p_order_id)
  );

  v_next := v_current.data || jsonb_build_object(
    'orders', coalesce(v_orders, '[]'::jsonb),
    'stockMovements',
      jsonb_build_array(v_movement)
      || coalesce(v_current.data -> 'stockMovements', '[]'::jsonb)
  );

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'stock_reserved', v_revision, array['orders', 'stockMovements']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_reserve_stock_part(text, text, numeric, numeric, text, text) from public;
grant execute on function public.crm_reserve_stock_part(text, text, numeric, numeric, text, text) to authenticated;
