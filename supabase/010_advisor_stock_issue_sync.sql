-- Этап 10: исправление сохранения склада приёмщиком.
-- Выполнять ПОСЛЕ supabase/009_atomic_cash_shifts.sql.
--
-- Приёмщик имеет право выдавать автомобиль. Выдача меняет фактический остаток
-- склада, поэтому crm_save_state обязан принимать секцию stock вместе с orders
-- и stockMovements. Иначе списание остаётся только в браузере.

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
      'stock', coalesce(p_data -> 'stock', v_current.data -> 'stock'),
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
