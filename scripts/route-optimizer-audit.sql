-- Route optimizer audit tables

create table if not exists public.route_optimizer_runs (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  auth_user_id uuid references auth.users(id) on delete set null,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'success',
  locations_count int,
  start_index int,
  duration_ms int,
  request_payload jsonb,
  response_payload jsonb,
  error text
);

create index if not exists idx_route_optimizer_runs_trace_id
  on public.route_optimizer_runs (trace_id);
create index if not exists idx_route_optimizer_runs_created_at
  on public.route_optimizer_runs (created_at desc);

create table if not exists public.route_optimizer_decisions (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  auth_user_id uuid references auth.users(id) on delete set null,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  action text not null check (action in ('accept','reject')),
  route_payload jsonb,
  metadata jsonb
);

create index if not exists idx_route_optimizer_decisions_trace_id
  on public.route_optimizer_decisions (trace_id);
create index if not exists idx_route_optimizer_decisions_created_at
  on public.route_optimizer_decisions (created_at desc);

alter table public.route_optimizer_runs enable row level security;
alter table public.route_optimizer_decisions enable row level security;

create policy "Admins can read optimizer runs"
  on public.route_optimizer_runs for select
  using (exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  ));

create policy "Admins can insert optimizer runs"
  on public.route_optimizer_runs for insert
  with check (exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  ));

create policy "Admins can read optimizer decisions"
  on public.route_optimizer_decisions for select
  using (exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  ));

create policy "Admins can insert optimizer decisions"
  on public.route_optimizer_decisions for insert
  with check (exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  ));
