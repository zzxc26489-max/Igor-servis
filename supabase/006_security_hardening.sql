-- Этап 6: усиление серверной безопасности.
-- Выполнять ПОСЛЕ supabase/005_order_media_storage.sql.

-- Пересоздаём политики Storage: механик может добавлять медиа только к своим заказам,
-- но удаление серверных файлов разрешено только владельцу, партнёру и приёмщику.
drop policy if exists "order_media_select" on storage.objects;
drop policy if exists "order_media_insert" on storage.objects;
drop policy if exists "order_media_delete" on storage.objects;

revoke all on function public.crm_can_access_order_media(text, boolean) from public, authenticated;
drop function if exists public.crm_can_access_order_media(text, boolean);

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
  v_data jsonb;
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    return false;
  end if;

  v_path_workshop := nullif(split_part(p_object_name, '/', 1), '');
  v_order_id := nullif(split_part(p_object_name, '/', 2), '');

  if v_path_workshop is null or v_path_workshop <> v_workshop::text or v_order_id is null then
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
    return not p_write;
  end if;

  if v_role <> 'mechanic' then
    return false;
  end if;

  select s.data into v_data
  from public.crm_state s
  where s.workshop_id = v_workshop;

  return exists (
    select 1
    from jsonb_array_elements(coalesce(v_data -> 'orders', '[]'::jsonb)) order_item
    where order_item ->> 'id' = v_order_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(order_item -> 'works', '[]'::jsonb)) work
        where work ->> 'executor' = v_display
      )
  );
end;
$fn$;

revoke all on function public.crm_can_access_order_media(text, boolean, boolean) from public;
grant execute on function public.crm_can_access_order_media(text, boolean, boolean) to authenticated;

create policy "order_media_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'order-media'
  and public.crm_can_access_order_media(name, false, false)
);

create policy "order_media_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'order-media'
  and public.crm_can_access_order_media(name, true, false)
);

create policy "order_media_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'order-media'
  and public.crm_can_access_order_media(name, true, true)
);

-- Сервер сам проверяет, что заказ действительно назначен этому механику.
-- Нельзя подставить ID чужого заказа и перевести его в работу или изменить его медиа.
create or replace function public.crm_merge_mechanic_orders(
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
        else
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  current_order.item,
                  '{status}',
                  case
                    when current_order.item ->> 'status' in ('запись', 'диагностика')
                         and incoming.item ->> 'status' = 'в работе'
                      then '"в работе"'::jsonb
                    else coalesce(current_order.item -> 'status', '"запись"'::jsonb)
                  end,
                  true
                ),
                '{timeline}',
                case
                  when current_order.item ->> 'status' in ('запись', 'диагностика')
                       and incoming.item ->> 'status' = 'в работе'
                    then coalesce(current_order.item -> 'timeline', '[]'::jsonb)
                      || jsonb_build_array(jsonb_build_object(
                        'status', 'в работе',
                        'at', now(),
                        'actor', p_display
                      ))
                  else coalesce(current_order.item -> 'timeline', '[]'::jsonb)
                end,
                true
              ),
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
            ),
            '{media}',
            coalesce(current_order.item -> 'media', '[]'::jsonb)
              || coalesce((
                select jsonb_agg(candidate)
                from jsonb_array_elements(coalesce(incoming.item -> 'media', '[]'::jsonb)) candidate
                where not exists (
                  select 1
                  from jsonb_array_elements(coalesce(current_order.item -> 'media', '[]'::jsonb)) existing
                  where existing ->> 'id' = candidate ->> 'id'
                )
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
  ) incoming on true
  left join lateral (
    select exists (
      select 1
      from jsonb_array_elements(coalesce(current_order.item -> 'works', '[]'::jsonb)) work
      where work ->> 'executor' = p_display
    ) as allowed
  ) permission on true;
$fn$;

revoke all on function public.crm_merge_mechanic_orders(jsonb, jsonb, text) from public;
