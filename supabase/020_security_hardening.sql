-- Этап 20: дополнительное усиление безопасности.
-- Выполнять ПОСЛЕ supabase/019_review_fixes.sql.

-- Повторно фиксируем приватность и ограничения bucket на случай ручных изменений.
update storage.buckets
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]
where id = 'order-media';

-- Доступ к Storage разрешаем только для существующего заказа, строго по пути
-- <workshop>/<order>/<media>.<allowed-extension>. Это закрывает загрузку
-- "сиротских" объектов в произвольные пути даже при прямом обращении к Storage API.
create or replace function public.crm_can_access_order_media(
  p_object_name text,
  p_write boolean default false,
  p_delete boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_workshop uuid;
  v_role text;
  v_display text;
  v_path_workshop text;
  v_order_id text;
  v_file_name text;
  v_data jsonb;
  v_order_exists boolean := false;
  v_assigned boolean := false;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    return false;
  end if;

  v_path_workshop := nullif(split_part(p_object_name, '/', 1), '');
  v_order_id := nullif(split_part(p_object_name, '/', 2), '');
  v_file_name := nullif(split_part(p_object_name, '/', 3), '');

  if v_path_workshop is null
     or v_path_workshop <> v_workshop::text
     or v_order_id is null
     or v_file_name is null
     or split_part(p_object_name, '/', 4) <> ''
     or v_file_name !~* '^[a-zA-Z0-9_-]+\.(jpe?g|png|webp|heic|heif|mp4|webm|mov)$'
  then
    return false;
  end if;

  select s.data into v_data
  from public.crm_state s
  where s.workshop_id = v_workshop;

  if v_data is null then
    return false;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_data -> 'orders', '[]'::jsonb)) order_item
    where order_item ->> 'id' = v_order_id
  ) into v_order_exists;

  if not v_order_exists then
    return false;
  end if;

  if p_delete and v_role not in ('owner', 'partner', 'advisor') then
    return false;
  end if;

  if p_write and v_role not in ('owner', 'partner', 'advisor', 'mechanic') then
    return false;
  end if;

  if v_role in ('owner', 'partner', 'advisor') then
    return true;
  end if;

  if v_role = 'parts' then
    return not p_write and not p_delete;
  end if;

  if v_role <> 'mechanic' then
    return false;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_data -> 'orders', '[]'::jsonb)) order_item
    where order_item ->> 'id' = v_order_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(order_item -> 'works', '[]'::jsonb)) work
        where work ->> 'executor' = v_display
      )
  ) into v_assigned;

  return v_assigned;
end;
$fn$;

revoke all on function public.crm_can_access_order_media(text, boolean, boolean) from public;
grant execute on function public.crm_can_access_order_media(text, boolean, boolean) to authenticated;

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
    'latestMigration', 20,
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
      'security-hardening-020'
    )
  );
end;
$fn$;

revoke all on function public.crm_server_capabilities() from public;
grant execute on function public.crm_server_capabilities() to authenticated;
