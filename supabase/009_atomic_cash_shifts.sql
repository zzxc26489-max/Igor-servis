-- Этап 9: атомарное открытие и закрытие кассовых смен.
-- Выполнять ПОСЛЕ supabase/008_atomic_order_payments.sql.
--
-- Сервер не позволяет двум устройствам одновременно открыть разные смены
-- и пересчитывает ожидаемый остаток непосредственно перед закрытием.

create or replace function public.crm_open_cash_shift(
  p_shift_id text,
  p_opening_cash numeric,
  p_opened_by text default null
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

  if p_shift_id is null or trim(p_shift_id) = '' then
    raise exception 'Не передан идентификатор смены';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'Начальный остаток не может быть отрицательным';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift_item
    where shift_item ->> 'id' = p_shift_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift_item
    where coalesce(shift_item ->> 'closedAt', '') = ''
  ) then
    return jsonb_build_object(
      'ok', false,
      'cashConflict', true,
      'message', 'Кассовая смена уже открыта на другом устройстве',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  v_shift := jsonb_build_object(
    'id', p_shift_id,
    'openedAt', now(),
    'openedBy', coalesce(nullif(trim(p_opened_by), ''), v_display, '—'),
    'openingCash', round(p_opening_cash)
  );

  v_next := v_current.data || jsonb_build_object(
    'cashShifts',
    jsonb_build_array(v_shift) || coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)
  );

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'cash_shift_opened', v_revision, array['cashShifts']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_open_cash_shift(text, numeric, text) from public;
grant execute on function public.crm_open_cash_shift(text, numeric, text) to authenticated;


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
