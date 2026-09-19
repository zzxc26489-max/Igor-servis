-- Этап 14: атомарное добавление, редактирование и удаление автомобиля.
-- Выполнять ПОСЛЕ supabase/013_atomic_order_create.sql.

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


create or replace function public.crm_delete_vehicle(p_vehicle_id text)
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
  v_vehicles jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'advisor') then raise exception 'Этой роли недоступно удаление автомобилей'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then raise exception 'Общая база ещё не создана'; end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) o
    where o ->> 'vehicleId' = p_vehicle_id
  ) then
    return jsonb_build_object(
      'ok', false, 'vehicleConflict', true,
      'message', 'По этому автомобилю уже есть заказ-наряды, удалить его нельзя',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb)) v
    where v ->> 'id' = p_vehicle_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
    into v_vehicles
  from jsonb_array_elements(coalesce(v_current.data -> 'vehicles', '[]'::jsonb))
    with ordinality t(item, ordinality)
  where item ->> 'id' <> p_vehicle_id;

  v_next := v_current.data || jsonb_build_object('vehicles', v_vehicles);

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'vehicle_deleted', v_revision, array['vehicles']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_delete_vehicle(text) from public;
grant execute on function public.crm_delete_vehicle(text) to authenticated;

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
    'latestMigration', 14,
    'features', jsonb_build_array(
      'role-security',
      'order-media',
      'atomic-stock-reservation',
      'atomic-order-payments',
      'atomic-cash-shifts',
      'advisor-stock-sync',
      'atomic-stock-receive-return',
      'atomic-order-create',
      'atomic-vehicle-management'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
