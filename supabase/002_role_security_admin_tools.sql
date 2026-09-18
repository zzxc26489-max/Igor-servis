-- Этап 2 серверной безопасности: роль ограничивает не только интерфейс,
-- но и данные, которые RPC отдаёт браузеру и принимает обратно.
-- Выполнять ПОСЛЕ supabase/001_crm_cloud.sql.

create or replace function public.crm_parts_orders_view(p_orders jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $
  select coalesce(
    jsonb_agg(
      jsonb_set(
        item - 'paid' - 'discount',
        '{works}',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', work ->> 'id',
              'name', work ->> 'name',
              'qty', coalesce((work ->> 'qty')::numeric, 1),
              'price', 0,
              'normMinutes', work -> 'normMinutes'
            )
          )
          from jsonb_array_elements(coalesce(item -> 'works', '[]'::jsonb)) work
        ), '[]'::jsonb),
        true
      )
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) item;
$;

revoke all on function public.crm_parts_orders_view(jsonb) from public;

create or replace function public.crm_role_view(p_data jsonb, p_role text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_employees jsonb;
  v_expenses jsonb;
begin
  if p_role in ('owner', 'partner') then
    return p_data;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item ->> 'id',
        'name', item ->> 'name',
        'role', item ->> 'role',
        'payType', 'salary',
        'payValue', 0,
        'accrued', 0,
        'paid', 0
      )
    ),
    '[]'::jsonb
  )
  into v_employees
  from jsonb_array_elements(coalesce(p_data -> 'employees', '[]'::jsonb)) item;

  if p_role = 'advisor' then
    return p_data || jsonb_build_object(
      'employees', v_employees,
      'expenses', '[]'::jsonb,
      'invoices', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_expenses
  from jsonb_array_elements(coalesce(p_data -> 'expenses', '[]'::jsonb)) item
  where item ->> 'source' in ('stock_purchase', 'supplier_refund');

  return p_data || jsonb_build_object(
    'employees', v_employees,
    'orders', public.crm_parts_orders_view(p_data -> 'orders'),
    'payments', '[]'::jsonb,
    'invoices', '[]'::jsonb,
    'expenses', v_expenses
  );
end;
$$;

revoke all on function public.crm_role_view(jsonb, text) from public;

create or replace function public.crm_merge_stock_expenses(p_current jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with hidden as (
    select item
    from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) item
    where coalesce(item ->> 'source', '') not in ('stock_purchase', 'supplier_refund')
  ),
  allowed as (
    select item
    from jsonb_array_elements(coalesce(p_incoming, '[]'::jsonb)) item
    where item ->> 'source' in ('stock_purchase', 'supplier_refund')
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from (
    select item from hidden
    union all
    select item from allowed
  ) merged;
$$;

revoke all on function public.crm_merge_stock_expenses(jsonb, jsonb) from public;

create or replace function public.crm_merge_order_parts(p_current jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with current_orders as (
    select item, ordinality
    from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) with ordinality
  )
  select coalesce(
    jsonb_agg(
      case
        when incoming.item is null then current_orders.item
        else jsonb_set(
          current_orders.item,
          '{parts}',
          coalesce(incoming.item -> 'parts', '[]'::jsonb),
          true
        )
      end
      order by current_orders.ordinality
    ),
    '[]'::jsonb
  )
  from current_orders
  left join lateral (
    select candidate as item
    from jsonb_array_elements(coalesce(p_incoming, '[]'::jsonb)) candidate
    where candidate ->> 'id' = current_orders.item ->> 'id'
    limit 1
  ) incoming on true;
$$;

revoke all on function public.crm_merge_order_parts(jsonb, jsonb) from public;

create or replace function public.crm_load_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_name text;
  v_role text;
  v_display text;
  v_state public.crm_state%rowtype;
begin
  select m.workshop_id, m.workshop_name, m.role, m.display_name
    into v_workshop, v_name, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  select * into v_state from public.crm_state where workshop_id = v_workshop;

  return jsonb_build_object(
    'ok', true,
    'workshopId', v_workshop,
    'workshopName', v_name,
    'role', v_role,
    'displayName', v_display,
    'revision', coalesce(v_state.revision, 0),
    'empty', v_state.workshop_id is null or v_state.data = '{}'::jsonb,
    'data', public.crm_role_view(coalesce(v_state.data, '{}'::jsonb), v_role)
  );
end;
$$;

revoke all on function public.crm_load_state() from public;
grant execute on function public.crm_load_state() to authenticated;

create or replace function public.crm_save_state(
  p_expected_revision bigint,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_role text;
  v_display text;
  v_current public.crm_state%rowtype;
  v_next jsonb;
  v_revision bigint;
  v_changed text[];
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    if v_role not in ('owner', 'partner') then
      raise exception 'Первичную базу должен создать владелец или партнёр';
    end if;
    if p_expected_revision <> 0 then
      return jsonb_build_object('ok', false, 'conflict', true, 'revision', 0, 'data', '{}'::jsonb);
    end if;

    insert into public.crm_state(workshop_id, data, revision, updated_at, updated_by)
    values(v_workshop, p_data, 1, now(), auth.uid())
    returning revision into v_revision;

    insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
    values(v_workshop, auth.uid(), v_display, 'database_initialized', v_revision, array['all']);

    return jsonb_build_object('ok', true, 'revision', v_revision, 'updatedAt', now());
  end if;

  if v_current.revision <> p_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'revision', v_current.revision,
      'data', public.crm_role_view(v_current.data, v_role)
    );
  end if;

  if v_role in ('owner', 'partner') then
    v_next := p_data;
  elsif v_role = 'advisor' then
    v_next := v_current.data || jsonb_build_object(
      'lifts', coalesce(p_data -> 'lifts', v_current.data -> 'lifts'),
      'clients', coalesce(p_data -> 'clients', v_current.data -> 'clients'),
      'vehicles', coalesce(p_data -> 'vehicles', v_current.data -> 'vehicles'),
      'stockMovements', coalesce(p_data -> 'stockMovements', v_current.data -> 'stockMovements'),
      'orders', coalesce(p_data -> 'orders', v_current.data -> 'orders'),
      'payments', coalesce(p_data -> 'payments', v_current.data -> 'payments')
    );
  elsif v_role = 'parts' then
    v_next := v_current.data || jsonb_build_object(
      'stock', coalesce(p_data -> 'stock', v_current.data -> 'stock'),
      'stockMovements', coalesce(p_data -> 'stockMovements', v_current.data -> 'stockMovements'),
      'orders', public.crm_merge_order_parts(v_current.data -> 'orders', p_data -> 'orders'),
      'expenses', public.crm_merge_stock_expenses(v_current.data -> 'expenses', p_data -> 'expenses')
    );
  else
    raise exception 'Неизвестная роль пользователя';
  end if;

  select coalesce(array_agg(k), '{}')
    into v_changed
  from (
    select key as k
    from (
      select jsonb_object_keys(v_current.data) as key
      union
      select jsonb_object_keys(v_next) as key
    ) keys
    where v_current.data -> key is distinct from v_next -> key
  ) changed;

  if not exists (
    select 1 from public.crm_backups
    where workshop_id = v_workshop
      and created_at > now() - interval '24 hours'
  ) then
    insert into public.crm_backups(workshop_id, revision, data, created_by, reason)
    values(v_workshop, v_current.revision, v_current.data, auth.uid(), 'automatic');
  end if;

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'state_saved', v_revision, v_changed);

  return jsonb_build_object('ok', true, 'revision', v_revision, 'updatedAt', now());
end;
$$;

revoke all on function public.crm_save_state(bigint, jsonb) from public;
grant execute on function public.crm_save_state(bigint, jsonb) to authenticated;

create or replace function public.crm_list_backups(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_role text;
  v_result jsonb;
begin
  select m.workshop_id, m.role into v_workshop, v_role
  from public.crm_my_membership() m;

  if v_workshop is null or v_role not in ('owner', 'partner') then
    raise exception 'Резервные копии доступны владельцу и партнёру';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'revision', b.revision,
        'createdAt', b.created_at,
        'createdBy', coalesce(m.display_name, '—'),
        'reason', b.reason
      )
      order by b.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select *
    from public.crm_backups
    where workshop_id = v_workshop
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) b
  left join public.crm_members m
    on m.workshop_id = b.workshop_id and m.user_id = b.created_by;

  return v_result;
