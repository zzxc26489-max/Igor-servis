-- Этап 19: исправления ревью серверных RPC.
-- Выполнять ПОСЛЕ supabase/018_idempotent_order_delete_release.sql.
--
-- 1) Корректный пересчёт наличной кассы для расходов без source.
-- 2) Явная очистка optional-полей клиента, автомобиля и услуги.
-- Повторно определяем функции, чтобы исправление применилось и к уже
-- существующей базе, где 009/014/017 были выполнены раньше.

create or replace function public.crm_close_cash_shift(
  p_shift_id text,
  p_counted_cash numeric,
  p_closed_by text default null,
  p_comment text default null
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
  v_shift jsonb;
  v_opening numeric := 0;
  v_cash_payments numeric := 0;
  v_cash_refunds numeric := 0;
  v_cash_expenses numeric := 0;
  v_supplier_refunds numeric := 0;
  v_expected numeric := 0;
  v_difference numeric := 0;
  v_shifts jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  if v_role not in ('owner', 'partner', 'accountant') then
    raise exception 'Этой роли недоступно управление кассовой сменой';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Фактический остаток не может быть отрицательным';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  select shift_item into v_shift
  from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift_item
  where shift_item ->> 'id' = p_shift_id
  limit 1;

  if v_shift is null then
    return jsonb_build_object(
      'ok', false,
      'cashConflict', true,
      'message', 'Открытая кассовая смена не найдена',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  if coalesce(v_shift ->> 'closedAt', '') <> '' then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  v_opening := coalesce((v_shift ->> 'openingCash')::numeric, 0);

  select
    coalesce(sum(case when coalesce(payment ->> 'kind', 'payment') <> 'refund' then (payment ->> 'amount')::numeric else 0 end), 0),
    coalesce(sum(case when payment ->> 'kind' = 'refund' then (payment ->> 'amount')::numeric else 0 end), 0)
  into v_cash_payments, v_cash_refunds
  from jsonb_array_elements(coalesce(v_current.data -> 'payments', '[]'::jsonb)) payment
  where payment ->> 'shiftId' = p_shift_id
    and payment ->> 'method' = 'cash';

  select
    coalesce(sum(case
      when coalesce(expense ->> 'source', '') <> 'supplier_refund'
        and expense ->> 'status' = 'Оплачено'
      then (expense ->> 'amount')::numeric else 0 end), 0),
    coalesce(sum(case
      when expense ->> 'source' = 'supplier_refund'
        and expense ->> 'status' = 'Возвращено'
      then (expense ->> 'amount')::numeric else 0 end), 0)
  into v_cash_expenses, v_supplier_refunds
  from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb)) expense
  where expense ->> 'shiftId' = p_shift_id
    and expense ->> 'paymentMethod' = 'cash';

  v_expected := v_opening + v_cash_payments - v_cash_refunds - v_cash_expenses + v_supplier_refunds;
  v_difference := round(p_counted_cash) - v_expected;

  if abs(v_difference) > 0.0001 and coalesce(trim(p_comment), '') = '' then
    return jsonb_build_object(
      'ok', false,
      'cashConflict', true,
      'message', 'При расхождении нужен комментарий',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at,
      'expectedCash', v_expected
    );
  end if;

  select jsonb_agg(
    case
      when shift_item ->> 'id' = p_shift_id then
        shift_item || jsonb_build_object(
          'closedAt', now(),
          'closedBy', coalesce(nullif(trim(p_closed_by), ''), v_display, '—'),
          'countedCash', round(p_counted_cash)
        ) || case
          when coalesce(trim(p_comment), '') <> '' then jsonb_build_object('comment', trim(p_comment))
          else '{}'::jsonb
        end
      else shift_item
    end
    order by ordinality
  )
    into v_shifts
  from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb))
    with ordinality t(shift_item, ordinality);

  v_next := v_current.data || jsonb_build_object('cashShifts', coalesce(v_shifts, '[]'::jsonb));

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'cash_shift_closed', v_revision, array['cashShifts']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'expectedCash', v_expected,
    'difference', v_difference,
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_close_cash_shift(text, numeric, text, text) from public;
grant execute on function public.crm_close_cash_shift(text, numeric, text, text) to authenticated;

