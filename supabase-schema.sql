create extension if not exists pgcrypto;

create table if not exists public.memory_tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  family_key text not null default 'memory-route',
  subject text not null check (subject in ('英语','地理','历史','生物')),
  title text not null,
  content text not null default '',
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memory_tasks add column if not exists family_key text not null default 'memory-route';
alter table public.memory_tasks alter column user_id drop not null;
alter table public.memory_tasks enable row level security;

create table if not exists public.memory_route_settings (
  setting_key text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.memory_route_settings enable row level security;

drop policy if exists "memory_tasks_select_own" on public.memory_tasks;
drop policy if exists "memory_tasks_insert_own" on public.memory_tasks;
drop policy if exists "memory_tasks_update_own" on public.memory_tasks;
drop policy if exists "memory_tasks_delete_own" on public.memory_tasks;
drop policy if exists "memory_tasks_public_read" on public.memory_tasks;
create policy "memory_tasks_public_read" on public.memory_tasks
  for select to anon, authenticated using (family_key = 'memory-route');

create or replace function public.memory_manager_verify(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.memory_route_settings
    where setting_key = 'manager_passcode'
      and secret_hash = crypt(p_code, secret_hash)
  );
$$;

create or replace function public.memory_task_upsert(
  p_code text,
  p_id text,
  p_subject text,
  p_title text,
  p_content text,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.memory_manager_verify(p_code) then raise exception '通行码不正确'; end if;
  if p_subject not in ('英语','地理','历史','生物') then raise exception '科目不支持'; end if;
  insert into public.memory_tasks (id, user_id, family_key, subject, title, content, answers, created_at, updated_at)
  values (p_id, null, 'memory-route', p_subject, p_title, p_content, coalesce(p_answers, '[]'::jsonb), now(), now())
  on conflict (id) do update set
    subject = excluded.subject,
    title = excluded.title,
    content = excluded.content,
    answers = excluded.answers,
    family_key = 'memory-route',
    updated_at = now();
end;
$$;

create or replace function public.memory_task_delete(p_code text, p_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.memory_manager_verify(p_code) then raise exception '通行码不正确'; end if;
  delete from public.memory_tasks where id = p_id and family_key = 'memory-route';
end;
$$;

revoke all on function public.memory_manager_verify(text) from public;
revoke all on function public.memory_task_upsert(text,text,text,text,text,jsonb) from public;
revoke all on function public.memory_task_delete(text,text) from public;
grant execute on function public.memory_manager_verify(text) to anon, authenticated;
grant execute on function public.memory_task_upsert(text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.memory_task_delete(text,text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memory_tasks'
  ) then
    alter publication supabase_realtime add table public.memory_tasks;
  end if;
end $$;

-- 在 Supabase SQL Editor 单独执行下面语句设置通行码，切勿把真实通行码提交到 GitHub：
-- insert into public.memory_route_settings (setting_key, secret_hash, updated_at)
-- values ('manager_passcode', crypt('<YOUR_MANAGER_CODE>', gen_salt('bf')), now())
-- on conflict (setting_key) do update set secret_hash = excluded.secret_hash, updated_at = now();
