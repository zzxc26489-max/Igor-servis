-- Этап 12: отчёт о версии серверных миграций.
-- Выполнять ПОСЛЕ supabase/011_atomic_stock_receiving_returns.sql.
--
-- Позволяет интерфейсу Settings показать, что серверная схема действительно
-- обновлена до версии, на которую рассчитывает текущий фронтенд.

create or replace function public.crm_server_capabilities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_workshop uuid;
begin
  select m.workshop_id
    into v_workshop
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  return jsonb_build_object(
    'latestMigration', 12,
    'features', jsonb_build_array(
      'role-security',
      'order-media',
      'atomic-stock-reservation',
      'atomic-order-payments',
      'atomic-cash-shifts',
      'advisor-stock-sync',
      'atomic-stock-receive-return'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
