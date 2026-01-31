create table if not exists public.admin_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.admin_settings enable row level security;

create policy if not exists "Admin read settings"
  on public.admin_settings
  for select
  using (public.is_admin());

create policy if not exists "Admin write settings"
  on public.admin_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());