end;
$$;

revoke all on function public.crm_list_backups(integer) from public;
grant execute on function public.crm_list_backups(integer) to authenticated;

create or replace function public.crm_list_audit(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_role text;
  v_result jsonb;
begin
  select m.workshop_id, m.role into v_workshop, v_role
  from public.crm_my_membership() m;

  if v_workshop is null or v_role not in ('owner', 'partner') then
    raise exception 'Журнал действий доступен владельцу и партнёру';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'actorName', coalesce(a.actor_name, '—'),
        'action', a.action,
        'revision', a.revision,
        'changedSections', a.changed_sections,
        'createdAt', a.created_at
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select *
    from public.crm_audit
    where workshop_id = v_workshop
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) a;

  return v_result;
end;
$$;

revoke all on function public.crm_list_audit(integer) from public;
grant execute on function public.crm_list_audit(integer) to authenticated;

create or replace function public.crm_restore_backup(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_role text;
  v_display text;
  v_state public.crm_state%rowtype;
  v_backup public.crm_backups%rowtype;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null or v_role not in ('owner', 'partner') then
    raise exception 'Восстановление доступно владельцу и партнёру';
  end if;

  select * into v_backup
  from public.crm_backups
  where id = p_backup_id and workshop_id = v_workshop;

  if v_backup.id is null then
    raise exception 'Резервная копия не найдена';
  end if;

  select * into v_state
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_state.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  insert into public.crm_backups(workshop_id, revision, data, created_by, reason)
  values(v_workshop, v_state.revision, v_state.data, auth.uid(), 'before_restore');

  update public.crm_state
  set data = v_backup.data,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'backup_restored', v_revision, array['all']);

  return jsonb_build_object('ok', true, 'revision', v_revision, 'updatedAt', now());
end;
$$;

revoke all on function public.crm_restore_backup(uuid) from public;
grant execute on function public.crm_restore_backup(uuid) to authenticated;
