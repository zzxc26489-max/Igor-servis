-- Этап 13: атомарное создание клиента, автомобиля и заказ-наряда.
-- Выполнять ПОСЛЕ supabase/012_server_capabilities.sql.
--
-- В одной транзакции проверяются дубли клиента/автомобиля, занятость подъёмника
-- и выдаются последовательные человекочитаемые номера без гонок между устройствами.

create or replace function public.crm_create_order(
  p_client jsonb,
  p_vehicle jsonb,
  p_order jsonb,
  p_existing_client_id text default null,
  p_existing_vehicle_id text default null
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
  v_client_id text;
  v_vehicle_id text;
  v_order_id text;
  v_client jsonb;
  v_vehicle jsonb;
  v_existing_client jsonb;
  v_existing_vehicle jsonb;
  v_clients jsonb;
  v_vehicles jsonb;
  v_orders jsonb;
  v_client_code text;
  v_vehicle_code text;
  v_order_number text;
  v_client_seq bigint;
  v_vehicle_seq bigint;
  v_order_seq bigint;
  v_phone_digits text;
  v_plate_norm text;
  v_vin_norm text;
  v_day text;
  v_start text;
  v_end text;
  v_start_min int;
  v_end_min int;
  v_conflict jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  if v_role not in ('owner', 'partner', 'advisor') then
    raise exception 'Этой роли недоступно создание заказ-нарядов';
  end if;

  v_client_id := coalesce(nullif(trim(p_existing_client_id), ''), nullif(trim(p_client ->> 'id'), ''));
  v_vehicle_id := coalesce(nullif(trim(p_existing_vehicle_id), ''), nullif(trim(p_vehicle ->> 'id'), ''));
  v_order_id := nullif(trim(p_order ->> 'id'), '');

  if v_client_id is null or v_vehicle_id is null or v_order_id is null then
    raise exception 'Не переданы идентификаторы клиента, автомобиля или заказа';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  -- Безопасный повтор того же запроса после сетевого таймаута.
  select item into v_conflict
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
  where item ->> 'id' = v_order_id
  limit 1;

  if v_conflict is not null then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'orderId', v_order_id,
      'orderNumber', v_conflict ->> 'number',
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_phone_digits := regexp_replace(coalesce(p_client ->> 'phone', ''), '[^0-9]', '', 'g');

  if p_existing_client_id is null or trim(p_existing_client_id) = '' then
    if v_phone_digits <> '' then
      select item into v_conflict
      from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) item
      where regexp_replace(coalesce(item ->> 'phone', ''), '[^0-9]', '', 'g') = v_phone_digits
      limit 1;

      if v_conflict is not null then
        return jsonb_build_object(
          'ok', false,
          'orderConflict', true,
          'message', format('Клиент с таким телефоном уже есть: %s', coalesce(v_conflict ->> 'name', 'без имени')),
          'revision', v_current.revision,
          'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
        );
      end if;
    end if;

    select coalesce(max(nullif(regexp_replace(coalesce(item ->> 'code', ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
      into v_client_seq
    from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) item;

    v_client_code := 'К-' || lpad(v_client_seq::text, 4, '0');
    v_client := p_client
      || jsonb_build_object(
        'id', v_client_id,
        'code', v_client_code,
        'createdAt', coalesce(nullif(p_client ->> 'createdAt', ''), to_char(current_date, 'YYYY-MM-DD'))
      );

    v_clients := coalesce(v_current.data -> 'clients', '[]'::jsonb) || jsonb_build_array(v_client);
  else
    select item into v_existing_client
    from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) item
    where item ->> 'id' = v_client_id
    limit 1;

    if v_existing_client is null then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Выбранный клиент уже изменён или удалён на другом устройстве',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    if v_phone_digits <> '' and exists (
      select 1
      from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) item
      where item ->> 'id' <> v_client_id
        and regexp_replace(coalesce(item ->> 'phone', ''), '[^0-9]', '', 'g') = v_phone_digits
    ) then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Этот телефон уже привязан к другому клиенту',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    v_client_code := v_existing_client ->> 'code';
    select jsonb_agg(
      case
        when item ->> 'id' = v_client_id then
          item || (p_client - 'id' - 'code' - 'createdAt')
        else item
      end
      order by ordinality
    )
      into v_clients
    from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb))
      with ordinality t(item, ordinality);
  end if;

  v_plate_norm := upper(regexp_replace(coalesce(p_vehicle ->> 'plate', ''), '[[:space:]-]', '', 'g'));
  v_vin_norm := upper(regexp_replace(coalesce(p_vehicle ->> 'vin', ''), '[[:space:]-]', '', 'g'));

  if p_existing_vehicle_id is null or trim(p_existing_vehicle_id) = '' then
    select item into v_conflict
    from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item
    where upper(regexp_replace(coalesce(item ->> 'plate', ''), '[[:space:]-]', '', 'g')) = v_plate_norm
       or (
         v_vin_norm <> ''
         and upper(regexp_replace(coalesce(item ->> 'vin', ''), '[[:space:]-]', '', 'g')) = v_vin_norm
       )
    limit 1;

    if v_conflict is not null then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', format('Автомобиль %s уже есть в базе', coalesce(v_conflict ->> 'plate', 'с таким VIN')),
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    select coalesce(max(nullif(regexp_replace(coalesce(item ->> 'code', ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
      into v_vehicle_seq
    from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item;

    v_vehicle_code := 'А-' || lpad(v_vehicle_seq::text, 4, '0');
    v_vehicle := p_vehicle
      || jsonb_build_object(
        'id', v_vehicle_id,
        'clientId', v_client_id,
        'code', v_vehicle_code
      );

    v_vehicles := coalesce(v_current.data -> 'vehicles', '[]'::jsonb) || jsonb_build_array(v_vehicle);
  else
    select item into v_existing_vehicle
    from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item
    where item ->> 'id' = v_vehicle_id
    limit 1;

    if v_existing_vehicle is null then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Выбранный автомобиль уже изменён или удалён на другом устройстве',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    if v_existing_vehicle ->> 'clientId' <> v_client_id then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Автомобиль больше не принадлежит выбранному клиенту',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item
      where item ->> 'id' <> v_vehicle_id
        and (
          upper(regexp_replace(coalesce(item ->> 'plate', ''), '[[:space:]-]', '', 'g')) = v_plate_norm
          or (
            v_vin_norm <> ''
            and upper(regexp_replace(coalesce(item ->> 'vin', ''), '[[:space:]-]', '', 'g')) = v_vin_norm
          )
        )
    ) then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Госномер или VIN уже привязан к другому автомобилю',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    v_vehicle_code := v_existing_vehicle ->> 'code';
    select jsonb_agg(
      case
        when item ->> 'id' = v_vehicle_id then
          item || (p_vehicle - 'id' - 'code' - 'clientId')
        else item
      end
      order by ordinality
    )
      into v_vehicles
    from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb))
      with ordinality t(item, ordinality);
  end if;

  v_day := coalesce(nullif(p_order ->> 'plannedAt', ''), left(coalesce(p_order ->> 'createdAt', ''), 10));
  v_start := nullif(p_order ->> 'scheduledStart', '');
  v_end := nullif(p_order ->> 'scheduledEnd', '');

  if p_order ? 'liftId' and v_start is not null then
    v_start_min := split_part(v_start, ':', 1)::int * 60 + split_part(v_start, ':', 2)::int;
    v_end_min := case
      when v_end is null then v_start_min + 60
      else split_part(v_end, ':', 1)::int * 60 + split_part(v_end, ':', 2)::int
    end;

    if v_end_min <= v_start_min then
      raise exception 'Некорректный интервал записи на подъёмник';
    end if;

    select item into v_conflict
    from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
    where item ->> 'status' <> 'выдан'
      and item ->> 'liftId' = p_order ->> 'liftId'
      and coalesce(nullif(item ->> 'plannedAt', ''), left(coalesce(item ->> 'createdAt', ''), 10)) = v_day
      and nullif(item ->> 'scheduledStart', '') is not null
      and (
        v_start_min <
          case
            when nullif(item ->> 'scheduledEnd', '') is null then
              (split_part(item ->> 'scheduledStart', ':', 1)::int * 60 + split_part(item ->> 'scheduledStart', ':', 2)::int) + 60
            else
              split_part(item ->> 'scheduledEnd', ':', 1)::int * 60 + split_part(item ->> 'scheduledEnd', ':', 2)::int
          end
        and
        (split_part(item ->> 'scheduledStart', ':', 1)::int * 60 + split_part(item ->> 'scheduledStart', ':', 2)::int) < v_end_min
      )
    limit 1;

    if v_conflict is not null then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', format(
          'Подъёмник уже занят заказом %s в %s',
          coalesce(v_conflict ->> 'number', 'без номера'),
          coalesce(v_conflict ->> 'scheduledStart', 'это время')
        ),
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  end if;

  select coalesce(max(nullif(regexp_replace(coalesce(item ->> 'number', ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
    into v_order_seq
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item;

  v_order_number := '№АИ-' || lpad(v_order_seq::text, 4, '0');

  v_orders := coalesce(v_current.data -> 'orders', '[]'::jsonb)
    || jsonb_build_array(
      p_order
      || jsonb_build_object(
        'id', v_order_id,
        'number', v_order_number,
        'clientId', v_client_id,
        'vehicleId', v_vehicle_id
      )
    );

  v_next := v_current.data || jsonb_build_object(
    'clients', coalesce(v_clients, '[]'::jsonb),
    'vehicles', coalesce(v_vehicles, '[]'::jsonb),
    'orders', coalesce(v_orders, '[]'::jsonb),
    'demo', false
  );

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'order_created', v_revision, array['clients', 'vehicles', 'orders']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'clientCode', v_client_code,
    'vehicleCode', v_vehicle_code,
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_create_order(jsonb, jsonb, jsonb, text, text) from public;
grant execute on function public.crm_create_order(jsonb, jsonb, jsonb, text, text) to authenticated;

create or replace function public.crm_server_capabilities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_workshop uuid;
begin
  select m.workshop_id
    into v_workshop
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  return jsonb_build_object(
    'latestMigration', 13,
    'features', jsonb_build_array(
      'role-security',
      'order-media',
      'atomic-stock-reservation',
      'atomic-order-payments',
      'atomic-cash-shifts',
      'advisor-stock-sync',
      'atomic-stock-receive-return',
      'atomic-order-create'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
