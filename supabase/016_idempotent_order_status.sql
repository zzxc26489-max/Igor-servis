-- Этап 16: идемпотентная смена статуса и выдача автомобиля.
-- Выполнять ПОСЛЕ supabase/015_idempotent_financial_mutations.sql.
--
-- Статус заказа, списание/возврат склада, завершение работ и фиксация
-- payrollPercent выполняются в одной транзакции. Повтор уже применённого
-- перехода является успешным no-op и не создаёт второе движение склада.

create or replace function public.crm_set_order_status(
  p_order_id text,
  p_status text,
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
  v_order jsonb;
  v_old_status text;
  v_was_issued boolean;
  v_will_issue boolean;
  v_now timestamptz := now();
  v_works jsonb;
  v_work jsonb;
  v_sessions jsonb;
  v_last_session jsonb;
  v_executor text;
  v_employee jsonb;
  v_percent numeric;
  v_timeline jsonb;
  v_last_status text;
  v_parts jsonb;
  v_part jsonb;
  v_stock_item jsonb;
  v_stock jsonb;
  v_movements jsonb := '[]'::jsonb;
  v_movement jsonb;
  v_stock_qty numeric;
  v_due numeric := 0;
  v_paid numeric := 0;
  v_orders jsonb;
  v_next_order jsonb;
  v_next jsonb;
  v_revision bigint;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then raise exception 'Для этого пользователя не назначен автосервис'; end if;
  if v_role not in ('owner', 'partner', 'advisor') then
    raise exception 'Этой роли недоступна смена статуса заказ-наряда';
  end if;
  if p_status not in ('запись', 'диагностика', 'в работе', 'ожидает запчасти', 'готово', 'выдан') then
    raise exception 'Неизвестный статус заказ-наряда';
  end if;
  if coalesce(trim(p_operation_id), '') = '' then
    raise exception 'Не передан идентификатор операции';
  end if;

  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then raise exception 'Общая база ещё не создана'; end if;

  select item into v_order
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb)) item
  where item ->> 'id' = p_order_id
  limit 1;

  if v_order is null then
    return jsonb_build_object(
      'ok', false,
      'orderConflict', true,
      'message', 'Заказ-наряд уже удалён или не найден',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_old_status := v_order ->> 'status';

  -- Идемпотентность по факту состояния: если переход уже применён,
  -- повтор не должен второй раз менять склад или историю.
  if v_old_status = p_status then
    return jsonb_build_object(
      'ok', true,
      'revision', v_current.revision,
      'updatedAt', v_current.updated_at,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  v_was_issued := v_old_status = 'выдан';
  v_will_issue := p_status = 'выдан';
  v_parts := coalesce(v_order -> 'parts', '[]'::jsonb);
  v_works := coalesce(v_order -> 'works', '[]'::jsonb);

  if p_status = 'готово' and exists (
    select 1 from jsonb_array_elements(v_parts) p where p ->> 'availability' = 'ordered'
  ) then
    return jsonb_build_object(
      'ok', false,
      'orderConflict', true,
      'message', 'Нельзя завершить заказ: есть ещё не полученные заказанные запчасти',
      'revision', v_current.revision,
      'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
    );
  end if;

  if v_will_issue then
    if v_old_status <> 'готово' then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Сначала завершите работы и переведите заказ в статус «готово»',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_works) w
      where coalesce(w ->> 'workStatus', 'planned') <> 'done'
    ) then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'Не все работы завершены',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    select
      coalesce(sum(coalesce((w ->> 'price')::numeric, 0) * coalesce((w ->> 'qty')::numeric, 0)), 0)
      + coalesce((
        select sum(coalesce((p ->> 'price')::numeric, 0) * coalesce((p ->> 'qty')::numeric, 0))
        from jsonb_array_elements(v_parts) p
      ), 0)
      - coalesce((v_order ->> 'discount')::numeric, 0)
      into v_due
    from jsonb_array_elements(v_works) w;

    v_paid := coalesce((v_order ->> 'paid')::numeric, 0);
    if v_paid > v_due + 0.0001 then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'По заказу есть переплата. Сначала оформите возврат клиенту или скорректируйте сумму заказа.',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_parts) p where p ->> 'availability' = 'ordered'
    ) then
      return jsonb_build_object(
        'ok', false,
        'orderConflict', true,
        'message', 'В заказе остались запчасти со статусом «заказана»',
        'revision', v_current.revision,
        'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
      );
    end if;

    for v_part in select * from jsonb_array_elements(v_parts)
    loop
      if coalesce(v_part ->> 'sku', '') = '' then
        continue;
      end if;

      select item into v_stock_item
      from jsonb_array_elements(coalesce(v_current.data -> 'stock', '[]'::jsonb)) item
      where item ->> 'sku' = v_part ->> 'sku'
      limit 1;

      if v_stock_item is null then
        if v_part ->> 'availability' = 'reserved' then
          return jsonb_build_object(
            'ok', false,
            'orderConflict', true,
            'message', format('Резервная запчасть «%s» больше не найдена на складе', v_part ->> 'name'),
            'revision', v_current.revision,
            'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
          );
        end if;
        continue;
      end if;

      v_stock_qty := coalesce((v_stock_item ->> 'qty')::numeric, 0);
      if coalesce((v_part ->> 'qty')::numeric, 0) > v_stock_qty + 0.0001 then
        return jsonb_build_object(
          'ok', false,
          'orderConflict', true,
          'message', format(
            'Недостаточно «%s»: на складе %s %s',
            v_stock_item ->> 'name',
            v_stock_qty,
            coalesce(v_stock_item ->> 'unit', 'шт.')
          ),
          'revision', v_current.revision,
          'data', public.crm_role_view_v2(v_current.data, v_role, v_display)
        );
      end if;
    end loop;
  end if;

  -- При переходе в «готово» завершаем все работы и закрываем открытую сессию.
  if p_status = 'готово' then
    select coalesce(jsonb_agg(
      case
        when jsonb_array_length(coalesce(w -> 'workSessions', '[]'::jsonb)) > 0
          and coalesce((w -> 'workSessions' -> (jsonb_array_length(w -> 'workSessions') - 1)) ->> 'endedAt', '') = ''
        then jsonb_set(
          jsonb_set(w, '{workStatus}', '"done"'::jsonb, true),
          '{workSessions}',
          (
            select jsonb_agg(
              case
                when ordinality = jsonb_array_length(w -> 'workSessions')
                  then s || jsonb_build_object('endedAt', v_now)
                else s
              end
              order by ordinality
            )
            from jsonb_array_elements(w -> 'workSessions') with ordinality t(s, ordinality)
          ),
          true
        )
        else jsonb_set(w, '{workStatus}', '"done"'::jsonb, true)
      end
    ), '[]'::jsonb)
      into v_works
    from jsonb_array_elements(v_works) w;
  end if;

  -- При выдаче фиксируем процент оплаты на момент выдачи.
  if v_will_issue then
    select coalesce(jsonb_agg(
      case
        when coalesce(w ->> 'executor', '') = '' or nullif(w ->> 'payrollPercent', '') is not null then w
        else
          jsonb_set(
            w,
            '{payrollPercent}',
            to_jsonb(
              coalesce((
                select case
                  when e ->> 'payType' = 'salary' then 0
                  else greatest(0, least(100,
                    coalesce(
                      nullif(e ->> 'workPercent', '')::numeric,
                      nullif(e ->> 'payValue', '')::numeric,
                      0
                    )
                  ))
                end
                from jsonb_array_elements(coalesce(v_current.data -> 'employees', '[]'::jsonb)) e
                where e ->> 'name' = w ->> 'executor'
                limit 1
              ), 0)
            ),
            true
          )
      end
    ), '[]'::jsonb)
      into v_works
    from jsonb_array_elements(v_works) w;
  elsif v_was_issued then
    select coalesce(jsonb_agg(w - 'payrollPercent'), '[]'::jsonb)
      into v_works
    from jsonb_array_elements(v_works) w;
  end if;

  v_timeline := coalesce(v_order -> 'timeline', '[]'::jsonb);
  if jsonb_array_length(v_timeline) = 0 then
    v_timeline := jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'status', v_old_status,
        'at', coalesce(nullif(v_order ->> 'createdAt', ''), v_now::text),
        'actor', coalesce(nullif(v_display, ''), nullif(v_order ->> 'advisor', ''))
      ))
    );
  elsif (v_timeline -> (jsonb_array_length(v_timeline) - 1)) ->> 'status' <> v_old_status then
    v_timeline := v_timeline || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'status', v_old_status,
        'at', coalesce(
          (v_timeline -> (jsonb_array_length(v_timeline) - 1)) ->> 'at',
          v_order ->> 'createdAt',
          v_now::text
        ),
        'actor', coalesce(nullif(v_display, ''), nullif(v_order ->> 'advisor', ''))
      ))
    );
  end if;

  v_timeline := v_timeline || jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object(
      'status', p_status,
      'at', v_now,
      'actor', coalesce(nullif(v_display, ''), nullif(v_order ->> 'advisor', ''))
    ))
  );

  v_next_order :=
    (v_order
      - 'completedAt'
      - 'issuedAt'
      - 'issuedAtEstimated'
      - 'status'
      - 'timeline'
      - 'works'
      - 'lastStatusOperationId')
    || jsonb_build_object(
      'status', p_status,
      'timeline', v_timeline,
      'works', v_works,
      'lastStatusOperationId', p_operation_id
    );

  if p_status = 'готово' then
    v_next_order := v_next_order || jsonb_build_object(
      'completedAt', coalesce(nullif(v_order ->> 'completedAt', ''), v_now::text)
    );
  elsif p_status = 'выдан' then
    v_next_order := v_next_order || jsonb_build_object(
      'completedAt', coalesce(nullif(v_order ->> 'completedAt', ''), v_now::text),
      'issuedAt', v_now,
      'issuedAtEstimated', false
    );
  elsif not v_was_issued then
    -- Для обычных статусов completedAt/issuedAt очищены выше.
    null;
  end if;

  if v_was_issued and not v_will_issue and p_status <> 'готово' then
    v_next_order := v_next_order - 'completedAt';
  end if;

  -- Списание/возврат склада только при пересечении границы «выдан».
  if v_was_issued <> v_will_issue then
    v_stock := coalesce(v_current.data -> 'stock', '[]'::jsonb);

    for v_part in select * from jsonb_array_elements(v_parts)
    loop
      if coalesce(v_part ->> 'sku', '') = '' then
        continue;
      end if;

      select item into v_stock_item
      from jsonb_array_elements(v_stock) item
      where item ->> 'sku' = v_part ->> 'sku'
      limit 1;

      if v_stock_item is null then
        continue;
      end if;

      select jsonb_agg(
        case
          when item ->> 'id' = v_stock_item ->> 'id' then
            jsonb_set(
              item,
              '{qty}',
              to_jsonb(
                coalesce((item ->> 'qty')::numeric, 0)
                + case when v_will_issue then -1 else 1 end * coalesce((v_part ->> 'qty')::numeric, 0)
              ),
              true
            )
          else item
        end
        order by ordinality
      )
        into v_stock
      from jsonb_array_elements(v_stock) with ordinality t(item, ordinality);

      v_movement := jsonb_strip_nulls(jsonb_build_object(
        'id', p_operation_id || ':' || coalesce(v_part ->> 'id', md5(v_part::text)),
        'date', v_now,
        'itemId', v_stock_item ->> 'id',
        'operation', case when v_will_issue then 'Списание' else 'Возврат' end,
        'qty', coalesce((v_part ->> 'qty')::numeric, 0),
        'from', case when v_will_issue then v_stock_item ->> 'cell' else null end,
        'to', case when v_will_issue then null else v_stock_item ->> 'cell' end,
        'employee', coalesce(nullif(v_order ->> 'advisor', ''), v_display, '—'),
        'note', 'Заказ-наряд ' || coalesce(v_order ->> 'number', p_order_id)
      ));
      v_movements := v_movements || jsonb_build_array(v_movement);
    end loop;
  else
    v_stock := coalesce(v_current.data -> 'stock', '[]'::jsonb);
  end if;

  select jsonb_agg(
    case when item ->> 'id' = p_order_id then v_next_order else item end
    order by ordinality
  )
    into v_orders
  from jsonb_array_elements(coalesce(v_current.data -> 'orders', '[]'::jsonb))
    with ordinality t(item, ordinality);

  v_next := v_current.data || jsonb_build_object(
    'orders', coalesce(v_orders, '[]'::jsonb),
    'stock', coalesce(v_stock, '[]'::jsonb),
    'stockMovements', v_movements || coalesce(v_current.data -> 'stockMovements', '[]'::jsonb)
  );

  update public.crm_state
  set data = v_next, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where workshop_id = v_workshop
  returning revision into v_revision;

  insert into public.crm_audit(workshop_id, actor_id, actor_name, action, revision, changed_sections)
  values(
    v_workshop,
    auth.uid(),
    v_display,
    case when v_will_issue then 'order_issued'
         when v_was_issued then 'order_reopened'
         else 'order_status_changed'
    end,
    v_revision,
    case when v_was_issued <> v_will_issue
      then array['orders', 'stock', 'stockMovements']
      else array['orders']
    end
  );

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', now(),
    'data', public.crm_role_view_v2(v_next, v_role, v_display)
  );
end;
$fn$;

revoke all on function public.crm_set_order_status(text, text, text) from public;
grant execute on function public.crm_set_order_status(text, text, text) to authenticated;

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
    'latestMigration', 16,
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
      'idempotent-order-status'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
