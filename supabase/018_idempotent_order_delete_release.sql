-- Этап 18: идемпотентное удаление заказ-наряда и снятие резерва.
-- Выполнять ПОСЛЕ supabase/017_idempotent_reference_crud.sql.

create or replace function public.crm_release_order_part(
  p_order_id text,
  p_part_id text
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
  v_part jsonb;
  v_stock_item jsonb;
  v_parts jsonb;
  v_orders jsonb;
  v_movement_id text;
  v_movement jsonb;
  v_movements jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'advisor', 'parts') then
    raise exception 'Этой роли недоступно снятие резерва';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  select item into v_order
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
  where item ->> 'id' = p_order_id
  limit 1;

  if v_order is null then
    return jsonb_build_object(
      'ok', false, 'orderConflict', true,
      'message', 'Заказ-наряд уже удалён или не найден',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if v_order ->> 'status' = 'выдан' then
    return jsonb_build_object(
      'ok', false, 'orderConflict', true,
      'message', 'Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  select item into v_part
  from jsonb_array_elements(coalesce(v_order -> 'parts', '[]'::jsonb)) item
  where item ->> 'id' = p_part_id
  limit 1;

  -- Повтор снятия уже отсутствующей позиции безопасен.
  if v_part is null then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
    into v_parts
  from jsonb_array_elements(coalesce(v_order -> 'parts', '[]'::jsonb))
    with ordinality t(item, ordinality)
  where item ->> 'id' <> p_part_id;

  select jsonb_agg(
    case
      when item ->> 'id' = p_order_id then jsonb_set(item, '{parts}', v_parts, true)
      else item
    end
    order by ordinality
  )
    into v_orders
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb))
    with ordinality t(item, ordinality);

  v_movements := coalesce(v_current.data -> 'stockMovements', '[]'::jsonb);
  v_movement_id := 'release-part:' || p_order_id || ':' || p_part_id;

  if not exists (
    select 1 from jsonb_array_elements(v_movements) m where m ->> 'id' = v_movement_id
  ) then
    select item into v_stock_item
    from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
    where item ->> 'sku' = v_part ->> 'sku'
    limit 1;

    if v_stock_item is not null then
      v_movement := jsonb_strip_nulls(jsonb_build_object(
        'id', v_movement_id,
        'date', now(),
        'itemId', v_stock_item ->> 'id',
        'operation', 'Снят резерв',
        'qty', coalesce((v_part ->> 'qty')::numeric, 0),
        'to', v_stock_item ->> 'cell',
        'employee', coalesce(nullif(v_order ->> 'advisor', ''), v_display, '—'),
        'note', 'Снят резерв по заказу ' || coalesce(v_order ->> 'number', p_order_id)
      ));
      v_movements := jsonb_build_array(v_movement) || v_movements;
    end if;
  end if;

  v_next := v_current.data || jsonb_build_object(
    'orders', coalesce(v_orders, '[]'::jsonb),
    'stockMovements', v_movements
  );

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'order_part_released', v_revision, array['orders', 'stockMovements']);

  return jsonb_build_object(
    'ok', true, 'revision', v_revision, 'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_release_order_part(text, text) from public;
grant execute on function public.crm_release_order_part(text, text) to authenticated;


create or replace function public.crm_delete_order(p_order_id text)
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
  v_orders jsonb;
  v_part jsonb;
  v_stock_item jsonb;
  v_movements jsonb;
  v_movement_id text;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'advisor') then
    raise exception 'Этой роли недоступно удаление заказ-нарядов';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  select item into v_order
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
  where item ->> 'id' = p_order_id
  limit 1;

  -- Повтор удаления уже удалённого заказа безопасен.
  if v_order is null then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if v_order ->> 'status' = 'выдан' then
    return jsonb_build_object(
      'ok', false, 'orderConflict', true,
      'message', 'Выданный заказ нельзя удалить. История склада и денег должна сохраниться.',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if coalesce((v_order ->> 'paid')::numeric, 0) > 0
     or exists (
       select 1 from jsonb_array_elements(coalesce(v_current.data -> 'payments', '[]'::jsonb)) p
       where p ->> 'orderId' = p_order_id
     ) then
    return jsonb_build_object(
      'ok', false, 'orderConflict', true,
      'message', 'Заказ с оплатами нельзя удалить — история денег должна сохраниться.',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
    into v_orders
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb))
    with ordinality t(item, ordinality)
  where item ->> 'id' <> p_order_id;

  v_movements := coalesce(v_current.data -> 'stockMovements', '[]'::jsonb);

  for v_part in select * from jsonb_array_elements(coalesce(v_order -> 'parts', '[]'::jsonb))
  loop
    v_movement_id := 'delete-order:' || p_order_id || ':' || coalesce(v_part ->> 'id', md5(v_part::text));

    if exists (
      select 1 from jsonb_array_elements(v_movements) m where m ->> 'id' = v_movement_id
    ) then
      continue;
    end if;

    select item into v_stock_item
    from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
    where item ->> 'sku' = v_part ->> 'sku'
    limit 1;

    if v_stock_item is not null then
      v_movements :=
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'id', v_movement_id,
          'date', now(),
          'itemId', v_stock_item ->> 'id',
          'operation', 'Снят резерв',
          'qty', coalesce((v_part ->> 'qty')::numeric, 0),
          'to', v_stock_item ->> 'cell',
          'employee', coalesce(nullif(v_order ->> 'advisor', ''), v_display, '—'),
          'note', 'Заказ ' || coalesce(v_order ->> 'number', p_order_id) || ' удалён, резерв снят'
        ))) || v_movements;
    end if;
  end loop;

  v_next := v_current.data || jsonb_build_object(
    'orders', v_orders,
    'stockMovements', v_movements
  );

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'order_deleted', v_revision, array['orders', 'stockMovements']);

  return jsonb_build_object(
    'ok', true, 'revision', v_revision, 'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_delete_order(text) from public;
grant execute on function public.crm_delete_order(text) to authenticated;

create or replace function public.crm_server_capabilities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_workshop uuid;
begin
  select m.workshop_id into v_workshop from public.crm_my_membership() m;
  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  return jsonb_build_object(
    'latestMigration', 18,
    'features', jsonb_build_array(
      'role-security',
      'order-media',
      'atomic-stock-reservation',
      'atomic-order-payments',
      'atomic-cash-shifts',
      'advisor-stock-sync',
      'atomic-stock-rece-return',
      'atomic-order-create',
      'atomic-vehicle-management',
      'idempotent-financial-mutations',
      'idempotent-order-status',
      'idempotent-reference-crud',
      'idempotent-order-delete-release'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
