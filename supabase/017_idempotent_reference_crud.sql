-- Этап 17: идемпотентные изменения клиента и прайс-листа.
-- Выполнять ПОСЛЕ supabase/016_idempotent_order_status.sql.

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
    'latestMigration', 17,
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
      'idempotent-reference-crud'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
