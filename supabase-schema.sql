create table if not exists public.memory_tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (subject in ('英语','地理','历史','生物')),
  title text not null,
  content text not null default '',
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memory_tasks enable row level security;

drop policy if exists "memory_tasks_select_own" on public.memory_tasks;
drop policy if exists "memory_tasks_insert_own" on public.memory_tasks;
drop policy if exists "memory_tasks_update_own" on public.memory_tasks;
drop policy if exists "memory_tasks_delete_own" on public.memory_tasks;

create policy "memory_tasks_select_own" on public.memory_tasks for select using (auth.uid() = user_id);
create policy "memory_tasks_insert_own" on public.memory_tasks for insert with check (auth.uid() = user_id);
create policy "memory_tasks_update_own" on public.memory_tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "memory_tasks_delete_own" on public.memory_tasks for delete using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memory_tasks'
  ) then
    alter publication supabase_realtime add table public.memory_tasks;
  end if;
end $$;
