-- Этап 21: клиентский follow-up и цифровой осмотр.
-- Выполнять ПОСЛЕ supabase/020_security_hardening.sql.

-- Механик может менять inspection только у заказа, где ему назначена хотя бы одна работа.
-- Остальные поля по-прежнему проходят через crm_merge_mechanic_orders и не расширяются.
create or replace function public.crm_merge_mechanic_inspection(
  p_current jsonb,
  p_incoming jsonb,
  p_display text
)
returns jsonb
language sql
volatile
set search_path = public
as $fn$
  select coalesce(
    jsonb_agg(
      case
        when incoming.item is null or not permission.allowed then current_order.item
        else jsonb_set(
          current_order.item,
          '{inspection}',
          coalesce(incoming.item -> 'inspection', current_order.item -> 'inspection', '[]'::jsonb),
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
  ) incoming on true
  left join lateral (
    select exists (
      select 1
      from jsonb_array_elements(coalesce(current_order.item -> 'works', '[]'::jsonb)) work
      where work ->> 'executor' = p_display
    ) as allowed
  ) permission on true;
$fn$;

revoke all on function public.crm_merge_mechanic_inspection(jsonb, jsonb, text) from public;

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
    -- Оплаты, касса и склад не принимаются через общий save_state:
    -- для них существуют атомарные RPC с повторной серверной проверкой.
    v_next := v_current.data || jsonb_build_object(
      'lifts', coalesce(p_data -> 'lifts', v_current.data -> 'lifts'),
      'clients', coalesce(p_data -> 'clients', v_current.data -> 'clients'),
      'vehicles', coalesce(p_data -> 'vehicles', v_current.data -> 'vehicles'),
      'orders', coalesce(p_data -> 'orders', v_current.data -> 'orders')
    );
  elsif v_role = 'parts' then
    -- Денежные расходы поставщика подтверждаются отдельными RPC.
    v_next := v_current.data || jsonb_build_object(
      'stock', coalesce(p_data -> 'stock', v_current.data -> 'stock'),
      'stockMovements', coalesce(p_data -> 'stockMovements', v_current.data -> 'stockMovements'),
      'orders', public.crm_merge_order_parts(v_current.data -> 'orders', p_data -> 'orders')
    );
  elsif v_role = 'mechanic' then
    v_next := v_current.data || jsonb_build_object(
      'orders', public.crm_merge_mechanic_inspection(
        public.crm_merge_mechanic_orders(v_current.data -> 'orders', p_data -> 'orders', v_display),
        p_data -> 'orders',
        v_display
      )
    );
  elsif v_role = 'accountant' then
    -- Бухгалтер видит финансы, но денежные движения меняет только через
    -- атомарные RPC (расход, зарплата, возврат, касса, оплата клиента).
    v_next := v_current.data || jsonb_build_object(
      'invoices', coalesce(p_data -> 'invoices', v_current.data -> 'invoices'),
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
    'latestMigration', 21,
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
      'review-fixes-019',
      'security-hardening-020',
      'customer-followup-021'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
