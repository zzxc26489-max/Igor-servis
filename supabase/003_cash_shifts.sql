-- Этап кассовых смен.
-- Выполнять ПОСЛЕ supabase/002_role_security_admin_tools.sql.
-- Кассовые смены доступны только владельцу/партнёру и не уходят в браузер
-- приёмщика или запчастиста.

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
      'invoices', '[]'::jsonb,
      'cashShifts', '[]'::jsonb
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
    'expenses', v_expenses,
    'cashShifts', '[]'::jsonb
  );
end;
$$;

revoke all on function public.crm_role_view(jsonb, text) from public;
