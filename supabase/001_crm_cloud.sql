-- Igor-servis CRM: общая база, роли, ревизии, резервные копии и аудит.
-- Выполняется один раз в Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.crm_workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_members (
  workshop_id uuid not null references public.crm_workshops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner', 'advisor', 'parts')),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workshop_id, user_id)
);

create index if not exists crm_members_user_idx on public.crm_members(user_id) where active;

create table if not exists public.crm_state (
  workshop_id uuid primary key references public.crm_workshops(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.crm_backups (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.crm_workshops(id) on delete cascade,
  revision bigint not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  reason text not null default 'automatic'
);

create index if not exists crm_backups_workshop_date_idx
  on public.crm_backups(workshop_id, created_at desc);

create table if not exists public.crm_audit (
  id bigint generated always as identity primary key,
  workshop_id uuid not null references public.crm_workshops(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_name text,
  action text not null,
  revision bigint,
  changed_sections text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists crm_audit_workshop_date_idx
  on public.crm_audit(workshop_id, created_at desc);

alter table public.crm_workshops enable row level security;
alter table public.crm_members enable row level security;
alter table public.crm_state enable row level security;
alter table public.crm_backups enable row level security;
alter table public.crm_audit enable row level security;

-- Прямой доступ к общей JSON-базе не нужен: приложение работает только через RPC.
revoke all on public.crm_state from anon, authenticated;
revoke all on public.crm_backups from anon, authenticated;
revoke all on public.crm_audit from anon, authenticated;

drop policy if exists "member sees own workshop" on public.crm_workshops;
create policy "member sees own workshop"
  on public.crm_workshops for select to authenticated
  using (
    exists (
      select 1 from public.crm_members m
      where m.workshop_id = id and m.user_id = auth.uid() and m.active
    )
  );

drop policy if exists "member sees own membership" on public.crm_members;
create policy "member sees own membership"
  on public.crm_members for select to authenticated
  using (user_id = auth.uid() and active);

create or replace function public.crm_my_membership()
returns table(workshop_id uuid, workshop_name text, role text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select m.workshop_id, w.name, m.role, m.display_name
  from public.crm_members m
  join public.crm_workshops w on w.id = m.workshop_id
  where m.user_id = auth.uid() and m.active
  order by m.created_at
  limit 1;
$$;

revoke all on function public.crm_my_membership() from public;
grant execute on function public.crm_my_membership() to authenticated;

create or replace function public.crm_load_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_name text;
  v_role text;
  v_display text;
  v_state public.crm_state%rowtype;
begin
  select m.workshop_id, m.workshop_name, m.role, m.display_name
    into v_workshop, v_name, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  select * into v_state from public.crm_state where workshop_id = v_workshop;

  return jsonb_build_object(
    'ok', true,
    'workshopId', v_workshop,
    'workshopName', v_name,
    'role', v_role,
    'displayName', v_display,
    'revision', coalesce(v_state.revision, 0),
    'empty', v_state.workshop_id is null or v_state.data = '{}'::jsonb,
    'data', coalesce(v_state.data, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.crm_load_state() from public;
grant execute on function public.crm_load_state() to authenticated;

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
  v_revision bigint;
  v_changed text[];
begin
  select m.workshop_id, m.role, m.display_name
    into v_workshop, v_role, v_display
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;

  -- На первом этапе все сотрудники работают с общей операционной базой.
  -- Навигация и разделы ограничиваются ролью в приложении; доступ к чужому
  -- автосервису полностью блокируется здесь на сервере.
  select * into v_current
  from public.crm_state
  where workshop_id = v_workshop
  for update;

  if v_current.workshop_id is null then
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
      'data', v_current.data
    );
  end if;

  select coalesce(array_agg(k), '{}')
    into v_changed
  from (
    select key as k
    from (
      select jsonb_object_keys(v_current.data) as key
      union
      select jsonb_object_keys(p_data) as key
    ) keys
    where v_current.data -> key is distinct from p_data -> key
  ) changed;

  -- Автоматическая серверная копия не реже одного раза в сутки перед изменением.
  if not exists (
    select 1 from public.crm_backups
    where workshop_id = v_workshop
      and created_at > now() - interval '24 hours'
  ) then
    insert into public.crm_backups(workshop_id, revision, data, created_by, reason)
    values(v_workshop, v_current.revision, v_current.data, auth.uid(), 'automatic');
  end if;

  update public.crm_state
  set data = p_data,
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

create or replace function public.crm_backup_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_role text;
  v_state public.crm_state%rowtype;
  v_created timestamptz := now();
begin
  select m.workshop_id, m.role into v_workshop, v_role
  from public.crm_my_membership() m;

  if v_workshop is null then
    raise exception 'Для этого пользователя не назначен автосервис';
  end if;
  if v_role not in ('owner', 'partner') then
    raise exception 'Резервные копии доступны владельцу и партнёру';
  end if;

  select * into v_state from public.crm_state where workshop_id = v_workshop;
  if v_state.workshop_id is null then
    raise exception 'Общая база ещё не создана';
  end if;

  insert into public.crm_backups(workshop_id, revision, data, created_by, reason)
  values(v_workshop, v_state.revision, v_state.data, auth.uid(), 'manual');

  return jsonb_build_object('ok', true, 'createdAt', v_created);
end;
$$;

revoke all on function public.crm_backup_now() from public;
grant execute on function public.crm_backup_now() to authenticated;

-- Первичная настройка после создания пользователей в Authentication:
-- 1) создайте автосервис:
-- insert into public.crm_workshops(name) values ('Сервис Игоря') returning id;
-- 2) найдите UUID пользователя в Authentication -> Users и добавьте членство:
-- insert into public.crm_members(workshop_id, user_id, role, display_name)
-- values('<WORKSHOP_UUID>', '<USER_UUID>', 'owner', 'Игорь');
