begin;

create table if not exists public.admin_dashboard_sessions (
  auth_user_id uuid primary key,
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  auth_last_sign_in_at timestamptz null,
  session_started_at timestamptz not null,
  last_seen_at timestamptz not null,
  session_expires_at timestamptz not null,
  entry_path text null,
  source_ip text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_dashboard_sessions_admin_user_id
  on public.admin_dashboard_sessions (admin_user_id);

create index if not exists idx_admin_dashboard_sessions_expires_at
  on public.admin_dashboard_sessions (session_expires_at);

alter table public.admin_dashboard_sessions enable row level security;

commit;