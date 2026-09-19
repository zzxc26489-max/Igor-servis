-- Этап 15: идемпотентные денежные операции.
-- Выполнять ПОСЛЕ supabase/014_atomic_vehicle_management.sql.
--
-- Защищает ручные расходы, выплаты зарплаты и подтверждение возврата поставщика
-- от повторов после таймаута, двойных нажатий и гонок между устройствами.

create or replace function public.crm_add_expense(p_expense jsonb)
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
  v_amount numeric;
  v_method text;
  v_shift_id text;
  v_seq bigint;
  v_code text;
  v_expense jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'accountant') then raise exception 'Этой роли недоступно добавление расходов'; end if;

  v_id := nullif(trim(p_expense ->> 'id'), '');
  v_amount := coalesce((p_expense ->> 'amount')::numeric, 0);
  v_method := p_expense ->> 'paymentMethod';

  if v_id is null then raise exception 'Не передан идентификатор расхода'; end if;
  if v_amount <= 0 or v_amount > 10000000 then raise exception 'Сумма расхода должна быть больше нуля и не более 10 млн ₽'; end if;
  if coalesce(trim(p_expense ->> 'description'), '') = '' then raise exception 'Описание расхода обязательно'; end if;
  if v_method not in ('cash', 'terminal', 'transfer') then raise exception 'Неизвестный способ оплаты расхода'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then raise exception 'Общая база ещё не создана'; end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb)) e
    where e ->> 'id' = v_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if v_method = 'cash' then
    select shift ->> 'id'
      into v_shift_id
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift
    where coalesce(shift ->> 'closedAt', '') = ''
    order by shift ->> 'openedAt' desc
    limit 1;

    if v_shift_id is null then
      return jsonb_build_object(
        'ok', false,
        'financialConflict', true,
        'message', 'Для расхода наличными сначала откройте кассовую смену',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  end if;

  select coalesce(max(nullif(regexp_replace(coalesce(e ->> 'code', ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
    into v_seq
  from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb)) e;
  v_code := 'Р-' || lpad(v_seq::text, 4, '0');

  v_expense := jsonb_strip_nulls(
    p_expense ||
    jsonb_build_object(
      'id', v_id,
      'code', v_code,
      'date', coalesce(nullif(p_expense ->> 'date', ''), to_char(current_date, 'YYYY-MM-DD')),
      'status', 'Оплачено',
      'shiftId', case when v_method = 'cash' then v_shift_id else null end
    )
  );

  v_next := v_current.data || jsonb_build_object(
    'expenses', jsonb_build_array(v_expense) || coalesce(v_current.data -> 'expenses', '[]'::jsonb)
  );

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'expense_added', v_revision, array['expenses']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_add_expense(jsonb) from public;
grant execute on function public.crm_add_expense(jsonb) to authenticated;


create or replace function public.crm_confirm_supplier_refund(
  p_expense_id text,
  p_method text,
  p_operation_id text
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
  v_expense jsonb;
  v_shift_id text;
  v_expenses jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'accountant') then raise exception 'Этой роли недоступно подтверждение возврата денег'; end if;
  if p_method not in ('cash', 'terminal', 'transfer') then raise exception 'Неизвестный способ возврата'; end if;
  if coalesce(trim(p_operation_id), '') = '' then raise exception 'Не передан идентификатор операции'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  select e into v_expense
  from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb)) e
  where e ->> 'id' = p_expense_id
  limit 1;

  if v_expense is null or v_expense ->> 'source' <> 'supplier_refund' then
    return jsonb_build_object(
      'ok', false,
      'financialConflict', true,
      'message', 'Возврат поставщика не найден',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if v_expense ->> 'status' = 'Возвращено' then
    if v_expense ->> 'refundOperationId' = p_operation_id then
      return jsonb_build_object(
        'ok', true,
        'revision', v_current.revision,
        'updatedAt', v_current.updated_at,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'financialConflict', true,
      'message', 'Возврат уже подтверждён на другом устройстве',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if p_method = 'cash' then
    select shift ->> 'id'
      into v_shift_id
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift
    where coalesce(shift ->> 'closedAt', '') = ''
    order by shift ->> 'openedAt' desc
    limit 1;

    if v_shift_id is null then
      return jsonb_build_object(
        'ok', false,
        'financialConflict', true,
        'message', 'Для возврата наличными сначала откройте кассовую смену',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  end if;

  select jsonb_agg(
    case
      when e ->> 'id' = p_expense_id then
        e || jsonb_strip_nulls(jsonb_build_object(
          'status', 'Возвращено',
          'refundConfirmedAt', now(),
          'refundOperationId', p_operation_id,
          'paymentMethod', p_method,
          'shiftId', case when p_method = 'cash' then v_shift_id else null end
        ))
      else e
    end
    order by ordinality
  )
    into v_expenses
  from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb))
    with ordinality t(e, ordinality);

  v_next := v_current.data || jsonb_build_object('expenses', coalesce(v_expenses, '[]'::jsonb));

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'supplier_refund_confirmed', v_revision, array['expenses']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_confirm_supplier_refund(text, text, text) from public;
grant execute on function public.crm_confirm_supplier_refund(text, text, text) to authenticated;


create or replace function public.crm_pay_employee(
  p_employee_id text,
  p_amount numeric,
  p_method text,
  p_component text,
  p_expense_id text,
  p_note text default null
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
  v_employee jsonb;
  v_employee_name text;
  v_pay_type text;
  v_paid numeric := 0;
  v_accrued numeric := 0;
  v_balance numeric := 0;
  v_shift_id text;
  v_seq bigint;
  v_code text;
  v_expense jsonb;
  v_employees jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'accountant') then raise exception 'Этой роли недоступны выплаты зарплаты'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then raise exception 'Сумма выплаты должна быть больше нуля и не более 10 млн ₽'; end if;
  if p_method not in ('cash', 'terminal', 'transfer') then raise exception 'Неизвестный способ выплаты'; end if;
  if p_component not in ('piecework', 'salary') then raise exception 'Неизвестная часть зарплаты'; end if;
  if coalesce(trim(p_expense_id), '') = '' then raise exception 'Не передан идентификатор выплаты'; end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb)) e
    where e ->> 'id' = p_expense_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  select e into v_employee
  from jsonb_array_elements(coalesce(v_current.data -> 'employees', '[]'::jsonb)) e
  where e ->> 'id' = p_employee_id
  limit 1;

  if v_employee is null then
    return jsonb_build_object(
      'ok', false,
      'financialConflict', true,
      'message', 'Сотрудник уже изменён или удалён',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_employee_name := v_employee ->> 'name';
  v_pay_type := v_employee ->> 'payType';
  v_paid := coalesce((v_employee ->> 'paid')::numeric, 0);

  if p_component = 'piecework' then
    if v_pay_type = 'salary' then
      return jsonb_build_object(
        'ok', false,
        'financialConflict', true,
        'message', 'У сотрудника нет сдельной части зарплаты',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    select coalesce(sum(
      coalesce((w ->> 'price')::numeric, 0)
      * coalesce((w ->> 'qty')::numeric, 0)
      * (
        case
          when nullif(w ->> 'payrollPercent', '') is not null
            then greatest(0, least(100, (w ->> 'payrollPercent')::numeric))
          else greatest(0, least(100,
            coalesce(
              (v_employee ->> 'workPercent')::numeric,
              (v_employee ->> 'payValue')::numeric,
              0
            )
          ))
        end
      ) / 100
    )), 0)
      into v_accrued
    from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) o
    cross join lateral jsonb_array_elements(coalesce(o -> 'works', '[]'::jsonb)) w
    where o ->> 'status' = 'выдан'
      and w ->> 'executor' = v_employee_name;

    v_accrued := round(v_accrued);
    v_balance := greatest(0, v_accrued - v_paid);

    if p_amount > v_balance + 0.0001 then
      return jsonb_build_object(
        'ok', false,
        'financialConflict', true,
        'message', format('По проценту к выплате осталось %s ₽', v_balance),
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  else
    if v_pay_type = 'percent' then
      return jsonb_build_object(
        'ok', false,
        'financialConflict', true,
        'message', 'У сотрудника нет окладной части зарплаты',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  end if;

  if p_method = 'cash' then
    select shift ->> 'id'
      into v_shift_id
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift
    where coalesce(shift ->> 'closedAt', '') = ''
    order by shift ->> 'openedAt' desc
    limit 1;

    if v_shift_id is null then
      return jsonb_build_object(
        'ok', false,
        'financialConflict', true,
        'message', 'Для выплаты наличными сначала откройте кассовую смену',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  end if;

  select coalesce(max(nullif(regexp_replace(coalesce(e ->> 'code', ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
    into v_seq
  from jsonb_array_elements(coalesce(v_current.data -> 'expenses', '[]'::jsonb)) e;
  v_code := 'Р-' || lpad(v_seq::text, 4, '0');

  v_expense := jsonb_strip_nulls(jsonb_build_object(
    'id', p_expense_id,
    'code', v_code,
    'date', to_char(current_date, 'YYYY-MM-DD'),
    'category', 'Зарплата',
    'description', case when p_component = 'piecework'
      then 'Выплата %: ' || v_employee_name
      else 'Оклад: ' || v_employee_name
    end,
    'amount', round(p_amount),
    'counterparty', v_employee_name,
    'status', 'Оплачено',
    'source', case when p_component = 'piecework' then 'payroll' else null end,
    'paymentMethod', p_method,
    'shiftId', case when p_method = 'cash' then v_shift_id else null end,
    'employeeId', p_employee_id,
    'comment', nullif(trim(coalesce(p_note, '')), '')
  ));

  select jsonb_agg(
    case
      when e ->> 'id' = p_employee_id then
        e || jsonb_strip_nulls(jsonb_build_object(
          'paid',
            case
              when p_component = 'piecework' or v_pay_type = 'salary'
                then v_paid + round(p_amount)
              else v_paid
            end,
          'lastPaidAt', now()
        ))
      else e
    end
    order by ordinality
  )
    into v_employees
  from jsonb_array_elements(coalesce(v_current.data -> 'employees', '[]'::jsonb))
    with ordinality t(e, ordinality);

  v_next := v_current.data || jsonb_build_object(
    'employees', coalesce(v_employees, '[]'::jsonb),
    'expenses', jsonb_build_array(v_expense) || coalesce(v_current.data -> 'expenses', '[]'::jsonb)
  );

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(v_workshop, auth.uid(), v_display, 'employee_paid', v_revision, array['employees', 'expenses']);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_pay_employee(text, numeric, text, text, text, text) from public;
grant execute on function public.crm_pay_employee(text, numeric, text, text, text, text) to authenticated;


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
    'latestMigration', 15,
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
      'idempotent-financial-mutations'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
