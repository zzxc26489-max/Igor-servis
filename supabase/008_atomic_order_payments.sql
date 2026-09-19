-- Этап 8: атомарные оплаты и возвраты по заказу.
-- Выполнять ПОСЛЕ supabase/007_atomic_stock_reservation.sql.
--
-- Сервер блокирует строку общей базы на время денежной операции.
-- Это исключает двойную оплату одного и того же остатка с разных устройств.

create or replace function public.crm_apply_order_payment(
  p_order_id text,
  p_kind text,
  p_entries jsonb,
  p_employee text default null
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
  v_order jsonb;
  v_orders jsonb;
  v_payments jsonb;
  v_entry jsonb;
  v_new_payments jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_works numeric := 0;
  v_parts numeric := 0;
  v_discount numeric := 0;
  v_due numeric := 0;
  v_debt numeric := 0;
  v_next_paid numeric := 0;
  v_shift_id text;
  v_revision bigint;
  v_next jsonb;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  if v_role not in ('owner', 'partner', 'advisor', 'accountant') then
    raise exception 'Этой роли недоступны оплаты клиентов';
  end if;

  if p_kind not in ('payment', 'refund') then
    raise exception 'Неизвестный тип денежной операции';
  end if;

  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Не переданы суммы оплаты';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  select item into v_order
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
  where item ->> 'id' = p_order_id
  limit 1;

  if v_order is null then
    return jsonb_build_object(
      'ok', false,
      'paymentConflict', true,
      'message', 'Заказ-наряд уже изменён или не найден',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  -- Идемпотентность: если все переданные id уже есть в журнале,
  -- считаем повтор запроса успешно обработанным.
  if not exists (
    select 1
    from jsonb_array_elements(p_entries) e
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(v_current.data -> 'payments', '[]'::jsonb)) p
      where p ->> 'id' = e ->> 'id'
    )
  ) then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display),
      'updatedAt', v_current.updated_at
    );
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    if coalesce(v_entry ->> 'id', '') = '' then
      raise exception 'У операции нет идентификатора';
    end if;
    if (v_entry ->> 'method') not in ('cash', 'terminal', 'transfer') then
      raise exception 'Неизвестный способ оплаты';
    end if;
    if coalesce((v_entry ->> 'amount')::numeric, 0) <= 0 then
      raise exception 'Сумма должна быть больше нуля';
    end if;
    v_total := v_total + round((v_entry ->> 'amount')::numeric);
  end loop;

  select coalesce(sum(coalesce((w ->> 'price')::numeric, 0) * coalesce((w ->> 'qty')::numeric, 0)), 0)
    into v_works
  from jsonb_array_elements(coalesce(v_order -> 'works', '[]'::jsonb)) w;

  select coalesce(sum(coalesce((p ->> 'price')::numeric, 0) * coalesce((p ->> 'qty')::numeric, 0)), 0)
    into v_parts
  from jsonb_array_elements(coalesce(v_order -> 'parts', '[]'::jsonb)) p;

  v_discount := coalesce((v_order ->> 'discount')::numeric, 0);
  v_paid := greatest(0, coalesce((v_order ->> 'paid')::numeric, 0));
  v_due := v_works + v_parts - v_discount;
  v_debt := greatest(0, v_due - v_paid);

  if p_kind = 'payment' and v_total > v_debt + 0.0001 then
    return jsonb_build_object(
      'ok', false,
      'paymentConflict', true,
      'message', format('Остаток долга уже %s ₽. Обновите заказ перед оплатой.', v_debt),
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if p_kind = 'refund' and v_total > v_paid + 0.0001 then
    return jsonb_build_object(
      'ok', false,
      'paymentConflict', true,
      'message', format('Вернуть можно не больше уже оплаченных %s ₽', v_paid),
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_entries) e where e ->> 'method' = 'cash'
  ) then
    select shift ->> 'id'
      into v_shift_id
    from jsonb_array_elements(coalesce(v_current.data -> 'cashShifts', '[]'::jsonb)) shift
    where coalesce(shift ->> 'closedAt', '') = ''
    order by shift ->> 'openedAt' desc
    limit 1;

    if v_shift_id is null then
      return jsonb_build_object(
        'ok', false,
        'paymentConflict', true,
        'message', case when p_kind = 'refund'
          then 'Для возврата наличными сначала откройте кассовую смену'
          else 'Для оплаты наличными сначала откройте кассовую смену'
        end,
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;
  end if;

  v_payments := coalesce(v_current.data -> 'payments', '[]'::jsonb);

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    if exists (
      select 1 from jsonb_array_elements(v_payments) p
      where p ->> 'id' = v_entry ->> 'id'
    ) then
      continue;
    end if;

    v_new_payments := v_new_payments || jsonb_build_array(
      jsonb_build_object(
        'id', v_entry ->> 'id',
        'orderId', p_order_id,
        'at', now(),
        'amount', round((v_entry ->> 'amount')::numeric),
        'kind', p_kind,
        'method', v_entry ->> 'method',
        'employee', coalesce(nullif(trim(p_employee), ''), v_display),
        'shiftId', case when v_entry ->> 'method' = 'cash' then v_shift_id else null end
      )
    );
  end loop;

  v_next_paid := case
    when p_kind = 'payment' then v_paid + v_total
    else greatest(0, v_paid - v_total)
  end;

  select jsonb_agg(
    case
      when item ->> 'id' = p_order_id
        then jsonb_set(item, '{paid}', to_jsonb(v_next_paid), true)
      else item
    end
    order by ordinality
  )
    into v_orders
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb))
    with ordinality t(item, ordinality);

  v_next := v_current.data || jsonb_build_object(
    'orders', coalesce(v_orders, '[]'::jsonb),
    'payments', v_new_payments || v_payments
  );

  update public.crm_state
  set data = v_next,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(
    v_workshop,
    auth.uid(),
    v_display,
    case when p_kind = 'refund' then 'client_refund' else 'client_payment' end,
    v_revision,
    array['orders', 'payments']
  );

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_apply_order_payment(text, text, jsonb, text) from public;
grant execute on function public.crm_apply_order_payment(text, text, jsonb, text) to authenticated;