create or replace function public.crm_save_vehicle(
  p_vehicle jsonb,
  p_create boolean default false
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
  v_vehicle_id text;
  v_client_id text;
  v_existing jsonb;
  v_conflict jsonb;
  v_plate text;
  v_vin text;
  v_code text;
  v_seq bigint;
  v_saved jsonb;
  v_vehicles jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'advisor') then raise exception 'Этой роли недоступно изменение автомобилей'; end if;

  v_vehicle_id := nullif(trim(p_vehicle ->> 'id'), '');
  v_client_id := nullif(trim(p_vehicle ->> 'clientId'), '');
  if v_vehicle_id is null or v_client_id is null then raise exception 'Не передан автомобиль или клиент'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then raise exception 'Общая база ещё не создана'; end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) c
    where c ->> 'id' = v_client_id
  ) then
    return jsonb_build_object(
      'ok', false, 'vehicleConflict', true,
      'message', 'Клиент уже изменён или удалён на другом устройстве',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  select item into v_existing
  from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item
  where item ->> 'id' = v_vehicle_id
  limit 1;

  if p_create and v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'vehicleId', v_vehicle_id,
      'vehicleCode', v_existing ->> 'code',
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  if not p_create and v_existing is null then
    return jsonb_build_object(
      'ok', false, 'vehicleConflict', true,
      'message', 'Автомобиль уже удалён на другом устройстве',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if not p_create and v_existing ->> 'clientId' <> v_client_id then
    return jsonb_build_object(
      'ok', false, 'vehicleConflict', true,
      'message', 'Автомобиль больше не принадлежит выбранному клиенту',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_plate := upper(regexp_replace(coalesce(p_vehicle ->> 'plate', ''), '[[:space:]-]', '', 'g'));
  v_vin := upper(regexp_replace(coalesce(p_vehicle ->> 'vin', ''), '[[:space:]-]', '', 'g'));

  if v_plate = '' then raise exception 'Госномер не заполнен'; end if;

  select item into v_conflict
  from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item
  where item ->> 'id' <> v_vehicle_id
    and (
      upper(regexp_replace(coalesce(item ->> 'plate', ''), '[[:space:]-]', '', 'g')) = v_plate
      or (
        v_vin <> ''
        and upper(regexp_replace(coalesce(item ->> 'vin', ''), '[[:space:]-]', '', 'g')) = v_vin
      )
    )
  limit 1;

  if v_conflict is not null then
    return jsonb_build_object(
      'ok', false, 'vehicleConflict', true,
      'message', format('Автомобиль %s уже есть в базе', coalesce(v_conflict ->> 'plate', 'с таким VIN')),
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if p_create then
    select coalesce(max(nullif(regexp_replace(coalesce(item ->> 'code', ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
      into v_seq
    from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) item;
    v_code := 'А-' || lpad(v_seq::text, 4, '0');
    v_saved := p_vehicle || jsonb_build_object('code', v_code);
    v_vehicles := coalesce(v_current.data -> 'vehicles', '[]'::jsonb) || jsonb_build_array(v_saved);
  else
    v_code := v_existing ->> 'code';
    -- p_vehicle — полный снимок редактируемого автомобиля. Ключи с undefined
    -- не попадают в JSON, поэтому заранее убираем необязательные поля:
    -- их отсутствие означает явную очистку значения пользователем.
    v_saved :=
      (v_existing
        - 'vin'
        - 'mileage'
        - 'year'
        - 'color'
        - 'engine'
        - 'transmission'
        - 'nextServiceDate'
        - 'nextServiceMileage')
      || (p_vehicle - 'code');
    select jsonb_agg(
      case when item ->> 'id' = v_vehicle_id then v_saved else item end
      order by ordinality
    )
      into v_vehicles
    from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb))
      with ordinality t(item, ordinality);
  end if;

  v_next := v_current.data || jsonb_build_object('vehicles', coalesce(v_vehicles, '[]'::jsonb), 'demo', false);

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, case when p_create then 'vehicle_created' else 'vehicle_updated' end, v_revision, array['vehicles']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'vehicleId', v_vehicle_id,
    'vehicleCode', v_code,
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_save_vehicle(jsonb, boolean) from public;
grant execute on function public.crm_save_vehicle(jsonb, boolean) to authenticated;

create or replace function public.crm_update_client(p_client jsonb)
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
  v_existing jsonb;
  v_phone text;
  v_clients jsonb;
  v_saved jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'advisor') then raise exception 'Этой роли недоступно изменение клиентов'; end if;

  v_client_id := nullif(trim(p_client ->> 'id'), '');
  if v_client_id is null then raise exception 'Не передан идентификатор клиента'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  select item into v_existing
  from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) item
  where item ->> 'id' = v_client_id
  limit 1;

  if v_existing is null then
    return jsonb_build_object(
      'ok', false, 'referenceConflict', true,
      'message', 'Клиент уже удалён или изменён на другом устройстве',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_phone := regexp_replace(coalesce(p_client ->> 'phone', ''), '[^0-9]', '', 'g');
  if v_phone = '' then raise exception 'Телефон клиента обязателен'; end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb)) item
    where item ->> 'id' <> v_client_id
      and regexp_replace(coalesce(item ->> 'phone', ''), '[^0-9]', '', 'g') = v_phone
  ) then
    return jsonb_build_object(
      'ok', false, 'referenceConflict', true,
      'message', 'Такой телефон уже указан у другого клиента',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  -- p_client приходит как полный снимок формы. Отсутствующий optional-ключ
  -- означает, что пользователь очистил поле, а не что старое значение надо сохранить.
  v_saved :=
    (v_existing
      - 'phone2'
      - 'email'
      - 'birthday'
      - 'source'
      - 'discountPercent'
      - 'notes'
      - 'isRegular')
    || (p_client - 'code' - 'createdAt');

  -- Повтор точно того же сохранения — успешный no-op без новой ревизии.
  if v_saved = v_existing then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  select jsonb_agg(
    case when item ->> 'id' = v_client_id then v_saved else item end
    order by ordinality
  )
    into v_clients
  from jsonb_array_elements(coalesce(v_current.data -> 'clients', '[]'::jsonb))
    with ordinality t(item, ordinality);

  v_next := v_current.data || jsonb_build_object('clients', coalesce(v_clients, '[]'::jsonb));

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'client_updated', v_revision, array['clients']);

  return jsonb_build_object(
    'ok', true, 'revision', v_revision, 'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_update_client(jsonb) from public;
grant execute on function public.crm_update_client(jsonb) to authenticated;

create or replace function public.crm_save_service(
  p_service jsonb,
  p_delete boolean default false
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
  v_id text;
  v_existing jsonb;
  v_name text;
  v_category text;
  v_saved jsonb;
  v_services jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner') then raise exception 'Этой роли недоступно изменение прайс-листа'; end if;

  v_id := nullif(trim(p_service ->> 'id'), '');
  if v_id is null then raise exception 'Не передан идентификатор услуги'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  select item into v_existing
  from jsonb_array_elements(coalesce(v_current.data -> 'services', '[]'::jsonb)) item
  where item ->> 'id' = v_id
  limit 1;

  if p_delete then
    if v_existing is null then
      return jsonb_build_object(
        'ok', true,
        'revision', v_current.revision,
        'updatedAt', v_current.updated_at,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
      into v_services
    from jsonb_array_elements(coalesce(v_current.data -> 'services', '[]'::jsonb))
      with ordinality t(item, ordinality)
    where item ->> 'id' <> v_id;
  else
    v_name := lower(trim(coalesce(p_service ->> 'name', '')));
    v_category := lower(trim(coalesce(p_service ->> 'category', '')));
    if v_name = '' or v_category = '' then raise exception 'Название и категория услуги обязательны'; end if;
    if coalesce((p_service ->> 'price')::numeric, 0) <= 0 then raise exception 'Цена услуги должна быть больше нуля'; end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_current.data -> 'services', '[]'::jsonb)) item
      where item ->> 'id' <> v_id
        and lower(trim(coalesce(item ->> 'name', ''))) = v_name
        and lower(trim(coalesce(item ->> 'category', ''))) = v_category
    ) then
      return jsonb_build_object(
        'ok', false, 'referenceConflict', true,
        'message', 'Такая услуга уже есть в этой категории',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    v_saved := p_service;

    if v_existing is null then
      v_services := coalesce(v_current.data -> 'services', '[]'::jsonb) || jsonb_build_array(v_saved);
    else
      -- Полный снимок услуги: отсутствие normMinutes означает очистку норматива.
      v_saved := (v_existing - 'normMinutes') || p_service;
      if v_saved = v_existing then
        return jsonb_build_object(
          'ok', true,
          'revision', v_current.revision,
          'updatedAt', v_current.updated_at,
          'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
        );
      end if;

      select jsonb_agg(
        case when item ->> 'id' = v_id then v_saved else item end
        order by ordinality
      )
        into v_services
      from jsonb_array_elements(coalesce(v_current.data -> 'services', '[]'::jsonb))
        with ordinality t(item, ordinality);
    end if;
  end if;

  v_next := v_current.data || jsonb_build_object('services', coalesce(v_services, '[]'::jsonb));

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(
    v_workshop, auth.uid(), v_display,
    case when p_delete then 'service_deleted'
         when v_existing is null then 'service_created'
         else 'service_updated' end,
    v_revision, array['services']
  );

  return jsonb_build_object(
    'ok', true, 'revision', v_revision, 'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_save_service(jsonb, boolean) from public;
grant execute on function public.crm_save_service(jsonb, boolean) to authenticated;

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
    'latestMigration', 19,
    'features', jsonb_build_array(
      'role-security',
      'order-media',
      'atomic-stock-reservation',
      'atomic-order-payments',
      'atomic-cash-shifts',
      'advisor-stock-sync',
      'atomic-stock-receive-return',
      'atomic-order-create',
      'atomic-vehicle-management',
      'idempotent-financial-mutations',
      'idempotent-order-status',
      'idempotent-reference-crud',
      'idempotent-order-delete-release',
      'review-fixes-019'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
