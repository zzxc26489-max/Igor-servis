-- Роли mechanic/accountant и безопасная серверная выдача.
-- Выполнять ПОСЛЕ supabase/003_cash_shifts.sql.

alter table public.crm_members drop constraint if exists crm_members_role_check;
alter table public.crm_members
  add constraint crm_members_role_check
  check (role in ('owner', 'partner', 'advisor', 'parts', 'mechanic', 'accountant'));

create or replace function public.crm_mechanic_orders_view(p_orders jsonb, p_display text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          item - 'paid' - 'discount' - 'notes',
          '{works}',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', work ->> 'id',
                'name', work ->> 'name',
                'qty', coalesce((work ->> 'qty')::numeric, 1),
                'price', 0,
                'executor', work ->> 'executor',
                'normMinutes', work -> 'normMinutes',
                'workStatus', work -> 'workStatus',
                'workSessions', coalesce(work -> 'workSessions', '[]'::jsonb)
              )
            )
            from jsonb_array_elements(coalesce(item -> 'works', '[]'::jsonb)) work
            where work ->> 'executor' = p_display
          ), '[]'::jsonb),
          true
        ),
        '{parts}',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', part ->> 'id',
              'name', part ->> 'name',
              'sku', part ->> 'sku',
              'qty', part -> 'qty',
              'unit', part -> 'unit',
              'price', 0,
              'availability', part ->> 'availability'
            )
          )
          from jsonb_array_elements(coalesce(item -> 'parts', '[]'::jsonb)) part
        ), '[]'::jsonb),
        true
      )
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) item
  where exists (
    select 1
    from jsonb_array_elements(coalesce(item -> 'works', '[]'::jsonb)) work
    where work ->> 'executor' = p_display
  );
$$;

revoke all on function public.crm_mechanic_orders_view(jsonb, text) from public;

create or replace function public.crm_merge_mechanic_orders(
  p_current jsonb,
  p_incoming jsonb,
  p_display text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      case
        when incoming.item is null then current_order.item
        else
          jsonb_set(
            case
              when current_order.item ->> 'status' in ('запись', 'диагностика')
                   and incoming.item ->> 'status' = 'в работе'
                then jsonb_set(current_order.item, '{status}', '"в работе"'::jsonb, true)
              else current_order.item
            end,
            '{works}',
            coalesce((
              select jsonb_agg(
                case
                  when work ->> 'executor' = p_display and incoming_work.item is not null then
                    jsonb_set(
                      jsonb_set(
                        work,
                        '{workStatus}',
                        coalesce(incoming_work.item -> 'workStatus', '"planned"'::jsonb),
                        true
                      ),
                      '{workSessions}',
                      coalesce(incoming_work.item -> 'workSessions', '[]'::jsonb),
                      true
                    )
                  else work
                end
              )
              from jsonb_array_elements(coalesce(current_order.item -> 'works', '[]'::jsonb)) work
              left join lateral (
                select candidate as item
                from jsonb_array_elements(coalesce(incoming.item -> 'works', '[]'::jsonb)) candidate
                where candidate ->> 'id' = work ->> 'id'
                limit 1
              ) incoming_work on true
            ), '[]'::jsonb),
            true
          )
      end
      order by current_order.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) with ordinality current_order(item, ordinality)
  left join lateral (
    select candidate as item
    from jsonb_array_elements(coalesce(p_incoming, '[]'::jsonb)) candidate
    where candidate ->> 'id' = current_order.item ->> 'id'
    limit 1
  ) incoming on true;
$$;

revoke all on function public.crm_merge_mechanic_orders(jsonb, jsonb, text) from public;

create or replace function public.crm_merge_accountant_employees(p_current jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      case
        when incoming.item is null then current_employee.item
        else
          jsonb_set(
            jsonb_set(
              current_employee.item,
              '{paid}',
              coalesce(incoming.item -> 'paid', current_employee.item -> 'paid'),
              true
            ),
            '{lastPaidAt}',
            coalesce(incoming.item -> 'lastPaidAt', current_employee.item -> 'lastPaidAt', 'null'::jsonb),
            true
          )
      end
      order by current_employee.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) with ordinality current_employee(item, ordinality)
  left join lateral (
    select candidate as item
    from jsonb_array_elements(coalesce(p_incoming, '[]'::jsonb)) candidate
    where candidate ->> 'id' = current_employee.item ->> 'id'
    limit 1
  ) incoming on true;
$$;

revoke all on function public.crm_merge_accountant_employees(jsonb, jsonb) from public;

create or replace function public.crm_role_view_v2(p_data jsonb, p_role text, p_display text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_base jsonb;
  v_orders jsonb;
  v_vehicle_ids text[];
begin
  if p_role in ('owner', 'partner') then
    return p_data;
  end if;

  if p_role = 'mechanic' then
    v_orders := public.crm_mechanic_orders_view(p_data -> 'orders', p_display);

    select coalesce(array_agg(distinct item ->> 'vehicleId'), '{}')
    into v_vehicle_ids
    from jsonb_array_elements(v_orders) item;

    return p_data || jsonb_build_object(
      'orders', v_orders,
      'vehicles', coalesce((
        select jsonb_agg(vehicle)
        from jsonb_array_elements(coalesce(p_data -> 'vehicles', '[]'::jsonb)) vehicle
        where vehicle ->> 'id' = any(v_vehicle_ids)
      ), '[]'::jsonb),
      'clients', '[]'::jsonb,
      'services', '[]'::jsonb,
      'stock', '[]'::jsonb,
      'stockMovements', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'invoices', '[]'::jsonb,
      'cashShifts', '[]'::jsonb,
      'employees', jsonb_build_array(
        jsonb_build_object(
          'id', 'self',
          'name', p_display,
          'role', 'Механик',
          'payType', 'salary',
          'payValue', 0,
          'accrued', 0,
          'paid', 0
        )
      )
    );
  end if;

  if p_role = 'accountant' then
    return p_data || jsonb_build_object(
      'stock', '[]'::jsonb,
      'stockMovements', '[]'::jsonb
    );
  end if;

  return public.crm_role_view(p_data, p_role);
end;
$$;

revoke all on function public.crm_role_view_v2(jsonb, text, text) from public;

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
    'data', public.crm_role_view_v2(coalesce(v_state.data, '{}'::jsonb), v_role, v_display)
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
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
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
  elsif v_role = 'mechanic' then
    v_next := v_current.data || jsonb_build_object(
      'orders', public.crm_merge_mechanic_orders(v_current.data -> 'orders', p_data -> 'orders', v_display)
    );
  elsif v_role = 'accountant' then
    v_next := v_current.data || jsonb_build_object(
      'expenses', coalesce(p_data -> 'expenses', v_current.data -> 'expenses'),
      'payments', coalesce(p_data -> 'payments', v_current.data -> 'payments'),
      'invoices', coalesce(p_data -> 'invoices', v_current.data -> 'invoices'),
      'cashShifts', coalesce(p_data -> 'cashShifts', v_current.data -> 'cashShifts'),
      'employees', public.crm_merge_accountant_employees(v_current.data -> 'employees', p_data -> 'employees')
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
